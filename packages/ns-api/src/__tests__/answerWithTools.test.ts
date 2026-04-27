import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Anthropic SDK at the module level. One mocked `create` so we
// can control each round's response shape independently.
const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

vi.mock("../config.js", () => ({
  loadConfig: () => ({
    anthropicApiKey: "test-key",
    claudeModel: "claude-sonnet-4-6",
  }),
}));

// Neutralize store calls — every tool lands in this module for execution.
vi.mock("../store/noteStore.js", () => ({
  listNotes: vi.fn().mockResolvedValue({ notes: [], total: 0 }),
  listFolders: vi.fn(),
  listTags: vi.fn(),
  listFavoriteNotes: vi.fn().mockResolvedValue([]),
  listTrashedNotes: vi.fn(),
  getDashboardData: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  softDeleteNote: vi.fn(),
  restoreNote: vi.fn(),
  deleteFolderById: vi.fn(),
  renameFolder: vi.fn(),
  renameTag: vi.fn(),
  findSimilarNotes: vi.fn().mockResolvedValue([]),
}));

vi.mock("../store/linkStore.js", () => ({
  getBacklinks: vi.fn().mockResolvedValue([]),
}));

import { answerWithTools, resetClient } from "../services/aiService.js";

beforeEach(() => {
  vi.clearAllMocks();
  resetClient();
});

function searchToolUseBlock(id: string) {
  return {
    type: "tool_use",
    id,
    name: "search_notes",
    input: { query: "x" },
  };
}

async function consume<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

describe("answerWithTools — tool-call cap (Phase B.3)", () => {
  it("refuses tool calls past MAX_TOOL_CALLS_TOTAL (12)", async () => {
    // Round 1 — Claude emits 12 tool_use blocks (the cap). All should execute.
    // Round 2 — Claude emits 2 more tool_use blocks. Both should be refused.
    // Round 3 — Claude emits a final text answer.
    const round1Blocks = Array.from({ length: 12 }, (_, i) => searchToolUseBlock(`t${i}`));
    const round2Blocks = [searchToolUseBlock("t12"), searchToolUseBlock("t13")];

    mockCreate
      .mockResolvedValueOnce({ content: round1Blocks })
      .mockResolvedValueOnce({ content: round2Blocks })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "Done." }] });

    const events = await consume(answerWithTools("test question", "u1"));

    // All 12 round-1 tools were announced as tool_activity.
    const activities = events.filter((e) => e.type === "tool_activity");
    expect(activities.length).toBe(12);

    // 3 rounds → 3 create calls
    expect(mockCreate).toHaveBeenCalledTimes(3);

    // Round 2's messages array should contain the tool_result for t12 + t13
    // flagged as errors (cap reached).
    const round3Call = mockCreate.mock.calls[2][0];
    const lastUserMessage = round3Call.messages[round3Call.messages.length - 1];
    expect(Array.isArray(lastUserMessage.content)).toBe(true);
    const toolResults = (lastUserMessage.content as Array<{ type: string; is_error?: boolean; content: string; tool_use_id: string }>).filter(
      (b) => b.type === "tool_result",
    );
    expect(toolResults.length).toBe(2);
    for (const tr of toolResults) {
      expect(tr.is_error).toBe(true);
      expect(tr.content).toMatch(/tool-call limit/i);
    }
  });

  it("stops after MAX_ROUNDS (5) even with continuous tool_use", async () => {
    // Every round returns exactly one tool_use — should hit the 5-round
    // ceiling and terminate with `done` rather than looping forever.
    mockCreate.mockResolvedValue({
      content: [searchToolUseBlock("tX")],
    });

    const events = await consume(answerWithTools("test question", "u1"));

    // 5 rounds, each fires a tool_activity then loops.
    expect(mockCreate).toHaveBeenCalledTimes(5);
    expect(events.filter((e) => e.type === "done").length).toBe(1);
  });
});

