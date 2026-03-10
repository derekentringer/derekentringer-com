import { vi } from "vitest";

// Mock uuid
vi.mock("uuid", () => ({
  v4: () => "test-uuid-1234",
}));

// Mock @tauri-apps/plugin-sql
const mockExecute = vi.fn();
const mockSelect = vi.fn();

vi.mock("@tauri-apps/plugin-sql", () => {
  return {
    default: {
      load: vi.fn().mockResolvedValue({
        execute: mockExecute,
        select: mockSelect,
      }),
    },
  };
});

// Import after mocks are set up
const {
  fetchNotes,
  fetchNoteById,
  createNote,
  updateNote,
  softDeleteNote,
  hardDeleteNote,
  searchNotes,
  fetchFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  fetchTags,
  renameTag,
  deleteTag,
  fetchTrash,
  restoreNote,
  bulkHardDelete,
  emptyTrash,
  purgeOldTrash,
  initFts,
  reorderNotes,
  moveFolderParent,
  reorderFolders,
} = await import("../lib/db.ts");

const sampleRow = {
  id: "abc-123",
  title: "My Note",
  content: "Hello world",
  folder_id: null,
  tags: '["tag1","tag2"]',
  summary: "A summary",
  favorite: 0,
  sort_order: 1,
  is_deleted: 0,
  deleted_at: null,
  sync_status: "pending",
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-02T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchNotes", () => {
  it("returns mapped notes from SQL rows", async () => {
    mockSelect.mockResolvedValue([sampleRow]);

    const notes = await fetchNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0]).toEqual({
      id: "abc-123",
      title: "My Note",
      content: "Hello world",
      folder: null,
      folderId: null,
      folderPath: null,
      tags: ["tag1", "tag2"],
      summary: "A summary",
      favorite: false,
      sortOrder: 1,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-02T00:00:00.000Z",
      deletedAt: null,
    });
  });

  it("queries non-deleted notes ordered by updated_at", async () => {
    mockSelect.mockResolvedValue([]);
    await fetchNotes();

    expect(mockSelect).toHaveBeenCalledWith(
      "SELECT * FROM notes WHERE is_deleted = 0 ORDER BY updated_at DESC",
      [],
    );
  });

  it("returns empty array when no notes exist", async () => {
    mockSelect.mockResolvedValue([]);
    const notes = await fetchNotes();
    expect(notes).toEqual([]);
  });

  it("filters by folder ID", async () => {
    mockSelect.mockResolvedValue([]);
    await fetchNotes({ folderId: "folder-1" });

    expect(mockSelect).toHaveBeenCalledWith(
      expect.stringContaining("folder_id = $1"),
      ["folder-1"],
    );
  });

  it("filters unfiled notes when folderId is null", async () => {
    mockSelect.mockResolvedValue([]);
    await fetchNotes({ folderId: null });

    expect(mockSelect).toHaveBeenCalledWith(
      expect.stringContaining("folder_id IS NULL"),
      [],
    );
  });

  it("sorts by title ascending", async () => {
    mockSelect.mockResolvedValue([]);
    await fetchNotes({ sortBy: "title", sortOrder: "asc" });

    expect(mockSelect).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY title ASC"),
      [],
    );
  });

  it("sorts by created_at descending", async () => {
    mockSelect.mockResolvedValue([]);
    await fetchNotes({ sortBy: "createdAt", sortOrder: "desc" });

    expect(mockSelect).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY created_at DESC"),
      [],
    );
  });
});

describe("fetchNoteById", () => {
  it("returns mapped note when found", async () => {
    mockSelect.mockResolvedValue([sampleRow]);
    const note = await fetchNoteById("abc-123");

    expect(note).not.toBeNull();
    expect(note!.id).toBe("abc-123");
    expect(note!.title).toBe("My Note");
  });

  it("returns null when note not found", async () => {
    mockSelect.mockResolvedValue([]);
    const note = await fetchNoteById("nonexistent");
    expect(note).toBeNull();
  });
});

