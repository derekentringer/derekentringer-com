import { describe, it, expect, beforeEach, vi } from "vitest";
import { cacheNote, getCachedNote, cacheNoteList, cacheFolders, cacheTags, clearAllCaches } from "../lib/db.ts";
import { getQueueCount, peekAll, clearQueue } from "../lib/offlineQueue.ts";
import type { Note } from "@derekentringer/shared/ns";

// Mock the real API
vi.mock("../api/client.ts", () => ({
  apiFetch: vi.fn(),
  tokenManager: {
    setOnAuthFailure: vi.fn(),
    getAccessToken: vi.fn().mockReturnValue(null),
    getMsUntilExpiry: vi.fn().mockReturnValue(null),
  },
}));

const mockApi = {
  fetchNotes: vi.fn(),
  fetchNote: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  fetchFolders: vi.fn(),
  fetchTags: vi.fn(),
  fetchTrash: vi.fn(),
  restoreNote: vi.fn(),
  permanentDeleteNote: vi.fn(),
  createFolderApi: vi.fn(),
  renameFolderApi: vi.fn(),
  deleteFolderApi: vi.fn(),
  moveFolderApi: vi.fn(),
  reorderFoldersApi: vi.fn(),
  renameTagApi: vi.fn(),
  deleteTagApi: vi.fn(),
};

vi.mock("../api/notes.ts", () => mockApi);

// Import after mocks are set up
const offlineNotes = await import("../api/offlineNotes.ts");

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "note-1",
    title: "Test",
    content: "content",
    folder: null,
    folderId: null,
    folderPath: null,
    tags: [],
    summary: null,
    favorite: false,
    sortOrder: 0,
    favoriteSortOrder: 0,
    isLocalFile: false,
    audioMode: null,
    transcript: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  await clearAllCaches();
  Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
});

describe("offlineNotes", () => {
  describe("fetchNotes", () => {
    it("returns API result when online and caches", async () => {
      const note = makeNote();
      mockApi.fetchNotes.mockResolvedValue({ notes: [note], total: 1 });

      const result = await offlineNotes.fetchNotes();
      expect(result.notes).toHaveLength(1);
      expect(mockApi.fetchNotes).toHaveBeenCalled();
    });

    it("falls back to cache when offline", async () => {
      await cacheNoteList([makeNote()]);
      Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
      mockApi.fetchNotes.mockRejectedValue(new Error("network error"));

      const result = await offlineNotes.fetchNotes();
      expect(result.notes).toHaveLength(1);
    });
  });

  describe("fetchNote", () => {
    it("returns API result when online", async () => {
      const note = makeNote();
      mockApi.fetchNote.mockResolvedValue(note);

      const result = await offlineNotes.fetchNote("note-1");
      expect(result.id).toBe("note-1");
    });

    it("falls back to cache when offline", async () => {
      await cacheNote(makeNote());
      Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
      mockApi.fetchNote.mockRejectedValue(new Error("network error"));

      const result = await offlineNotes.fetchNote("note-1");
      expect(result.id).toBe("note-1");
    });

    it("throws when note not in cache while offline", async () => {
      Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
      mockApi.fetchNote.mockRejectedValue(new Error("network error"));

      await expect(offlineNotes.fetchNote("missing")).rejects.toThrow(
        "Note not available offline",
      );
    });
  });

  describe("createNote", () => {
    it("creates via API when online", async () => {
      const note = makeNote();
      mockApi.createNote.mockResolvedValue(note);

      const result = await offlineNotes.createNote({ title: "Test" });
      expect(result.id).toBe("note-1");
    });

    it("creates temp note and enqueues when offline", async () => {
      Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
      mockApi.createNote.mockRejectedValue(new Error("network error"));

      const result = await offlineNotes.createNote({ title: "Offline Note" });
      expect(result.id).toMatch(/^temp-/);
      expect(result.title).toBe("Offline Note");
      expect(await getQueueCount()).toBe(1);
    });
  });

  describe("updateNote", () => {
    it("updates via API when online", async () => {
      const updated = makeNote({ title: "Updated" });
      mockApi.updateNote.mockResolvedValue(updated);

      const result = await offlineNotes.updateNote("note-1", { title: "Updated" });
      expect(result.title).toBe("Updated");
    });

    it("updates cache and enqueues when offline", async () => {
      await cacheNote(makeNote());
      Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
      mockApi.updateNote.mockRejectedValue(new Error("network error"));

      const result = await offlineNotes.updateNote("note-1", { title: "Offline Update" });
      expect(result.title).toBe("Offline Update");
      expect(await getQueueCount()).toBe(1);

      const cached = await getCachedNote("note-1");
      expect(cached?.title).toBe("Offline Update");
    });
  });

  describe("deleteNote", () => {
    it("deletes via API when online", async () => {
      mockApi.deleteNote.mockResolvedValue(undefined);

      await offlineNotes.deleteNote("note-1");
      expect(mockApi.deleteNote).toHaveBeenCalledWith("note-1");
    });

    it("enqueues delete for real IDs when offline", async () => {
      await cacheNote(makeNote());
      Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
      mockApi.deleteNote.mockRejectedValue(new Error("network error"));

      await offlineNotes.deleteNote("note-1");
      expect(await getQueueCount()).toBe(1);
      const entries = await peekAll();
      expect(entries[0].action).toBe("delete");
    });

    it("discards temp notes without enqueuing", async () => {
      const tempNote = makeNote({ id: "temp-abc123" });
      await cacheNote(tempNote);
      Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
      mockApi.deleteNote.mockRejectedValue(new Error("network error"));

      await offlineNotes.deleteNote("temp-abc123");
      expect(await getQueueCount()).toBe(0);
      expect(await getCachedNote("temp-abc123")).toBeUndefined();
    });
  });

  describe("fetchFolders", () => {
    it("returns API result when online", async () => {
      mockApi.fetchFolders.mockResolvedValue({ folders: [] });
      const result = await offlineNotes.fetchFolders();
      expect(result.folders).toEqual([]);
    });

    it("falls back to cache when offline", async () => {
      await cacheFolders([{ id: "f1", name: "Work", parentId: null, sortOrder: 0, favorite: false, count: 0, totalCount: 0, createdAt: "", children: [] }]);
      Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
      mockApi.fetchFolders.mockRejectedValue(new Error("network error"));

      const result = await offlineNotes.fetchFolders();
      expect(result.folders).toHaveLength(1);
    });
  });

  describe("fetchTags", () => {
    it("returns API result when online", async () => {
      mockApi.fetchTags.mockResolvedValue({ tags: [] });
      const result = await offlineNotes.fetchTags();
      expect(result.tags).toEqual([]);
    });

    it("falls back to cache when offline", async () => {
      await cacheTags([{ name: "js", count: 3 }]);
      Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
      mockApi.fetchTags.mockRejectedValue(new Error("network error"));

      const result = await offlineNotes.fetchTags();
      expect(result.tags).toHaveLength(1);
    });
  });

  describe("isTempId", () => {
    it("returns true for temp IDs", () => {
      expect(offlineNotes.isTempId("temp-abc")).toBe(true);
    });

    it("returns false for real IDs", () => {
      expect(offlineNotes.isTempId("note-1")).toBe(false);
    });
  });
});
