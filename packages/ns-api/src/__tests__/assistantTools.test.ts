import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the whole store before import so the executor picks up the stubs.
const mockListNotes = vi.fn();
const mockListFavoriteNotes = vi.fn();
const mockFindSimilarNotes = vi.fn();
const mockSoftDeleteNote = vi.fn();
const mockDeleteFolderById = vi.fn();
const mockUpdateNote = vi.fn();
const mockRenameFolder = vi.fn();
const mockRenameTag = vi.fn();
const mockListFolders = vi.fn();
const mockListTags = vi.fn();

vi.mock("../store/noteStore.js", () => ({
  listNotes: (...args: unknown[]) => mockListNotes(...args),
  listFolders: (...args: unknown[]) => mockListFolders(...args),
  listTags: (...args: unknown[]) => mockListTags(...args),
  listFavoriteNotes: (...args: unknown[]) => mockListFavoriteNotes(...args),
  listTrashedNotes: vi.fn(),
  getDashboardData: vi.fn(),
  createNote: vi.fn(),
  updateNote: (...args: unknown[]) => mockUpdateNote(...args),
  softDeleteNote: (...args: unknown[]) => mockSoftDeleteNote(...args),
  restoreNote: vi.fn(),
  deleteFolderById: (...args: unknown[]) => mockDeleteFolderById(...args),
  renameFolder: (...args: unknown[]) => mockRenameFolder(...args),
  renameTag: (...args: unknown[]) => mockRenameTag(...args),
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

// Phase C — destructive tools gated behind confirmation unless
// autoApprove is passed. The gate runs a precheck (to populate the
// card preview); if the target isn't found the gate falls through to
// the real executor so the user gets the normal "not found" message.
describe("assistantTools — Phase C confirmation gate", () => {
  beforeEach(() => {
    mockSoftDeleteNote.mockReset();
    mockDeleteFolderById.mockReset();
    mockUpdateNote.mockReset();
    mockRenameFolder.mockReset();
    mockRenameTag.mockReset();
    mockListFolders.mockReset();
    mockListTags.mockReset();
  });

  it("delete_note returns needs_confirmation by default (no mutation)", async () => {
    mockListNotes.mockResolvedValue({ notes: [makeNote({ id: "n1", title: "My Draft" })], total: 1 });

    const result = await executeTool("delete_note", { noteTitle: "My Draft" }, "u1");

    expect(result.needsConfirmation).toBeTruthy();
    expect(result.needsConfirmation?.toolName).toBe("delete_note");
    expect(result.needsConfirmation?.preview).toMatchObject({
      type: "delete_note",
      title: "My Draft",
    });
    expect(mockSoftDeleteNote).not.toHaveBeenCalled();
  });

  it("delete_note with autoApprove=true bypasses the gate and deletes", async () => {
    mockListNotes.mockResolvedValue({ notes: [makeNote({ id: "n1", title: "My Draft" })], total: 1 });
    mockSoftDeleteNote.mockResolvedValue(true);

    const result = await executeTool(
      "delete_note",
      { noteTitle: "My Draft" },
      "u1",
      { autoApprove: true },
    );

    expect(result.needsConfirmation).toBeUndefined();
    expect(mockSoftDeleteNote).toHaveBeenCalledWith("u1", "n1");
    expect(result.text).toMatch(/moved.*to trash/i);
  });

  it("delete_note falls through to the not-found executor when the target is missing", async () => {
    mockListNotes.mockResolvedValue({ notes: [], total: 0 });

    const result = await executeTool("delete_note", { noteTitle: "ghost" }, "u1");

    expect(result.needsConfirmation).toBeUndefined();
    expect(result.text).toMatch(/no note found/i);
    expect(mockSoftDeleteNote).not.toHaveBeenCalled();
  });

  it("update_note_content preview includes old/new content + lengths", async () => {
    const oldContent = "old body text";
    const newContent = "completely new rewritten body";
    mockListNotes.mockResolvedValue({
      notes: [makeNote({ id: "n1", title: "Essay", content: oldContent })],
      total: 1,
    });

    const result = await executeTool(
      "update_note_content",
      { noteTitle: "Essay", content: newContent },
      "u1",
    );

    expect(result.needsConfirmation).toBeTruthy();
    const preview = result.needsConfirmation!.preview;
    expect(preview).toMatchObject({
      type: "update_note_content",
      title: "Essay",
      oldContent,
      newContent,
      oldLen: oldContent.length,
      newLen: newContent.length,
    });
    expect(mockUpdateNote).not.toHaveBeenCalled();
  });

  // Phase E follow-up: data-loss guard. Without these checks, Claude
  // calling update_note_content without a content field caused the
  // executor to write String(undefined) === "undefined" into the note,
  // silently destroying the user's data.
  it("update_note_content refuses to render a confirmation card when content is missing", async () => {
    mockListNotes.mockResolvedValue({
      notes: [makeNote({ id: "n1", title: "Essay", content: "real body" })],
      total: 1,
    });

    const result = await executeTool(
      "update_note_content",
      { noteTitle: "Essay" }, // no content field
      "u1",
    );

    expect(result.needsConfirmation).toBeUndefined();
    expect(result.text).toMatch(/requires.*content/i);
    expect(result.text).toMatch(/not a patch/i);
    expect(mockUpdateNote).not.toHaveBeenCalled();
  });

  it("update_note_content refuses null/empty/non-string content variants", async () => {
    mockListNotes.mockResolvedValue({
      notes: [makeNote({ id: "n1", title: "Essay", content: "real body" })],
      total: 1,
    });

    for (const badInput of [
      { noteTitle: "Essay", content: null },
      { noteTitle: "Essay", content: "" },
      { noteTitle: "Essay", content: 42 },
      { noteTitle: "Essay", content: { foo: "bar" } },
    ]) {
      const result = await executeTool("update_note_content", badInput, "u1");
      expect(result.needsConfirmation).toBeUndefined();
      expect(result.text).toMatch(/requires.*content/i);
    }
    expect(mockUpdateNote).not.toHaveBeenCalled();
  });

  it("delete_folder preview includes affectedCount from the folder", async () => {
    mockListFolders.mockResolvedValue([
      { id: "f1", name: "Work", parentId: null, count: 5, children: [] },
    ]);

    const result = await executeTool("delete_folder", { folderName: "Work" }, "u1");

    expect(result.needsConfirmation?.preview).toMatchObject({
      type: "delete_folder",
      folderName: "Work",
      affectedCount: 5,
    });
    expect(mockDeleteFolderById).not.toHaveBeenCalled();
  });

  // Regression: executeRenameFolder was passing folder.id as the
  // second arg to renameFolder(), but that function expects the
  // folder's NAME. The UUID silently matched no rows, so Apply
  // visually succeeded but nothing was renamed.
  it("rename_folder passes the resolved folder NAME (not id) to the store", async () => {
    mockListFolders.mockResolvedValue([
      { id: "f1", name: "managed", parentId: null, count: 3, children: [] },
    ]);
    mockRenameFolder.mockResolvedValue(2);

    const result = await executeTool(
      "rename_folder",
      { oldName: "managed", newName: "managed-new" },
      "u1",
      { autoApprove: true },
    );

    expect(result.needsConfirmation).toBeUndefined();
    expect(mockRenameFolder).toHaveBeenCalledTimes(1);
    const [userIdArg, oldNameArg, newNameArg] = mockRenameFolder.mock.calls[0];
    expect(userIdArg).toBe("u1");
    expect(oldNameArg).toBe("managed"); // ← the name, NOT "f1"
    expect(newNameArg).toBe("managed-new");
  });

  it("rename_folder resolves case-insensitive oldName to the exact stored name", async () => {
    mockListFolders.mockResolvedValue([
      { id: "f1", name: "Managed", parentId: null, count: 0, children: [] },
    ]);
    mockRenameFolder.mockResolvedValue(0);

    await executeTool(
      "rename_folder",
      { oldName: "managed", newName: "Managed2" }, // lowercase input
      "u1",
      { autoApprove: true },
    );

    // Store receives the canonical "Managed" (from the folder row),
    // not Claude's lowercase input, so the SQL WHERE match finds
    // legacy notes with the folder string column set.
    expect(mockRenameFolder).toHaveBeenCalledWith("u1", "Managed", "Managed2");
  });

  it("rename_tag preview includes the affected note count from listTags", async () => {
    mockListTags.mockResolvedValue([
      { name: "draft", count: 7 },
      { name: "idea", count: 3 },
    ]);

    const result = await executeTool(
      "rename_tag",
      { oldName: "draft", newName: "drafts" },
      "u1",
    );

    expect(result.needsConfirmation?.preview).toMatchObject({
      type: "rename_tag",
      oldName: "draft",
      newName: "drafts",
      affectedCount: 7,
    });
    expect(mockRenameTag).not.toHaveBeenCalled();
  });

  it("non-destructive move_note bypasses the gate entirely (no confirmation)", async () => {
    mockListNotes.mockResolvedValue({ notes: [makeNote({ id: "n1", title: "X" })], total: 1 });
    mockListFolders.mockResolvedValue([
      { id: "f1", name: "Y", parentId: null, count: 0, children: [] },
    ]);
    mockUpdateNote.mockResolvedValue({});

    const moveResult = await executeTool(
      "move_note",
      { noteTitle: "X", folderName: "Y" },
      "u1",
    );
    expect(moveResult.needsConfirmation).toBeUndefined();
    expect(mockUpdateNote).toHaveBeenCalledWith("u1", "n1", { folderId: "f1" });
  });

  it("non-destructive tag_note does not trigger confirmation", async () => {
    mockListNotes.mockResolvedValue({ notes: [makeNote({ id: "n1", title: "X", tags: [] })], total: 1 });
    mockUpdateNote.mockResolvedValue({});

    const result = await executeTool("tag_note", { noteTitle: "X", tags: ["foo"] }, "u1");

    expect(result.needsConfirmation).toBeUndefined();
    expect(mockUpdateNote).toHaveBeenCalled();
  });
});
