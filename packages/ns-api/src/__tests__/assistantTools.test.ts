import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the whole store before import so the executor picks up the stubs.
const mockListNotes = vi.fn();
const mockListFavoriteNotes = vi.fn();
const mockFindSimilarNotes = vi.fn();

vi.mock("../store/noteStore.js", () => ({
  listNotes: (...args: unknown[]) => mockListNotes(...args),
  listFolders: vi.fn(),
  listTags: vi.fn(),
  listFavoriteNotes: (...args: unknown[]) => mockListFavoriteNotes(...args),
  listTrashedNotes: vi.fn(),
  getDashboardData: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  softDeleteNote: vi.fn(),
  restoreNote: vi.fn(),
  deleteFolderById: vi.fn(),
  renameFolder: vi.fn(),
  renameTag: vi.fn(),
  findSimilarNotes: (...args: unknown[]) => mockFindSimilarNotes(...args),
}));

vi.mock("../store/linkStore.js", () => ({
  getBacklinks: vi.fn(),
}));

vi.mock("../services/aiService.js", () => ({
  suggestTags: vi.fn(),
  generateSummary: vi.fn(),
}));

import { executeTool } from "../services/assistantTools.js";

function makeNote(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "n1",
    userId: "u1",
    title: "My Note",
    content: "a".repeat(200),
    folder: null,
    folderId: null,
    tags: [],
    summary: null,
    favorite: false,
    sortOrder: 0,
    favoriteSortOrder: null,
    isLocalFile: false,
    audioMode: null,
    transcript: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockListNotes.mockReset();
  mockListFavoriteNotes.mockReset();
  mockFindSimilarNotes.mockReset();
});

describe("assistantTools — search_notes", () => {
  it("defaults to hybrid mode when a query is provided", async () => {
    mockListNotes.mockResolvedValue({ notes: [makeNote()], total: 1 });

    await executeTool("search_notes", { query: "leadership" }, "u1");

    expect(mockListNotes).toHaveBeenCalledTimes(1);
    const filter = mockListNotes.mock.calls[0][1];
    expect(filter.searchMode).toBe("hybrid");
    expect(filter.search).toBe("leadership");
  });

  it("respects an explicit mode argument", async () => {
    mockListNotes.mockResolvedValue({ notes: [makeNote()], total: 1 });

    await executeTool("search_notes", { query: "exact phrase", mode: "keyword" }, "u1");

    expect(mockListNotes.mock.calls[0][1].searchMode).toBe("keyword");
  });

  it("falls back to keyword mode when there is no query (listing only)", async () => {
    mockListNotes.mockResolvedValue({ notes: [makeNote()], total: 1 });

    await executeTool("search_notes", { folder: "Work" }, "u1");

    expect(mockListNotes.mock.calls[0][1].searchMode).toBe("keyword");
  });

  it("includes a content snippet for each result (truncated for long content)", async () => {
    const longContent = "word ".repeat(500); // >> 800 chars
    const shortContent = "short body";
    mockListNotes.mockResolvedValue({
      notes: [
        makeNote({ id: "long", title: "Long note", content: longContent }),
        makeNote({ id: "short", title: "Short note", content: shortContent }),
      ],
      total: 2,
    });

    const result = await executeTool("search_notes", { query: "x" }, "u1");

    expect(result.text).toContain("Long note");
    expect(result.text).toContain("Short note");
    // Long content is truncated with an ellipsis.
    expect(result.text).toContain("…");
    // Short content appears verbatim.
    expect(result.text).toContain(shortContent);
    // noteCards stay lean — no content.
    expect(result.noteCards?.[0]).toEqual(
      expect.objectContaining({ id: "long", title: "Long note" }),
    );
    expect((result.noteCards?.[0] as Record<string, unknown>).content).toBeUndefined();
  });

  it("reports zero matches cleanly", async () => {
    mockListNotes.mockResolvedValue({ notes: [], total: 0 });

    const result = await executeTool("search_notes", { query: "nope" }, "u1");

    expect(result.text).toMatch(/no notes found/i);
    expect(result.noteCards).toEqual([]);
  });

  it("favorites path bypasses listNotes and does not need a search mode", async () => {
    mockListFavoriteNotes.mockResolvedValue([makeNote({ favorite: true })]);

    const result = await executeTool("search_notes", { favorite: true }, "u1");

    expect(mockListFavoriteNotes).toHaveBeenCalledWith("u1");
    expect(mockListNotes).not.toHaveBeenCalled();
    expect(result.noteCards?.length).toBe(1);
  });
});

