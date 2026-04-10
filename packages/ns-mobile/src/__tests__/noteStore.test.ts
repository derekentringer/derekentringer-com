import * as SQLite from "expo-sqlite";
import {
  getAllNotes,
  getNote,
  upsertNotes,
  searchNotes,
  enqueueSyncAction,
  readSyncQueue,
  removeSyncQueueEntries,
  getSyncQueueCount,
  getSyncMeta,
  setSyncMeta,
  createNoteLocal,
  updateNoteLocal,
  deleteNoteLocal,
  toggleFavoriteLocal,
  createFolderLocal,
  renameFolderLocal,
  deleteFolderLocal,
  upsertNoteFromRemote,
  upsertFolderFromRemote,
  softDeleteNoteFromRemote,
  getDashboardData,
  getTagsLocal,
  readNoteForSync,
  readFolderForSync,
} from "@/lib/noteStore";
import type { Note } from "@derekentringer/ns-shared";

// The expo-sqlite mock is already configured in jest.setup.js
const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  getAllAsync: jest.fn().mockResolvedValue([]),
  runAsync: jest.fn().mockResolvedValue({ changes: 0, lastInsertRowId: 0 }),
};

(SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);

const sampleNote: Note = {
  id: "note-1",
  title: "Test Note",
  content: "# Hello\n\nThis is a test",
  folder: "Work",
  folderId: "folder-1",
  folderPath: "/Work",
  tags: ["test", "sample"],
  summary: null,
  favorite: true,
  sortOrder: 0,
  favoriteSortOrder: 0,
  isLocalFile: false,
  audioMode: null,
  transcript: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-03-26T00:00:00Z",
  deletedAt: null,
};

const sampleRow = {
  id: "note-1",
  title: "Test Note",
  content: "# Hello\n\nThis is a test",
  folder: "Work",
  folder_id: "folder-1",
  folder_path: "/Work",
  tags: '["test","sample"]',
  summary: null,
  favorite: 1,
  sort_order: 0,
  favorite_sort_order: 0,
  audio_mode: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-03-26T00:00:00Z",
  deleted_at: null,
  sync_status: "synced",
  remote_id: null,
};