describe("row mapping", () => {
  it("maps favorite 1 to true", async () => {
    mockSelect.mockResolvedValue([{ ...sampleRow, favorite: 1 }]);
    const notes = await fetchNotes();
    expect(notes[0].favorite).toBe(true);
  });

  it("maps favorite 0 to false", async () => {
    mockSelect.mockResolvedValue([{ ...sampleRow, favorite: 0 }]);
    const notes = await fetchNotes();
    expect(notes[0].favorite).toBe(false);
  });

  it("handles invalid tags JSON gracefully", async () => {
    mockSelect.mockResolvedValue([{ ...sampleRow, tags: "not-json" }]);
    const notes = await fetchNotes();
    expect(notes[0].tags).toEqual([]);
  });

  it("handles empty tags string", async () => {
    mockSelect.mockResolvedValue([{ ...sampleRow, tags: "" }]);
    const notes = await fetchNotes();
    expect(notes[0].tags).toEqual([]);
  });

  it("maps folder_id to folderId", async () => {
    mockSelect.mockResolvedValue([{ ...sampleRow, folder_id: "folder-1" }]);
    const notes = await fetchNotes();
    expect(notes[0].folderId).toBe("folder-1");
  });

  it("maps deleted_at to deletedAt", async () => {
    mockSelect.mockResolvedValue([
      { ...sampleRow, deleted_at: "2024-06-01T00:00:00.000Z" },
    ]);
    const notes = await fetchNotes();
    expect(notes[0].deletedAt).toBe("2024-06-01T00:00:00.000Z");
  });

  it("handles null summary", async () => {
    mockSelect.mockResolvedValue([{ ...sampleRow, summary: "" }]);
    const notes = await fetchNotes();
    expect(notes[0].summary).toBeNull();
  });
});

describe("createNote", () => {
  it("generates UUID and inserts into database", async () => {
    // First call: execute INSERT, second: ftsInsert execute, third: fts_map INSERT
    mockExecute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 });
    // select calls: fetchNoteById re-read, fts_map insert (via ftsInsert)
    mockSelect.mockResolvedValue([{ ...sampleRow, id: "test-uuid-1234" }]);

    const note = await createNote({ title: "New Note" });

    // First execute call is the INSERT INTO notes
    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain("INSERT INTO notes");
    expect(params[0]).toBe("test-uuid-1234");
    expect(params[1]).toBe("New Note");
    expect(note.id).toBe("test-uuid-1234");
  });

  it("uses empty string defaults for title and content", async () => {
    mockExecute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 });
    mockSelect.mockResolvedValue([{ ...sampleRow, id: "test-uuid-1234", title: "", content: "" }]);

    await createNote({});

    const [, params] = mockExecute.mock.calls[0];
    expect(params[1]).toBe(""); // title
    expect(params[2]).toBe(""); // content
  });

  it("returns fallback note if re-read fails", async () => {
    mockExecute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 });
    mockSelect.mockResolvedValue([]);

    const note = await createNote({ title: "Fallback" });

    expect(note.id).toBe("test-uuid-1234");
    expect(note.title).toBe("Fallback");
    expect(note.content).toBe("");
    expect(note.tags).toEqual([]);
    expect(note.favorite).toBe(false);
  });

  it("syncs to FTS after insert", async () => {
    mockExecute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 });
    mockSelect.mockResolvedValue([{ ...sampleRow, id: "test-uuid-1234" }]);

    await createNote({ title: "FTS Test" });

    // Should have called INSERT INTO notes_fts
    const ftsCalls = mockExecute.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("INSERT INTO notes_fts"),
    );
    expect(ftsCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe("updateNote", () => {
  it("updates title and content", async () => {
    mockSelect
      .mockResolvedValueOnce([]) // ftsUpdate: fts_map lookup
      .mockResolvedValueOnce([{ ...sampleRow, title: "Updated", content: "New content" }]) // fetchNoteById for fts
      .mockResolvedValueOnce([{ ...sampleRow, title: "Updated", content: "New content" }]); // fetchNoteById return
    mockExecute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 });

    const note = await updateNote("abc-123", {
      title: "Updated",
      content: "New content",
    });

    const [sql] = mockExecute.mock.calls[0];
    expect(sql).toContain("title =");
    expect(sql).toContain("content =");
    expect(note.title).toBe("Updated");
  });

  it("throws if note not found after update", async () => {
    mockSelect.mockResolvedValue([]);
    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 0 });

    await expect(
      updateNote("missing-id", { title: "Test" }),
    ).rejects.toThrow("Note missing-id not found after update");
  });

  it("updates tags as JSON string", async () => {
    mockSelect.mockResolvedValue([sampleRow]);
    mockExecute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 });

    await updateNote("abc-123", { tags: ["a", "b"] });

    const [, params] = mockExecute.mock.calls[0];
    expect(params).toContain(JSON.stringify(["a", "b"]));
  });

  it("updates favorite as 0/1 integer", async () => {
    mockSelect.mockResolvedValue([sampleRow]);
    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });

    await updateNote("abc-123", { favorite: true });

    const [, params] = mockExecute.mock.calls[0];
    expect(params).toContain(1);
  });
});