describe("assistantTools — get_note_content (Phase B.4)", () => {
  it("defaults to 8000-char truncation (up from the prior 3000)", async () => {
    const longContent = "x".repeat(20000);
    mockListNotes.mockResolvedValue({
      notes: [makeNote({ id: "n", title: "Long", content: longContent })],
      total: 1,
    });

    const result = await executeTool("get_note_content", { title: "Long" }, "u1");

    // Content section should include 8000 chars of x plus the truncation marker.
    expect(result.text).toContain("x".repeat(8000));
    expect(result.text).toContain("(truncated)");
    expect(result.text).not.toContain("x".repeat(8001)); // no bleed past cap
  });

  it("honors a caller-provided max_chars", async () => {
    const longContent = "y".repeat(20000);
    mockListNotes.mockResolvedValue({
      notes: [makeNote({ id: "n", title: "Long", content: longContent })],
      total: 1,
    });

    const result = await executeTool(
      "get_note_content",
      { title: "Long", max_chars: 100 },
      "u1",
    );

    expect(result.text).toContain("y".repeat(100));
    expect(result.text).toContain("(truncated)");
    expect(result.text).not.toContain("y".repeat(101));
  });

  it("clamps max_chars to the 30000 hard cap", async () => {
    const longContent = "z".repeat(40000);
    mockListNotes.mockResolvedValue({
      notes: [makeNote({ id: "n", title: "Very Long", content: longContent })],
      total: 1,
    });

    const result = await executeTool(
      "get_note_content",
      { title: "Very Long", max_chars: 99999 }, // request beyond cap
      "u1",
    );

    expect(result.text).toContain("z".repeat(30000));
    // 30001 would exceed the cap
    expect(result.text).not.toContain("z".repeat(30001));
    expect(result.text).toContain("(truncated)");
  });

  it("returns full content when the note is under the effective cap", async () => {
    mockListNotes.mockResolvedValue({
      notes: [makeNote({ id: "n", title: "Short", content: "short body" })],
      total: 1,
    });

    const result = await executeTool("get_note_content", { title: "Short" }, "u1");

    expect(result.text).toContain("short body");
    expect(result.text).not.toContain("(truncated)");
  });
});

describe("assistantTools — find_similar_notes (Phase B.2)", () => {
  it("delegates to findSimilarNotes and formats results with similarity %", async () => {
    mockFindSimilarNotes.mockResolvedValue([
      { id: "a", title: "Related A", snippet: "snippet a", score: 0.82, updatedAt: new Date("2026-04-01") },
      { id: "b", title: "Related B", snippet: "snippet b", score: 0.64, updatedAt: new Date("2026-03-15") },
    ]);

    const result = await executeTool(
      "find_similar_notes",
      { noteTitle: "Source", limit: 5 },
      "u1",
    );

    expect(mockFindSimilarNotes).toHaveBeenCalledWith("u1", "Source", 5);
    expect(result.text).toContain('"Related A" (82% similar)');
    expect(result.text).toContain('"Related B" (64% similar)');
    expect(result.text).toContain("snippet a");
    expect(result.noteCards?.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("clamps limit to [1, 10]", async () => {
    mockFindSimilarNotes.mockResolvedValue([]);

    await executeTool("find_similar_notes", { noteTitle: "S", limit: 50 }, "u1");
    expect(mockFindSimilarNotes).toHaveBeenLastCalledWith("u1", "S", 10);

    await executeTool("find_similar_notes", { noteTitle: "S", limit: 0 }, "u1");
    expect(mockFindSimilarNotes).toHaveBeenLastCalledWith("u1", "S", 1);
  });

  it("returns a helpful message when nothing matches", async () => {
    mockFindSimilarNotes.mockResolvedValue([]);

    const result = await executeTool(
      "find_similar_notes",
      { noteTitle: "Isolated" },
      "u1",
    );

    expect(result.text).toMatch(/no related notes/i);
    expect(result.noteCards).toEqual([]);
  });
});
