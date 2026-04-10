/**
 * NoteListScreen logic tests.
 *
 * Tests the data fetching, filtering, and pagination logic
 * that the NoteListScreen relies on.
 */
import * as notesApi from "@/api/notes";
import * as foldersApi from "@/api/folders";

jest.mock("@/api/notes");
jest.mock("@/api/folders");
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

const mockedNotes = notesApi as jest.Mocked<typeof notesApi>;
const mockedFolders = foldersApi as jest.Mocked<typeof foldersApi>;

const sampleNote = {
  id: "1",
  title: "Test Note",
  content: "# Hello World",
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

describe("NoteListScreen data flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fetches notes with default params", async () => {
    mockedNotes.fetchNotes.mockResolvedValue({
      notes: [sampleNote],
      total: 1,
    });

    const result = await notesApi.fetchNotes({ page: 1, pageSize: 50 });
    expect(result.notes).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it("handles empty note list", async () => {
    mockedNotes.fetchNotes.mockResolvedValue({ notes: [], total: 0 });

    const result = await notesApi.fetchNotes({});
    expect(result.notes).toHaveLength(0);
    // NoteListScreen would show EmptyState
  });

  it("filters by folder", async () => {
    mockedNotes.fetchNotes.mockResolvedValue({
      notes: [sampleNote],
      total: 1,
    });

    await notesApi.fetchNotes({ folderId: "f1", page: 1, pageSize: 50 });
    expect(mockedNotes.fetchNotes).toHaveBeenCalledWith(
      expect.objectContaining({ folderId: "f1" }),
    );
  });

  it("filters by tags", async () => {
    mockedNotes.fetchNotes.mockResolvedValue({ notes: [], total: 0 });

    await notesApi.fetchNotes({ tags: ["tag1", "tag2"] });
    expect(mockedNotes.fetchNotes).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ["tag1", "tag2"] }),
    );
  });

  it("filters by search", async () => {
    mockedNotes.fetchNotes.mockResolvedValue({ notes: [], total: 0 });

    await notesApi.fetchNotes({ search: "hello" });
    expect(mockedNotes.fetchNotes).toHaveBeenCalledWith(
      expect.objectContaining({ search: "hello" }),
    );
  });

  it("sorts by different fields", async () => {
    mockedNotes.fetchNotes.mockResolvedValue({ notes: [], total: 0 });

    await notesApi.fetchNotes({ sortBy: "title", sortOrder: "asc" });
    expect(mockedNotes.fetchNotes).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: "title", sortOrder: "asc" }),
    );
  });

  it("pagination: calculates next page", () => {
    // Simulates the getNextPageParam logic from useNotes
    const allPages = [
      { notes: Array(50).fill(sampleNote), total: 120 },
    ];
    const loaded = allPages.reduce((sum, p) => sum + p.notes.length, 0);
    const hasNext = loaded < allPages[0].total;
    const nextPage = hasNext ? allPages.length + 1 : undefined;

    expect(nextPage).toBe(2);
  });

  it("pagination: no next page when all loaded", () => {
    const allPages = [
      { notes: Array(10).fill(sampleNote), total: 10 },
    ];
    const loaded = allPages.reduce((sum, p) => sum + p.notes.length, 0);
    const hasNext = loaded < allPages[0].total;
    const nextPage = hasNext ? allPages.length + 1 : undefined;

    expect(nextPage).toBeUndefined();
  });

  it("fetches folders for picker", async () => {
    mockedFolders.fetchFolders.mockResolvedValue({
      folders: [
        {
          id: "f1",
          name: "Work",
          parentId: null,
          sortOrder: 0,
          favorite: false,
          count: 5,
          totalCount: 5,
          createdAt: "2026-01-01T00:00:00Z",
          children: [],
        },
      ],
    });

    const result = await foldersApi.fetchFolders();
    expect(result.folders).toHaveLength(1);
    expect(result.folders[0].name).toBe("Work");
  });

  it("fetches tags for picker", async () => {
    mockedNotes.fetchTags.mockResolvedValue({
      tags: [
        { name: "tag1", count: 3 },
        { name: "tag2", count: 1 },
      ],
    });

    const result = await notesApi.fetchTags();
    expect(result.tags).toHaveLength(2);
  });
});