describe("softDeleteNote", () => {
  it("sets is_deleted and deleted_at, removes from FTS", async () => {
    // ftsDelete: fts_map lookup returns a row
    mockSelect.mockResolvedValueOnce([{ fts_rowid: 42 }]);
    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });

    await softDeleteNote("abc-123");

    // First execute: UPDATE notes SET is_deleted...
    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain("is_deleted = 1");
    expect(sql).toContain("deleted_at");
    expect(sql).toContain("favorite = 0");
    expect(params[1]).toBe("abc-123");

    // Should also call DELETE FROM notes_fts
    const ftsCalls = mockExecute.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("DELETE FROM notes_fts"),
    );
    expect(ftsCalls.length).toBe(1);
  });
});

describe("hardDeleteNote", () => {
  it("deletes the row and cleans up FTS", async () => {
    mockSelect.mockResolvedValueOnce([{ fts_rowid: 42 }]);
    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });

    await hardDeleteNote("abc-123");

    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain("DELETE FROM notes");
    expect(params[0]).toBe("abc-123");
  });
});

describe("searchNotes", () => {
  it("returns empty array for empty query", async () => {
    const results = await searchNotes("");
    expect(results).toEqual([]);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("calls FTS5 MATCH query", async () => {
    mockSelect.mockResolvedValue([
      { ...sampleRow, headline: "Hello <mark>world</mark>" },
    ]);

    const results = await searchNotes("world");

    expect(mockSelect).toHaveBeenCalledTimes(1);
    const [sql] = mockSelect.mock.calls[0];
    expect(sql).toContain("notes_fts MATCH");
    expect(results).toHaveLength(1);
    expect(results[0].headline).toBe("Hello <mark>world</mark>");
  });

  it("escapes double quotes in search query", async () => {
    mockSelect.mockResolvedValue([]);

    await searchNotes('hello "world"');

    const [, params] = mockSelect.mock.calls[0];
    expect(params[0]).toContain('""');
  });
});

describe("fetchFolders", () => {
  it("builds folder tree from flat rows", async () => {
    mockSelect
      .mockResolvedValueOnce([
        { id: "f1", name: "Work", parent_id: null, sort_order: 0, favorite: 0, created_at: "2024-01-01", updated_at: "2024-01-01" },
        { id: "f2", name: "Projects", parent_id: "f1", sort_order: 0, favorite: 0, created_at: "2024-01-01", updated_at: "2024-01-01" },
        { id: "f3", name: "Personal", parent_id: null, sort_order: 1, favorite: 0, created_at: "2024-01-01", updated_at: "2024-01-01" },
      ])
      .mockResolvedValueOnce([
        { folder_id: "f1", count: 3 },
        { folder_id: "f2", count: 2 },
      ]);

    const folders = await fetchFolders();

    expect(folders).toHaveLength(2);
    expect(folders[0].name).toBe("Work");
    expect(folders[0].children).toHaveLength(1);
    expect(folders[0].children[0].name).toBe("Projects");
    expect(folders[0].count).toBe(3);
    expect(folders[0].totalCount).toBe(5); // 3 + 2 from child
    expect(folders[1].name).toBe("Personal");
  });

  it("returns empty array when no folders exist", async () => {
    mockSelect
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const folders = await fetchFolders();
    expect(folders).toEqual([]);
  });
});

describe("createFolder", () => {
  it("inserts folder and returns FolderInfo", async () => {
    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });

    const folder = await createFolder("My Folder");

    const [sql] = mockExecute.mock.calls[0];
    expect(sql).toContain("INSERT INTO folders");
    expect(folder.name).toBe("My Folder");
    expect(folder.id).toBe("test-uuid-1234");
    expect(folder.parentId).toBeNull();
    expect(folder.children).toEqual([]);
  });

  it("creates subfolder with parentId", async () => {
    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });

    const folder = await createFolder("Subfolder", "parent-id");

    expect(folder.parentId).toBe("parent-id");
    const [, params] = mockExecute.mock.calls[0];
    expect(params[2]).toBe("parent-id"); // parent_id parameter
  });
});