describe("noteStore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);
  });

  describe("getAllNotes", () => {
    it("returns empty array when no notes exist", async () => {
      mockDb.getAllAsync.mockResolvedValue([]);
      const notes = await getAllNotes();
      expect(notes).toEqual([]);
    });

    it("converts rows to Note objects", async () => {
      mockDb.getAllAsync.mockResolvedValue([sampleRow]);
      const notes = await getAllNotes();
      expect(notes).toHaveLength(1);
      expect(notes[0].id).toBe("note-1");
      expect(notes[0].title).toBe("Test Note");
      expect(notes[0].tags).toEqual(["test", "sample"]);
      expect(notes[0].favorite).toBe(true);
      expect(notes[0].folderId).toBe("folder-1");
    });

    it("applies folderId filter", async () => {
      mockDb.getAllAsync.mockResolvedValue([]);
      await getAllNotes({ folderId: "folder-1" });
      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining("folder_id = ?"),
        expect.arrayContaining(["folder-1"]),
      );
    });

    it("applies favorite filter", async () => {
      mockDb.getAllAsync.mockResolvedValue([]);
      await getAllNotes({ favorite: true });
      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining("favorite = 1"),
        expect.any(Array),
      );
    });

    it("applies deletedOnly filter", async () => {
      mockDb.getAllAsync.mockResolvedValue([]);
      await getAllNotes({ deletedOnly: true });
      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining("deleted_at IS NOT NULL"),
        expect.any(Array),
      );
    });

    it("applies limit", async () => {
      mockDb.getAllAsync.mockResolvedValue([]);
      await getAllNotes({ limit: 5 });
      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT ?"),
        expect.arrayContaining([5]),
      );
    });

    it("sorts by title when specified", async () => {
      mockDb.getAllAsync.mockResolvedValue([]);
      await getAllNotes({ sortBy: "title", sortOrder: "asc" });
      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY title ASC"),
        expect.any(Array),
      );
    });
  });

  describe("getNote", () => {
    it("returns null when note not found", async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);
      const note = await getNote("nonexistent");
      expect(note).toBeNull();
    });

    it("returns Note object when found", async () => {
      mockDb.getFirstAsync.mockResolvedValue(sampleRow);
      const note = await getNote("note-1");
      expect(note).not.toBeNull();
      expect(note!.id).toBe("note-1");
      expect(note!.tags).toEqual(["test", "sample"]);
    });
  });

  describe("upsertNotes", () => {
    it("inserts notes with correct parameters", async () => {
      await upsertNotes([sampleNote]);
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("INSERT OR REPLACE INTO notes"),
        expect.arrayContaining([
          "note-1",
          "Test Note",
          "# Hello\n\nThis is a test",
        ]),
      );
    });

    it("serializes tags as JSON", async () => {
      await upsertNotes([sampleNote]);
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['["test","sample"]']),
      );
    });

    it("converts favorite boolean to integer", async () => {
      await upsertNotes([sampleNote]);
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([1]), // favorite = true → 1
      );
    });
  });

  describe("searchNotes", () => {
    it("falls back to LIKE search when FTS fails", async () => {
      // First call (FTS) throws, second call (LIKE) returns results
      mockDb.getAllAsync
        .mockRejectedValueOnce(new Error("FTS not ready"))
        .mockResolvedValueOnce([sampleRow]);

      const results = await searchNotes("test");
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Test Note");
    });

    it("uses LIKE fallback with correct wildcards", async () => {
      mockDb.getAllAsync
        .mockRejectedValueOnce(new Error("FTS not ready"))
        .mockResolvedValueOnce([]);

      await searchNotes("test");
      expect(mockDb.getAllAsync).toHaveBeenLastCalledWith(
        expect.stringContaining("title LIKE ?"),
        ["%test%", "%test%"],
      );
    });
  });

  // ─── Sync queue tests ─────────────────────────────────────

  describe("sync queue", () => {
    it("enqueueSyncAction inserts into sync_queue", async () => {
      await enqueueSyncAction("create", "note-1", "note");
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        "INSERT INTO sync_queue (entity_id, entity_type, action, created_at) VALUES (?, ?, ?, ?)",
        expect.arrayContaining(["note-1", "note", "create"]),
      );
    });

    it("readSyncQueue reads with limit", async () => {
      mockDb.getAllAsync.mockResolvedValue([]);
      await readSyncQueue(50);
      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        "SELECT * FROM sync_queue ORDER BY id ASC LIMIT ?",
        [50],
      );
    });

    it("removeSyncQueueEntries deletes by IDs", async () => {
      await removeSyncQueueEntries([1, 2, 3]);
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        "DELETE FROM sync_queue WHERE id IN (?,?,?)",
        [1, 2, 3],
      );
    });

    it("removeSyncQueueEntries does nothing for empty array", async () => {
      await removeSyncQueueEntries([]);
      expect(mockDb.runAsync).not.toHaveBeenCalled();
    });

    it("getSyncQueueCount returns count", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ count: 5 });
      const count = await getSyncQueueCount();
      expect(count).toBe(5);
    });
  });

  // ─── Sync meta tests ──────────────────────────────────────

  describe("sync meta", () => {
    it("getSyncMeta returns value", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ value: "test-value" });
      const value = await getSyncMeta("testKey");
      expect(value).toBe("test-value");
    });

    it("getSyncMeta returns null when key not found", async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);
      const value = await getSyncMeta("nonexistent");
      expect(value).toBeNull();
    });

    it("setSyncMeta inserts or replaces", async () => {
      await setSyncMeta("key1", "value1");
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        "INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)",
        ["key1", "value1"],
      );
    });
  });

  // ─── Local CRUD tests ─────────────────────────────────────

  describe("createNoteLocal", () => {
    it("inserts a note and enqueues sync action", async () => {
      const note = await createNoteLocal({ title: "New Note", content: "Body" });
      expect(note.title).toBe("New Note");
      expect(note.content).toBe("Body");
      expect(note.id).toBeTruthy();

      // Should have inserted note + enqueued
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO notes"),
        expect.any(Array),
      );
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO sync_queue"),
        expect.arrayContaining(["note", "create"]),
      );
    });
  });

  describe("updateNoteLocal", () => {
    it("updates note and enqueues sync action", async () => {
      // Mock getNote return for FTS update
      mockDb.getFirstAsync.mockResolvedValue(sampleRow);

      await updateNoteLocal("note-1", { title: "Updated" });

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE notes SET"),
        expect.arrayContaining(["Updated", "note-1"]),
      );
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO sync_queue"),
        expect.arrayContaining(["note", "update"]),
      );
    });
  });

  describe("deleteNoteLocal", () => {
    it("soft-deletes and enqueues sync action", async () => {
      await deleteNoteLocal("note-1");
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE notes SET deleted_at"),
        expect.arrayContaining(["note-1"]),
      );
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO sync_queue"),
        expect.arrayContaining(["note", "delete"]),
      );
    });
  });

  describe("toggleFavoriteLocal", () => {
    it("updates favorite and enqueues", async () => {
      mockDb.getFirstAsync.mockResolvedValue(sampleRow);
      await toggleFavoriteLocal("note-1", false);
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE notes SET"),
        expect.arrayContaining([0, "note-1"]),
      );
    });
  });

  describe("createFolderLocal", () => {
    it("inserts folder and enqueues", async () => {
      const folder = await createFolderLocal("My Folder");
      expect(folder.name).toBe("My Folder");
      expect(folder.id).toBeTruthy();
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO folders"),
        expect.any(Array),
      );
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO sync_queue"),
        expect.arrayContaining(["folder", "create"]),
      );
    });
  });

  describe("renameFolderLocal", () => {
    it("updates folder name and enqueues", async () => {
      await renameFolderLocal("folder-1", "Renamed");
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE folders SET name"),
        expect.arrayContaining(["Renamed", "folder-1"]),
      );
    });
  });

  describe("deleteFolderLocal", () => {
    it("soft-deletes folder and enqueues", async () => {
      await deleteFolderLocal("folder-1");
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE folders SET deleted_at"),
        expect.arrayContaining(["folder-1"]),
      );
    });
  });

  // ─── Remote upsert tests ──────────────────────────────────

  describe("upsertNoteFromRemote", () => {
    it("inserts remote note (LWW)", async () => {
      mockDb.getFirstAsync.mockResolvedValue(null); // No existing note
      await upsertNoteFromRemote(sampleNote);
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("INSERT OR REPLACE INTO notes"),
        expect.arrayContaining(["note-1"]),
      );
    });

    it("skips if local is newer (LWW)", async () => {
      mockDb.getFirstAsync.mockResolvedValue({
        updated_at: "2026-12-31T00:00:00Z", // Local is newer
        deleted_at: null,
      });
      mockDb.runAsync.mockClear();

      await upsertNoteFromRemote(sampleNote);

      // Should NOT have inserted/replaced
      const insertCalls = mockDb.runAsync.mock.calls.filter(
        (call: any[]) => (call[0] as string).includes("INSERT OR REPLACE INTO notes"),
      );
      expect(insertCalls).toHaveLength(0);
    });
  });

  describe("upsertFolderFromRemote", () => {
    it("inserts remote folder", async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);
      await upsertFolderFromRemote({
        id: "folder-1",
        name: "Work",
        parentId: null,
        sortOrder: 0,
        favorite: false,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        deletedAt: null,
      });
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("INSERT OR REPLACE INTO folders"),
        expect.arrayContaining(["folder-1", "Work"]),
      );
    });
  });

  describe("softDeleteNoteFromRemote", () => {
    it("sets deleted_at", async () => {
      await softDeleteNoteFromRemote("note-1", "2026-03-27T00:00:00Z");
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE notes SET deleted_at"),
        expect.arrayContaining(["2026-03-27T00:00:00Z", "note-1"]),
      );
    });
  });

  // ─── Dashboard and tags tests ──────────────────────────────

  describe("getDashboardData", () => {
    it("returns favorites and recently edited", async () => {
      mockDb.getAllAsync.mockResolvedValue([sampleRow]);
      const data = await getDashboardData();
      expect(data).toHaveProperty("favorites");
      expect(data).toHaveProperty("recentlyEdited");
    });
  });

  describe("getTagsLocal", () => {
    it("returns tag counts from SQL aggregation", async () => {
      mockDb.getAllAsync
        .mockResolvedValueOnce([{ tag: "test" }, { tag: "sample" }])
        .mockResolvedValueOnce([
          { tag: "test", cnt: 3 },
          { tag: "sample", cnt: 1 },
        ]);

      const tags = await getTagsLocal();
      expect(tags).toEqual([
        { name: "test", count: 3 },
        { name: "sample", count: 1 },
      ]);
    });
  });

  // ─── Sync read tests ──────────────────────────────────────

  describe("readNoteForSync", () => {
    it("returns note including deleted ones", async () => {
      const deletedRow = { ...sampleRow, deleted_at: "2026-01-01T00:00:00Z" };
      mockDb.getFirstAsync.mockResolvedValue(deletedRow);

      const note = await readNoteForSync("note-1");
      expect(note).not.toBeNull();
      expect(note!.deletedAt).toBe("2026-01-01T00:00:00Z");
    });
  });

  describe("readFolderForSync", () => {
    it("returns folder data for sync", async () => {
      mockDb.getFirstAsync.mockResolvedValue({
        id: "folder-1",
        name: "Work",
        parent_id: null,
        sort_order: 0,
        favorite: 0,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        deleted_at: null,
      });

      const folder = await readFolderForSync("folder-1");
      expect(folder).not.toBeNull();
      expect(folder!.name).toBe("Work");
      expect(folder!.favorite).toBe(false);
    });

    it("returns null when folder not found", async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);
      const folder = await readFolderForSync("nonexistent");
      expect(folder).toBeNull();
    });
  });
});
