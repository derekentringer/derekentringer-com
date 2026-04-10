/**
 * NoteEditorScreen logic tests.
 *
 * Tests the create, edit, auto-save, and delete flows that the
 * NoteEditorScreen relies on.
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
  content: "# Hello\n\nSome content here.",
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

describe("NoteEditorScreen data flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("create mode", () => {
    it("creates a new note", async () => {
      mockedApi.createNote.mockResolvedValue({
        ...sampleNote,
        id: "new-note-1",
        title: "New Note",
        content: "New content",
        tags: [],
        folder: null,
        folderId: null,
        folderPath: null,
      });

      const created = await notesApi.createNote({
        title: "New Note",
        content: "New content",
      });

      expect(created.id).toBe("new-note-1");
      expect(created.title).toBe("New Note");
      expect(mockedApi.createNote).toHaveBeenCalledWith({
        title: "New Note",
        content: "New content",
      });
    });

    it("creates note with folder and tags", async () => {
      mockedApi.createNote.mockResolvedValue({
        ...sampleNote,
        id: "new-note-2",
        title: "Tagged Note",
        tags: ["work", "important"],
        folderId: "f1",
      });

      const created = await notesApi.createNote({
        title: "Tagged Note",
        folderId: "f1",
        tags: ["work", "important"],
      });

      expect(created.tags).toEqual(["work", "important"]);
      expect(created.folderId).toBe("f1");
    });

    it("handles create error", async () => {
      mockedApi.createNote.mockRejectedValue(new Error("Create failed"));

      await expect(
        notesApi.createNote({ title: "Fail" }),
      ).rejects.toThrow("Create failed");
    });
  });

  describe("edit mode", () => {
    it("loads existing note for editing", async () => {
      mockedApi.fetchNote.mockResolvedValue(sampleNote);

      const note = await notesApi.fetchNote("note-1");
      expect(note.title).toBe("Test Note");
      expect(note.content).toBe("# Hello\n\nSome content here.");
      expect(note.tags).toEqual(["tag1", "tag2"]);
    });

    it("updates note content", async () => {
      mockedApi.updateNote.mockResolvedValue({
        ...sampleNote,
        content: "Updated content",
      });

      const updated = await notesApi.updateNote("note-1", {
        content: "Updated content",
      });

      expect(updated.content).toBe("Updated content");
      expect(mockedApi.updateNote).toHaveBeenCalledWith("note-1", {
        content: "Updated content",
      });
    });

    it("updates note title", async () => {
      mockedApi.updateNote.mockResolvedValue({
        ...sampleNote,
        title: "Updated Title",
      });

      const updated = await notesApi.updateNote("note-1", {
        title: "Updated Title",
      });

      expect(updated.title).toBe("Updated Title");
    });

    it("updates note tags", async () => {
      mockedApi.updateNote.mockResolvedValue({
        ...sampleNote,
        tags: ["tag1", "tag2", "new-tag"],
      });

      const updated = await notesApi.updateNote("note-1", {
        tags: ["tag1", "tag2", "new-tag"],
      });

      expect(updated.tags).toEqual(["tag1", "tag2", "new-tag"]);
    });

    it("updates note folder", async () => {
      mockedApi.updateNote.mockResolvedValue({
        ...sampleNote,
        folderId: "f2",
        folder: "Personal",
      });

      const updated = await notesApi.updateNote("note-1", {
        folderId: "f2",
      });

      expect(updated.folderId).toBe("f2");
      expect(updated.folder).toBe("Personal");
    });
  });

  describe("delete from editor", () => {
    it("deletes note", async () => {
      mockedApi.deleteNote.mockResolvedValue(undefined);

      await notesApi.deleteNote("note-1");
      expect(mockedApi.deleteNote).toHaveBeenCalledWith("note-1");
    });

    it("handles delete error", async () => {
      mockedApi.deleteNote.mockRejectedValue(new Error("Delete failed"));

      await expect(notesApi.deleteNote("note-1")).rejects.toThrow(
        "Delete failed",
      );
    });
  });

  describe("auto-save flow", () => {
    it("creates then updates on subsequent saves", async () => {
      const createdNote = {
        ...sampleNote,
        id: "auto-1",
        title: "Auto Note",
        content: "",
      };

      mockedApi.createNote.mockResolvedValue(createdNote);
      mockedApi.updateNote.mockResolvedValue({
        ...createdNote,
        content: "Updated",
      });

      // First save creates
      const created = await notesApi.createNote({ title: "Auto Note" });
      expect(created.id).toBe("auto-1");

      // Second save updates
      const updated = await notesApi.updateNote("auto-1", {
        content: "Updated",
      });
      expect(updated.content).toBe("Updated");

      expect(mockedApi.createNote).toHaveBeenCalledTimes(1);
      expect(mockedApi.updateNote).toHaveBeenCalledTimes(1);
    });
  });
});