describe("renameFolder", () => {
  it("updates folder name", async () => {
    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });

    await renameFolder("f1", "New Name");

    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain("UPDATE folders SET name");
    expect(params[0]).toBe("New Name");
    expect(params[2]).toBe("f1");
  });
});

describe("deleteFolder", () => {
  it("move-up mode: moves children and notes to parent", async () => {
    mockSelect.mockResolvedValueOnce([
      { id: "f1", name: "Work", parent_id: "root-id", sort_order: 0, favorite: 0, created_at: "2024-01-01", updated_at: "2024-01-01" },
    ]);
    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });

    await deleteFolder("f1", "move-up");

    // Should: SELECT folder, UPDATE children folders, UPDATE notes, DELETE folder
    expect(mockExecute).toHaveBeenCalledTimes(3);
    const calls = mockExecute.mock.calls;
    expect(calls[0][0]).toContain("UPDATE folders SET parent_id");
    expect(calls[1][0]).toContain("UPDATE notes SET folder_id");
    expect(calls[2][0]).toContain("DELETE FROM folders");
  });

  it("recursive mode: deletes folder and descendants", async () => {
    // collectDescendantFolderIds for f1
    mockSelect
      .mockResolvedValueOnce([{ id: "f2" }]) // children of f1
      .mockResolvedValueOnce([]) // children of f2 (none)
      .mockResolvedValueOnce([]) // notes in f2
      .mockResolvedValueOnce([]); // notes in f1
    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });

    await deleteFolder("f1", "recursive");

    // Should delete folders in reverse order (f1, f2 reversed = f2 first, then f1)
    const deleteCalls = mockExecute.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("DELETE FROM folders"),
    );
    expect(deleteCalls.length).toBe(2);
  });
});

describe("fetchTags", () => {
  it("returns tags with counts from json_each", async () => {
    mockSelect.mockResolvedValue([
      { name: "work", count: 5 },
      { name: "personal", count: 3 },
    ]);

    const tags = await fetchTags();

    expect(tags).toHaveLength(2);
    expect(tags[0]).toEqual({ name: "work", count: 5 });
    expect(mockSelect).toHaveBeenCalledWith(
      expect.stringContaining("json_each"),
    );
  });
});

