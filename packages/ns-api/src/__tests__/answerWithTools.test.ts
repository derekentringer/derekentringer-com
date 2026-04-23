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
