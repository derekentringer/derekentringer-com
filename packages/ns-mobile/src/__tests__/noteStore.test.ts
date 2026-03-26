import * as SQLite from "expo-sqlite";
import { getAllNotes, getNote, upsertNotes, searchNotes } from "@/lib/noteStore";
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

    it("applies search filter", async () => {
      mockDb.getAllAsync.mockResolvedValue([]);
      await getAllNotes({ search: "hello" });
      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining("title LIKE ?"),
        expect.arrayContaining(["%hello%", "%hello%"]),
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
    it("searches by title and content with LIKE", async () => {
      mockDb.getAllAsync.mockResolvedValue([]);
      await searchNotes("test");
      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining("title LIKE ?"),
        ["%test%", "%test%"],
      );
    });

    it("returns mapped Note objects", async () => {
      mockDb.getAllAsync.mockResolvedValue([sampleRow]);
      const results = await searchNotes("test");
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Test Note");
    });
  });
});
