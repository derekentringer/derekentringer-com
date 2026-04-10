import { describe, it, expect, beforeEach, vi } from "vitest";

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
  enqueueSyncAction,
  readSyncQueue,
  removeSyncQueueEntries,
  getSyncMeta,
  setSyncMeta,
  getSyncQueueCount,
  upsertNoteFromRemote,
  upsertFolderFromRemote,
  softDeleteNoteFromRemote,
  softDeleteFolderFromRemote,
} = await import("../lib/db.ts");

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// enqueueSyncAction
// ---------------------------------------------------------------------------

describe("enqueueSyncAction", () => {
  it("inserts into sync_queue with correct action format", async () => {
    mockExecute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 });

    await enqueueSyncAction("create", "note-1", "note");

    expect(mockExecute).toHaveBeenCalledTimes(1);
    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain("INSERT INTO sync_queue");
    expect(params[0]).toBe("note:create");
    expect(params[1]).toBe("note-1");
    expect(params[2]).toBeNull();
  });

  it("includes payload when provided", async () => {
    mockExecute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 });

    await enqueueSyncAction("update", "folder-1", "folder", '{"name":"Work"}');

    const [, params] = mockExecute.mock.calls[0];
    expect(params[0]).toBe("folder:update");
    expect(params[1]).toBe("folder-1");
    expect(params[2]).toBe('{"name":"Work"}');
  });
});

// ---------------------------------------------------------------------------
// readSyncQueue
// ---------------------------------------------------------------------------

describe("readSyncQueue", () => {
  it("returns entries ordered by id", async () => {
    mockSelect.mockResolvedValue([
      { id: 1, action: "note:create", note_id: "n1", payload: null, created_at: "2024-01-01T00:00:00.000Z" },
      { id: 2, action: "note:update", note_id: "n2", payload: null, created_at: "2024-01-01T01:00:00.000Z" },
    ]);

    const entries = await readSyncQueue();

    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      id: 1,
      action: "note:create",
      entity_id: "n1",
      entity_type: "note",
      payload: null,
      created_at: "2024-01-01T00:00:00.000Z",
    });
    expect(entries[1]).toEqual({
      id: 2,
      action: "note:update",
      entity_id: "n2",
      entity_type: "note",
      payload: null,
      created_at: "2024-01-01T01:00:00.000Z",
    });

    const [sql] = mockSelect.mock.calls[0];
    expect(sql).toContain("ORDER BY id ASC");
  });

  it("respects limit parameter", async () => {
    mockSelect.mockResolvedValue([]);

    await readSyncQueue(10);

    const [sql, params] = mockSelect.mock.calls[0];
    expect(sql).toContain("LIMIT $1");
    expect(params[0]).toBe(10);
  });

  it("maps folder entity type correctly", async () => {
    mockSelect.mockResolvedValue([
      { id: 1, action: "folder:delete", note_id: "f1", payload: null, created_at: "2024-01-01T00:00:00.000Z" },
    ]);

    const entries = await readSyncQueue();

    expect(entries[0].entity_type).toBe("folder");
    expect(entries[0].entity_id).toBe("f1");
  });
});

// ---------------------------------------------------------------------------
// removeSyncQueueEntries
// ---------------------------------------------------------------------------

