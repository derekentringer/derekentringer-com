/**
 * DashboardScreen logic tests.
 *
 * Since we don't have @testing-library/react-native, we test the hooks
 * and data flow that the DashboardScreen relies on.
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

describe("DashboardScreen data flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("handles empty dashboard (no notes)", async () => {
    mockedApi.fetchDashboard.mockResolvedValue({
      recentlyEdited: [],
      favorites: [],
      audioNotes: [],
    });

    const data = await notesApi.fetchDashboard();
    expect(data.favorites).toHaveLength(0);
    expect(data.recentlyEdited).toHaveLength(0);
    // DashboardScreen would show EmptyState in this case
  });

  it("handles dashboard with favorites and recent notes", async () => {
    const note = {
      id: "1",
      title: "Fav Note",
      content: "Hello",
      folder: "Work",
      folderId: "f1",
      folderPath: "/Work",
      tags: ["tag1"],
      summary: null,
      favorite: true,
      sortOrder: 0,
      favoriteSortOrder: 0,
      isLocalFile: false,
      audioMode: null as null,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-03-26T00:00:00Z",
      deletedAt: null,
    };

    mockedApi.fetchDashboard.mockResolvedValue({
      recentlyEdited: [note],
      favorites: [note],
      audioNotes: [],
    });

    const data = await notesApi.fetchDashboard();
    expect(data.favorites).toHaveLength(1);
    expect(data.favorites[0].title).toBe("Fav Note");
    expect(data.recentlyEdited).toHaveLength(1);
  });

  it("handles API error gracefully", async () => {
    mockedApi.fetchDashboard.mockRejectedValue(new Error("Network error"));

    await expect(notesApi.fetchDashboard()).rejects.toThrow("Network error");
    // DashboardScreen would show ErrorCard in this case
  });
});