describe("answerWithTools — system prompt", () => {
  // Regression: without an explicit instruction to wrap referenced
  // note titles in square brackets, Claude writes plain prose
  // ("your Meeting Notes") and Phase E.5's inline citation
  // markers never fire. The system prompt has to teach Claude the
  // [Exact Title] convention for the UI transform to have
  // anything to work with.
  it("system prompt instructs Claude to wrap note titles in [brackets] for citations", async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "ok" }] });
    await consume(answerWithTools("q", "u1"));
    const call = mockCreate.mock.calls[0][0];
    const system = call.system as string;
    expect(system).toMatch(/\[Exact Note Title\]/);
    expect(system).toMatch(/inline citation/i);
  });
});

describe("answerWithTools — history prepend (Phase A, verified in Phase B branch)", () => {
  it("prepends prior user/assistant turns to the Claude messages array", async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "ok" }] });

    const history = [
      { role: "user" as const, content: "first question" },
      { role: "assistant" as const, content: "first answer" },
    ];

    await consume(answerWithTools("follow-up", "u1", undefined, undefined, undefined, history));

    const call = mockCreate.mock.calls[0][0];
    expect(call.messages).toEqual([
      { role: "user", content: "first question" },
      { role: "assistant", content: "first answer" },
      { role: "user", content: "follow-up" },
    ]);
  });

  it("filters empty-content turns from history before sending", async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "ok" }] });

    const history = [
      { role: "user" as const, content: "real question" },
      { role: "assistant" as const, content: "   " }, // whitespace only
      { role: "assistant" as const, content: "real answer" },
    ];

    await consume(answerWithTools("next", "u1", undefined, undefined, undefined, history));

    const call = mockCreate.mock.calls[0][0];
    expect(call.messages).toEqual([
      { role: "user", content: "real question" },
      { role: "assistant", content: "real answer" },
      { role: "user", content: "next" },
    ]);
  });
});