describe("removeSyncQueueEntries", () => {
  it("deletes by ids", async () => {
    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 3 });

    await removeSyncQueueEntries([1, 2, 3]);

    expect(mockExecute).toHaveBeenCalledTimes(1);
    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain("DELETE FROM sync_queue WHERE id IN");
    expect(sql).toContain("$1");
    expect(sql).toContain("$2");
    expect(sql).toContain("$3");
    expect(params).toEqual([1, 2, 3]);
  });

  it("skips execution when ids array is empty", async () => {
    await removeSyncQueueEntries([]);

    expect(mockExecute).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getSyncMeta
// ---------------------------------------------------------------------------

describe("getSyncMeta", () => {
  it("returns null when key not found", async () => {
    mockSelect.mockResolvedValue([]);

    const value = await getSyncMeta("last_sync");

    expect(value).toBeNull();
    const [sql, params] = mockSelect.mock.calls[0];
    expect(sql).toContain("SELECT value FROM sync_meta WHERE key = $1");
    expect(params[0]).toBe("last_sync");
  });

  it("returns value when key exists", async () => {
    mockSelect.mockResolvedValue([{ value: "2024-06-01T00:00:00.000Z" }]);

    const value = await getSyncMeta("last_sync");

    expect(value).toBe("2024-06-01T00:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// setSyncMeta
// ---------------------------------------------------------------------------

describe("setSyncMeta", () => {
  it("inserts new key-value pair", async () => {
    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });

    await setSyncMeta("device_id", "abc-123");

    expect(mockExecute).toHaveBeenCalledTimes(1);
    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain("INSERT INTO sync_meta");
    expect(params[0]).toBe("device_id");
    expect(params[1]).toBe("abc-123");
  });

  it("uses ON CONFLICT to update existing key-value", async () => {
    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });

    await setSyncMeta("device_id", "updated-value");

    const [sql] = mockExecute.mock.calls[0];
    expect(sql).toContain("ON CONFLICT(key) DO UPDATE SET value");
  });
});

// ---------------------------------------------------------------------------
// getSyncQueueCount
// ---------------------------------------------------------------------------

describe("getSyncQueueCount", () => {
  it("returns count from sync_queue", async () => {
    mockSelect.mockResolvedValue([{ count: 7 }]);

    const count = await getSyncQueueCount();

    expect(count).toBe(7);
    const [sql] = mockSelect.mock.calls[0];
    expect(sql).toContain("SELECT COUNT(*) as count FROM sync_queue");
  });

  it("returns 0 when queue is empty", async () => {
    mockSelect.mockResolvedValue([{ count: 0 }]);

    const count = await getSyncQueueCount();

    expect(count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// upsertNoteFromRemote
// ---------------------------------------------------------------------------

describe("upsertNoteFromRemote", () => {
  const remoteNote = {
    id: "remote-note-1",
    title: "Remote Note",
    content: "Content from server",
    folder: null,
    folderId: "folder-1",
    folderPath: null,
    tags: ["sync", "remote"],
    summary: "A synced note",
    favorite: true,
    sortOrder: 2,
    favoriteSortOrder: 0,
    isLocalFile: false,
    audioMode: null,
    transcript: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-06-01T00:00:00.000Z",
    deletedAt: null,
  };

  it("inserts new note when it does not exist locally", async () => {
    // SELECT id check returns empty (note does not exist)
    mockSelect.mockResolvedValueOnce([]);
    // ftsUpdate: fts_map lookup returns empty (no FTS entry)
    mockSelect.mockResolvedValueOnce([]);
    mockExecute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 });

    await upsertNoteFromRemote(remoteNote);

    // First execute call is the INSERT INTO notes
    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain("INSERT INTO notes");
    expect(params[0]).toBe("remote-note-1");
    expect(params[1]).toBe("Remote Note");
    expect(params[2]).toBe("Content from server");
    expect(params[3]).toBe("folder-1");
    expect(params[4]).toBe(JSON.stringify(["sync", "remote"]));
    expect(params[5]).toBe("A synced note");
    expect(params[6]).toBe(1); // favorite = true -> 1
    expect(params[7]).toBe(2); // sortOrder
    expect(params[8]).toBe("2024-01-01T00:00:00.000Z"); // createdAt
    expect(params[9]).toBe("2024-06-01T00:00:00.000Z"); // updatedAt
    expect(params[10]).toBeNull(); // deletedAt
    expect(params[11]).toBe(0); // is_deleted (deletedAt is null)
    expect(params[12]).toBe(0); // favorite_sort_order
    expect(params[13]).toBe(0); // is_local_file
    expect(params[14]).toBeNull(); // audio_mode
  });

  it("updates existing note when it already exists locally", async () => {
    // SELECT id check returns a row (note exists)
    mockSelect.mockResolvedValueOnce([{ id: "remote-note-1" }]);
    // ftsUpdate: fts_map lookup returns empty
    mockSelect.mockResolvedValueOnce([]);
    mockExecute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 });

    await upsertNoteFromRemote(remoteNote);

    // First execute call is the UPDATE notes
    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain("UPDATE notes SET");
    expect(params[0]).toBe("Remote Note"); // title
    expect(params[1]).toBe("Content from server"); // content
    expect(params[2]).toBe("folder-1"); // folder_id
    expect(params[10]).toBe(0); // favorite_sort_order
    expect(params[11]).toBe(0); // is_local_file
    expect(params[12]).toBeNull(); // audio_mode
    expect(params[13]).toBe("remote-note-1"); // WHERE id
  });

  it("calls ftsDelete instead of ftsUpdate when note is deleted", async () => {
    const deletedNote = {
      ...remoteNote,
      deletedAt: "2024-07-01T00:00:00.000Z",
    };

    // SELECT id check returns empty (new note)
    mockSelect.mockResolvedValueOnce([]);
    // ftsDelete: fts_map lookup returns a row
    mockSelect.mockResolvedValueOnce([{ fts_rowid: 42 }]);
    mockExecute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 });

    await upsertNoteFromRemote(deletedNote);

    // INSERT with is_deleted = 1
    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain("INSERT INTO notes");
    expect(params[11]).toBe(1); // is_deleted (deletedAt is set)

    // ftsDelete should have been called (DELETE FROM notes_fts)
    const ftsDeleteCalls = mockExecute.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("DELETE FROM notes_fts"),
    );
    expect(ftsDeleteCalls.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// upsertFolderFromRemote
// ---------------------------------------------------------------------------

describe("upsertFolderFromRemote", () => {
  const remoteFolder = {
    id: "remote-folder-1",
    name: "Work",
    parentId: null as string | null,
    sortOrder: 0,
    favorite: false,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-06-01T00:00:00.000Z",
    deletedAt: null as string | null,
  };

  it("inserts new folder when it does not exist locally", async () => {
    // SELECT id check returns empty (folder does not exist)
    mockSelect.mockResolvedValue([]);
    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });

    await upsertFolderFromRemote(remoteFolder);

    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain("INSERT INTO folders");
    expect(params[0]).toBe("remote-folder-1");
    expect(params[1]).toBe("Work");
    expect(params[2]).toBeNull(); // parentId
    expect(params[3]).toBe(0); // sortOrder
    expect(params[4]).toBe(0); // favorite = false -> 0
    expect(params[5]).toBe("2024-01-01T00:00:00.000Z"); // createdAt
    expect(params[6]).toBe("2024-06-01T00:00:00.000Z"); // updatedAt
    expect(params[7]).toBeNull(); // deletedAt
  });

  it("updates existing folder when it already exists locally", async () => {
    // SELECT id check returns a row (folder exists)
    mockSelect.mockResolvedValue([{ id: "remote-folder-1" }]);
    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });

    const updatedFolder = {
      ...remoteFolder,
      name: "Updated Work",
      favorite: true,
    };

    await upsertFolderFromRemote(updatedFolder);

    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain("UPDATE folders SET");
    expect(params[0]).toBe("Updated Work"); // name
    expect(params[3]).toBe(1); // favorite = true -> 1
    expect(params[6]).toBe("remote-folder-1"); // WHERE id
  });
});

// ---------------------------------------------------------------------------
// softDeleteNoteFromRemote
// ---------------------------------------------------------------------------

describe("softDeleteNoteFromRemote", () => {
  it("marks note as deleted and removes from FTS", async () => {
    // ftsDelete: fts_map lookup returns a row
    mockSelect.mockResolvedValueOnce([{ fts_rowid: 42 }]);
    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });

    const timestamp = "2024-07-01T00:00:00.000Z";
    await softDeleteNoteFromRemote("note-1", timestamp);

    // First execute: UPDATE notes SET is_deleted = 1
    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain("is_deleted = 1");
    expect(sql).toContain("deleted_at");
    expect(sql).toContain("favorite = 0");
    expect(params[0]).toBe(timestamp);
    expect(params[1]).toBe("note-1");

    // Should also call DELETE FROM notes_fts (ftsDelete)
    const ftsCalls = mockExecute.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("DELETE FROM notes_fts"),
    );
    expect(ftsCalls.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// softDeleteFolderFromRemote
// ---------------------------------------------------------------------------

describe("softDeleteFolderFromRemote", () => {
  it("soft-deletes folder and unfiles its notes", async () => {
    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });

    await softDeleteFolderFromRemote("folder-1");

    expect(mockExecute).toHaveBeenCalledTimes(2);

    // First execute: UPDATE notes SET folder_id = NULL (unfile notes)
    const [unfileSql, unfileParams] = mockExecute.mock.calls[0];
    expect(unfileSql).toContain("UPDATE notes SET folder_id = NULL");
    expect(unfileParams[0]).toBe("folder-1");

    // Second execute: UPDATE folders SET deleted_at (soft-delete folder)
    const [deleteSql, deleteParams] = mockExecute.mock.calls[1];
    expect(deleteSql).toContain("UPDATE folders SET deleted_at");
    expect(deleteParams[1]).toBe("folder-1");
  });
});
