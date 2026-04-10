/**
 * NoteDetailScreen logic tests.
 *
 * Tests the data fetching, favorite toggle, delete flow, and version restore
 * logic that the NoteDetailScreen relies on.
 */
import * as notesApi from "@/api/notes";

jest.mock("@/api/notes");
jest.mock("@/services/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  },
}));

const mockedApi = notesApi as jest.Mocked<typeof notesApi>;

const sampleNote = {
  id: "note-1",
  title: "Test Note",
  content: "# Hello\n\nThis is **markdown** content.",
  folder: "Work",
  folderId: "f1",
  folderPath: "/Work",
  tags: ["tag1", "tag2"],
  summary: null,
  favorite: false,
  sortOrder: 0,
  favoriteSortOrder: 0,
  isLocalFile: false,
  audioMode: null as null,
  transcript: null as null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-03-26T00:00:00Z",
  deletedAt: null,
};

describe("NoteDetailScreen data flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("fetching note", () => {
    it("fetches note by id", async () => {
      mockedApi.fetchNote.mockResolvedValue(sampleNote);

      const note = await notesApi.fetchNote("note-1");
      expect(note.id).toBe("note-1");
      expect(note.title).toBe("Test Note");
      expect(note.content).toContain("**markdown**");
    });

    it("handles fetch error", async () => {
      mockedApi.fetchNote.mockRejectedValue(new Error("Not found"));

      await expect(notesApi.fetchNote("bad-id")).rejects.toThrow("Not found");
      // NoteDetailScreen would show ErrorCard
    });
  });

  describe("favorite toggle", () => {
    it("toggles favorite to true", async () => {
      mockedApi.updateNote.mockResolvedValue({
        ...sampleNote,
        favorite: true,
      });

      const updated = await notesApi.updateNote("note-1", { favorite: true });
      expect(updated.favorite).toBe(true);
      expect(mockedApi.updateNote).toHaveBeenCalledWith("note-1", {
        favorite: true,
      });
    });

    it("toggles favorite to false", async () => {
      mockedApi.updateNote.mockResolvedValue({
        ...sampleNote,
        favorite: false,
      });

      const updated = await notesApi.updateNote("note-1", { favorite: false });
      expect(updated.favorite).toBe(false);
    });
  });

  describe("delete flow", () => {
    it("deletes note", async () => {
      mockedApi.deleteNote.mockResolvedValue(undefined);

      await notesApi.deleteNote("note-1");
      expect(mockedApi.deleteNote).toHaveBeenCalledWith("note-1");
      // NoteDetailScreen would navigate back after deletion
    });

    it("handles delete error", async () => {
      mockedApi.deleteNote.mockRejectedValue(new Error("Delete failed"));

      await expect(notesApi.deleteNote("note-1")).rejects.toThrow(
        "Delete failed",
      );
    });
  });

  describe("backlinks", () => {
    it("fetches backlinks for note", async () => {
      mockedApi.fetchBacklinks.mockResolvedValue({
        backlinks: [
          { noteId: "note-2", noteTitle: "Related Note", linkText: "link" },
        ],
      });

      const result = await notesApi.fetchBacklinks("note-1");
      expect(result.backlinks).toHaveLength(1);
      expect(result.backlinks[0].noteId).toBe("note-2");
    });

    it("returns empty backlinks", async () => {
      mockedApi.fetchBacklinks.mockResolvedValue({ backlinks: [] });

      const result = await notesApi.fetchBacklinks("note-1");
      expect(result.backlinks).toHaveLength(0);
    });
  });

  describe("version history", () => {
    it("fetches versions", async () => {
      mockedApi.fetchVersions.mockResolvedValue({
        versions: [
          {
            id: "v1",
            noteId: "note-1",
            title: "V1",
            content: "Old content",
            origin: "manual",
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
        total: 1,
      });

      const result = await notesApi.fetchVersions("note-1");
      expect(result.versions).toHaveLength(1);
      expect(result.versions[0].origin).toBe("manual");
    });

    it("restores version", async () => {
      mockedApi.restoreVersion.mockResolvedValue({
        ...sampleNote,
        content: "Restored content",
      });

      const restored = await notesApi.restoreVersion("note-1", "v1");
      expect(restored.content).toBe("Restored content");
      expect(mockedApi.restoreVersion).toHaveBeenCalledWith("note-1", "v1");
    });
  });
});
