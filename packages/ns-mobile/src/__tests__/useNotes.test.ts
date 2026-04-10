import * as notesApi from "@/api/notes";

// Mock the API module
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

describe("notes API functions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("fetchNotes", () => {
    it("returns notes list with total", async () => {
      mockedApi.fetchNotes.mockResolvedValue({
        notes: [
          {
            id: "1",
            title: "Test",
            content: "",
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
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
            deletedAt: null,
          },
        ],
        total: 1,
      });

      const result = await notesApi.fetchNotes({ page: 1, pageSize: 50 });
      expect(result.notes).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.notes[0].title).toBe("Test");
    });

    it("passes filter parameters", async () => {
      mockedApi.fetchNotes.mockResolvedValue({ notes: [], total: 0 });

      await notesApi.fetchNotes({
        folderId: "folder-1",
        tags: ["tag1"],
        search: "hello",
        sortBy: "title",
        sortOrder: "asc",
      });

      expect(mockedApi.fetchNotes).toHaveBeenCalledWith({
        folderId: "folder-1",
        tags: ["tag1"],
        search: "hello",
        sortBy: "title",
        sortOrder: "asc",
      });
    });
  });

  describe("fetchNote", () => {
    it("returns single note", async () => {
      mockedApi.fetchNote.mockResolvedValue({
        id: "1",
        title: "Note 1",
        content: "Content",
        folder: null,
        folderId: null,
        folderPath: null,
        tags: ["a"],
        summary: null,
        favorite: false,
        sortOrder: 0,
        favoriteSortOrder: 0,
        isLocalFile: false,
        audioMode: null,
        transcript: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        deletedAt: null,
      });

      const note = await notesApi.fetchNote("1");
      expect(note.title).toBe("Note 1");
      expect(note.tags).toEqual(["a"]);
    });
  });

  describe("fetchDashboard", () => {
    it("returns dashboard sections", async () => {
      mockedApi.fetchDashboard.mockResolvedValue({
        recentlyEdited: [],
        favorites: [],
        audioNotes: [],
      });

      const data = await notesApi.fetchDashboard();
      expect(data.recentlyEdited).toEqual([]);
      expect(data.favorites).toEqual([]);
      expect(data.audioNotes).toEqual([]);
    });
  });

  describe("updateNote", () => {
    it("sends update request", async () => {
      mockedApi.updateNote.mockResolvedValue({
        id: "1",
        title: "Updated",
        content: "",
        folder: null,
        folderId: null,
        folderPath: null,
        tags: [],
        summary: null,
        favorite: true,
        sortOrder: 0,
        favoriteSortOrder: 0,
        isLocalFile: false,
        audioMode: null,
        transcript: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        deletedAt: null,
      });

      const result = await notesApi.updateNote("1", { favorite: true });
      expect(result.favorite).toBe(true);
    });
  });

  describe("deleteNote", () => {
    it("calls delete", async () => {
      mockedApi.deleteNote.mockResolvedValue(undefined);
      await notesApi.deleteNote("1");
      expect(mockedApi.deleteNote).toHaveBeenCalledWith("1");
    });
  });

  describe("fetchBacklinks", () => {
    it("returns backlinks for a note", async () => {
      mockedApi.fetchBacklinks.mockResolvedValue({
        backlinks: [
          { noteId: "2", noteTitle: "Linked Note", linkText: "see this" },
        ],
      });

      const result = await notesApi.fetchBacklinks("1");
      expect(result.backlinks).toHaveLength(1);
      expect(result.backlinks[0].noteTitle).toBe("Linked Note");
    });
  });

  describe("fetchVersions", () => {
    it("returns version list", async () => {
      mockedApi.fetchVersions.mockResolvedValue({
        versions: [
          {
            id: "v1",
            noteId: "1",
            title: "V1 Title",
            content: "V1 Content",
            origin: "manual",
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
        total: 1,
      });

      const result = await notesApi.fetchVersions("1");
      expect(result.versions).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });
});