describe("answerWithTools — autoApprove plumbing (Phase C.5)", () => {
  // A Claude tool_use for delete_note. Without autoApprove the backend
  // gates → emits a `confirmation` event. With autoApprove for that
  // specific tool the gate is bypassed → executor runs the real
  // softDeleteNote. We watch the round-2 prompt to distinguish.
  it("delete_note without autoApprove emits a confirmation event", async () => {
    const deleteBlock = {
      type: "tool_use",
      id: "t1",
      name: "delete_note",
      input: { noteTitle: "Draft" },
    };
    mockCreate
      .mockResolvedValueOnce({ content: [deleteBlock] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "done" }] });

    // No note matches → precheck fails → gate falls through to the
    // real executor (which returns "no note found"). That's not what
    // we want to assert; what we want is that mockCreate sees no
    // autoApprove behaviour change. Seed a note via listNotes mock.
    const { listNotes } = await import("../store/noteStore.js");
    (listNotes as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce({
      notes: [{
        id: "n1", userId: "u1", title: "Draft", content: "body", folder: null,
        folderId: null, tags: [], summary: null, favorite: false, sortOrder: 0,
        favoriteSortOrder: null, isLocalFile: false, audioMode: null,
        transcript: null, createdAt: new Date(), updatedAt: new Date(),
        deletedAt: null,
      }],
      total: 1,
    });

    const events = await consume(
      answerWithTools("delete Draft", "u1"),
    );

    const confirmationEvents = events.filter((e) => e.type === "confirmation");
    expect(confirmationEvents.length).toBe(1);
    expect(confirmationEvents[0].confirmation?.toolName).toBe("delete_note");
  });

  it("delete_note with autoApprove.deleteNote=true bypasses the gate", async () => {
    const deleteBlock = {
      type: "tool_use",
      id: "t1",
      name: "delete_note",
      input: { noteTitle: "Draft" },
    };
    mockCreate
      .mockResolvedValueOnce({ content: [deleteBlock] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "done" }] });

    const { listNotes, softDeleteNote } = await import("../store/noteStore.js");
    (listNotes as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce({
      notes: [{
        id: "n1", userId: "u1", title: "Draft", content: "body", folder: null,
        folderId: null, tags: [], summary: null, favorite: false, sortOrder: 0,
        favoriteSortOrder: null, isLocalFile: false, audioMode: null,
        transcript: null, createdAt: new Date(), updatedAt: new Date(),
        deletedAt: null,
      }],
      total: 1,
    });
    (softDeleteNote as unknown as { mockResolvedValueOnce: (v: unknown) => void })
      .mockResolvedValueOnce(true);

    const events = await consume(
      answerWithTools(
        "delete Draft",
        "u1",
        undefined,
        undefined,
        undefined,
        undefined,
        { deleteNote: true },
      ),
    );

    // No confirmation surfaces — tool ran directly.
    expect(events.filter((e) => e.type === "confirmation").length).toBe(0);
    // softDeleteNote was invoked on the target.
    expect(softDeleteNote).toHaveBeenCalledWith("u1", "n1");
  });

  it("logs token usage per round when a logger is provided (Phase D.1)", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "short answer" }],
      usage: { input_tokens: 1234, output_tokens: 56, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    });

    const loggedCalls: Array<Record<string, unknown>> = [];
    const logger = {
      info: (o: Record<string, unknown>) => loggedCalls.push(o),
      warn: () => {},
      error: () => {},
      debug: () => {},
      trace: () => {},
      fatal: () => {},
      level: "info",
      child: () => logger,
      silent: () => {},
    } as unknown as import("fastify").FastifyBaseLogger;

    await consume(
      answerWithTools("q", "u1", undefined, undefined, undefined, undefined, undefined, logger),
    );

    expect(loggedCalls.length).toBe(1);
    expect(loggedCalls[0]).toMatchObject({
      event: "claude_call_complete",
      operation: "answer_with_tools",
      userId: "u1",
      round: 0,
      input_tokens: 1234,
      output_tokens: 56,
      cumulativeInputTokens: 1234,
      cumulativeOutputTokens: 56,
    });
  });

  it("halts at MAX_TOKENS_PER_QUESTION with a graceful final message (Phase D.2)", async () => {
    // Round 0 returns a giant usage that exceeds the ceiling. Round 1
    // should never fire — the budget check at the top of the loop
    // emits a graceful text and returns.
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: "tool_use",
        id: "t0",
        name: "search_notes",
        input: { query: "x" },
      }],
      usage: { input_tokens: 150_000, output_tokens: 500 },
    });

    const events = await consume(answerWithTools("expensive question", "u1"));

    // Exactly one create call — round 1 was preempted by the budget.
    expect(mockCreate).toHaveBeenCalledTimes(1);
    // Graceful finalization text was yielded.
    const texts = events.filter((e) => e.type === "text").map((e) => e.text ?? "");
    expect(texts.some((t) => /token ceiling/i.test(t))).toBe(true);
    expect(events.some((e) => e.type === "done")).toBe(true);
  });

  it("autoApprove.deleteNote=true does NOT bypass delete_folder", async () => {
    const deleteFolderBlock = {
      type: "tool_use",
      id: "t1",
      name: "delete_folder",
      input: { folderName: "Work" },
    };
    mockCreate
      .mockResolvedValueOnce({ content: [deleteFolderBlock] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "done" }] });

    const { listFolders } = await import("../store/noteStore.js");
    (listFolders as unknown as { mockResolvedValueOnce: (v: unknown) => void })
      .mockResolvedValueOnce([
        { id: "f1", name: "Work", parentId: null, count: 3, children: [] },
      ]);

    const events = await consume(
      answerWithTools(
        "delete the Work folder",
        "u1",
        undefined,
        undefined,
        undefined,
        undefined,
        { deleteNote: true }, // WRONG tool — the gate on delete_folder stays on
      ),
    );

    expect(events.filter((e) => e.type === "confirmation").length).toBe(1);
  });
});