describe("renameTag", () => {
  it("updates tag name in all affected notes", async () => {
    // Call order: 1) SELECT notes, 2) fetchNoteById, 3) fts_map lookup
    mockSelect
      .mockResolvedValueOnce([
        { id: "n1", tags: '["old-tag","other"]' },
      ])
      .mockResolvedValueOnce([{ ...sampleRow, id: "n1", tags: '["new-tag","other"]' }]) // fetchNoteById
      .mockResolvedValueOnce([]); // fts_map lookup (empty → ftsInsert path)
    mockExecute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 });

    await renameTag("old-tag", "new-tag");

    // Should update the note's tags
    const updateCalls = mockExecute.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("UPDATE notes SET tags"),
    );
    expect(updateCalls.length).toBe(1);
    const [, params] = updateCalls[0];
    expect(params[0]).toContain("new-tag");
  });
});

describe("deleteTag", () => {
  it("removes tag from all affected notes", async () => {
    // Call order: 1) SELECT notes, 2) fetchNoteById, 3) fts_map lookup
    mockSelect
      .mockResolvedValueOnce([
        { id: "n1", tags: '["remove-me","keep"]' },
      ])
      .mockResolvedValueOnce([{ ...sampleRow, id: "n1", tags: '["keep"]' }]) // fetchNoteById
      .mockResolvedValueOnce([]); // fts_map lookup (empty → ftsInsert path)
    mockExecute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 });

    await deleteTag("remove-me");

    const updateCalls = mockExecute.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("UPDATE notes SET tags"),
    );
    expect(updateCalls.length).toBe(1);
    const [, params] = updateCalls[0];
    expect(params[0]).not.toContain("remove-me");
    expect(params[0]).toContain("keep");
  });
});

describe("fetchTrash", () => {
  it("returns deleted notes ordered by deleted_at", async () => {
    mockSelect.mockResolvedValue([
      { ...sampleRow, is_deleted: 1, deleted_at: "2024-06-01T00:00:00.000Z" },
    ]);

    const trash = await fetchTrash();

    expect(trash).toHaveLength(1);
    expect(mockSelect).toHaveBeenCalledWith(
      expect.stringContaining("is_deleted = 1"),
    );
  });
});

describe("restoreNote", () => {
  it("clears is_deleted and re-adds to FTS", async () => {
    // fetchNoteById after restore
    mockSelect.mockResolvedValueOnce([{ ...sampleRow, is_deleted: 0 }]);
    mockExecute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 });

    await restoreNote("abc-123");

    const [sql] = mockExecute.mock.calls[0];
    expect(sql).toContain("is_deleted = 0");
    expect(sql).toContain("deleted_at = NULL");

    // Should re-add to FTS
    const ftsCalls = mockExecute.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("INSERT INTO notes_fts"),
    );
    expect(ftsCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe("reorderNotes", () => {
  it("updates sort_order for each note", async () => {
    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });

    await reorderNotes([
      { id: "n1", sortOrder: 0 },
      { id: "n2", sortOrder: 1 },
      { id: "n3", sortOrder: 2 },
    ]);

    expect(mockExecute).toHaveBeenCalledTimes(3);
    for (let i = 0; i < 3; i++) {
      const [sql] = mockExecute.mock.calls[i];
      expect(sql).toContain("UPDATE notes SET sort_order");
    }
    // Check the sort_order values
    expect(mockExecute.mock.calls[0][1][0]).toBe(0);
    expect(mockExecute.mock.calls[1][1][0]).toBe(1);
    expect(mockExecute.mock.calls[2][1][0]).toBe(2);
  });

  it("handles empty order array", async () => {
    await reorderNotes([]);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

describe("moveFolderParent", () => {
  it("updates parent_id for a folder", async () => {
    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });

    await moveFolderParent("f1", "f2");

    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain("UPDATE folders SET parent_id");
    expect(params[0]).toBe("f2");
    expect(params[2]).toBe("f1");
  });

  it("moves folder to root when parentId is null", async () => {
    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });

    await moveFolderParent("f1", null);

    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain("UPDATE folders SET parent_id");
    expect(params[0]).toBeNull();
    expect(params[2]).toBe("f1");
  });
});

describe("reorderFolders", () => {
  it("updates sort_order for each folder", async () => {
    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });

    await reorderFolders([
      { id: "f1", sortOrder: 0 },
      { id: "f2", sortOrder: 1 },
    ]);

    expect(mockExecute).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 2; i++) {
      const [sql] = mockExecute.mock.calls[i];
      expect(sql).toContain("UPDATE folders SET sort_order");
    }
  });

  it("handles empty order array", async () => {
    await reorderFolders([]);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

describe("initFts", () => {
  it("skips backfill when FTS map already has entries", async () => {
    mockSelect.mockResolvedValueOnce([{ count: 5 }]);

    await initFts();

    // Should only call the COUNT query, nothing more
    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("backfills FTS for all non-deleted notes when map is empty", async () => {
    mockSelect
      .mockResolvedValueOnce([{ count: 0 }]) // fts_map count
      .mockResolvedValueOnce([sampleRow, { ...sampleRow, id: "def-456" }]); // all notes
    mockExecute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 });

    await initFts();

    // Should insert 2 notes into FTS (each note = INSERT notes_fts + INSERT fts_map)
    const ftsInserts = mockExecute.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("INSERT INTO notes_fts"),
    );
    expect(ftsInserts).toHaveLength(2);
  });
});

describe("bulkHardDelete", () => {
  it("deletes specific IDs and calls ftsDelete for each", async () => {
    mockSelect.mockResolvedValue([{ fts_rowid: 1 }]);
    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });

    const count = await bulkHardDelete(["id-1", "id-2", "id-3"]);

    expect(count).toBe(3);
    const deleteCalls = mockExecute.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("DELETE FROM notes WHERE id"),
    );
    expect(deleteCalls).toHaveLength(3);
    expect(deleteCalls[0][1]).toEqual(["id-1"]);
    expect(deleteCalls[1][1]).toEqual(["id-2"]);
    expect(deleteCalls[2][1]).toEqual(["id-3"]);
  });

  it("returns 0 for empty array", async () => {
    const count = await bulkHardDelete([]);
    expect(count).toBe(0);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

describe("emptyTrash", () => {
  it("deletes all trashed notes and returns count", async () => {
    mockSelect
      .mockResolvedValueOnce([{ id: "t1" }, { id: "t2" }]) // SELECT trashed
      .mockResolvedValue([{ fts_rowid: 1 }]); // ftsDelete lookups
    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });

    const count = await emptyTrash();

    expect(count).toBe(2);
    const deleteCalls = mockExecute.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("DELETE FROM notes WHERE id"),
    );
    expect(deleteCalls).toHaveLength(2);
  });

  it("returns 0 when trash is empty", async () => {
    mockSelect.mockResolvedValueOnce([]);

    const count = await emptyTrash();

    expect(count).toBe(0);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

describe("purgeOldTrash", () => {
  it("deletes notes with old deleted_at timestamps", async () => {
    mockSelect
      .mockResolvedValueOnce([{ id: "old-1" }]) // SELECT old trashed notes
      .mockResolvedValue([{ fts_rowid: 1 }]); // ftsDelete lookups
    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });

    const count = await purgeOldTrash(30);

    expect(count).toBe(1);
    // Verify the cutoff query includes a date parameter
    expect(mockSelect.mock.calls[0][0]).toContain("deleted_at < $1");
    const deleteCalls = mockExecute.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("DELETE FROM notes WHERE id"),
    );
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0][1]).toEqual(["old-1"]);
  });

  it("returns 0 immediately when retentionDays is 0 (Never)", async () => {
    const count = await purgeOldTrash(0);

    expect(count).toBe(0);
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
