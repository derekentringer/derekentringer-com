import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchNotes,
  fetchNote,
  createNote,
  updateNote,
  deleteNote,
  fetchTrash,
  restoreNote,
  permanentDeleteNote,
  fetchFolders,
  createFolderApi,
  reorderNotes,
  renameFolderApi,
  deleteFolderApi,
  fetchTags,
  renameTagApi,
  deleteTagApi,
} from "../api/notes.ts";

const mockApiFetch = vi.fn();

vi.mock("../api/client.ts", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  setAccessToken: vi.fn(),
  getAccessToken: vi.fn(),
  setOnAuthFailure: vi.fn(),
}));

const mockNote = {
  id: "note-1",
  title: "Test Note",
  content: "Test content",
  folder: null,
  tags: [],
  summary: null,
  sortOrder: 0,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
  deletedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchNotes", () => {
  it("fetches notes without params", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ notes: [mockNote], total: 1 }),
    });

    const result = await fetchNotes();

    expect(mockApiFetch).toHaveBeenCalledWith("/notes");
    expect(result).toEqual({ notes: [mockNote], total: 1 });
  });

  it("fetches notes with search and pagination params", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ notes: [], total: 0 }),
    });

    await fetchNotes({ search: "hello", page: 2, pageSize: 10 });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/notes?search=hello&page=2&pageSize=10",
    );
  });

  it("fetches notes with folder param", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ notes: [], total: 0 }),
    });

    await fetchNotes({ folder: "work" });

    expect(mockApiFetch).toHaveBeenCalledWith("/notes?folder=work");
  });

  it("fetches notes with sortBy and sortOrder params", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ notes: [], total: 0 }),
    });

    await fetchNotes({ sortBy: "title", sortOrder: "asc" });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/notes?sortBy=title&sortOrder=asc",
    );
  });

  it("throws on non-ok response", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(fetchNotes()).rejects.toThrow("Failed to fetch notes: 500");
  });
});

describe("fetchNote", () => {
  it("fetches a single note and extracts .note", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ note: mockNote }),
    });

    const result = await fetchNote("note-1");

    expect(mockApiFetch).toHaveBeenCalledWith("/notes/note-1");
    expect(result).toEqual(mockNote);
  });

  it("throws on non-ok response", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 404 });

    await expect(fetchNote("note-1")).rejects.toThrow(
      "Failed to fetch note: 404",
    );
  });
});

describe("createNote", () => {
  it("sends POST with body and extracts .note", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ note: mockNote }),
    });

    const result = await createNote({ title: "Test Note" });

    expect(mockApiFetch).toHaveBeenCalledWith("/notes", {
      method: "POST",
      body: JSON.stringify({ title: "Test Note" }),
    });
    expect(result).toEqual(mockNote);
  });

  it("throws on non-ok response", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 400 });

    await expect(createNote({ title: "Test" })).rejects.toThrow(
      "Failed to create note: 400",
    );
  });
});

describe("updateNote", () => {
  it("sends PATCH with body and extracts .note", async () => {
    const updated = { ...mockNote, title: "Updated" };
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ note: updated }),
    });

    const result = await updateNote("note-1", { title: "Updated" });

    expect(mockApiFetch).toHaveBeenCalledWith("/notes/note-1", {
      method: "PATCH",
      body: JSON.stringify({ title: "Updated" }),
    });
    expect(result).toEqual(updated);
  });

  it("throws on non-ok response", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(
      updateNote("note-1", { title: "Updated" }),
    ).rejects.toThrow("Failed to update note: 500");
  });
});

describe("deleteNote", () => {
  it("sends DELETE request", async () => {
    mockApiFetch.mockResolvedValue({ ok: true });

    await deleteNote("note-1");

    expect(mockApiFetch).toHaveBeenCalledWith("/notes/note-1", {
      method: "DELETE",
    });
  });

  it("throws on non-ok response", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 403 });

    await expect(deleteNote("note-1")).rejects.toThrow(
      "Failed to delete note: 403",
    );
  });
});

describe("fetchTrash", () => {
  it("fetches trashed notes without params", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ notes: [mockNote], total: 1 }),
    });

    const result = await fetchTrash();

    expect(mockApiFetch).toHaveBeenCalledWith("/notes/trash");
    expect(result).toEqual({ notes: [mockNote], total: 1 });
  });

  it("fetches trashed notes with pagination params", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ notes: [], total: 0 }),
    });

    await fetchTrash({ page: 2, pageSize: 10 });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/notes/trash?page=2&pageSize=10",
    );
  });

  it("throws on non-ok response", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(fetchTrash()).rejects.toThrow("Failed to fetch trash: 500");
  });
});

describe("restoreNote", () => {
  it("sends PATCH to restore endpoint and extracts .note", async () => {
    const restored = { ...mockNote, deletedAt: null };
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ note: restored }),
    });

    const result = await restoreNote("note-1");

    expect(mockApiFetch).toHaveBeenCalledWith("/notes/note-1/restore", {
      method: "PATCH",
    });
    expect(result).toEqual(restored);
  });

  it("throws on non-ok response", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 404 });

    await expect(restoreNote("note-1")).rejects.toThrow(
      "Failed to restore note: 404",
    );
  });
});

describe("permanentDeleteNote", () => {
  it("sends DELETE to permanent endpoint", async () => {
    mockApiFetch.mockResolvedValue({ ok: true });

    await permanentDeleteNote("note-1");

    expect(mockApiFetch).toHaveBeenCalledWith("/notes/note-1/permanent", {
      method: "DELETE",
    });
  });

  it("throws on non-ok response", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 404 });

    await expect(permanentDeleteNote("note-1")).rejects.toThrow(
      "Failed to permanently delete note: 404",
    );
  });
});

describe("fetchFolders", () => {
  it("fetches folder list", async () => {
    const folders = [{ name: "work", count: 3 }];
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ folders }),
    });

    const result = await fetchFolders();

    expect(mockApiFetch).toHaveBeenCalledWith("/notes/folders");
    expect(result).toEqual({ folders });
  });

  it("throws on non-ok response", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(fetchFolders()).rejects.toThrow("Failed to fetch folders: 500");
  });
});

describe("createFolderApi", () => {
  it("sends POST with folder name", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ name: "projects" }),
    });

    const result = await createFolderApi("projects");

    expect(mockApiFetch).toHaveBeenCalledWith("/notes/folders", {
      method: "POST",
      body: JSON.stringify({ name: "projects" }),
    });
    expect(result).toEqual({ name: "projects" });
  });

  it("throws on non-ok response", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 409 });

    await expect(createFolderApi("existing")).rejects.toThrow(
      "Failed to create folder: 409",
    );
  });
});

describe("reorderNotes", () => {
  it("sends PUT with order body", async () => {
    mockApiFetch.mockResolvedValue({ ok: true });

    const order = [
      { id: "note-1", sortOrder: 0 },
      { id: "note-2", sortOrder: 1 },
    ];
    await reorderNotes({ order });

    expect(mockApiFetch).toHaveBeenCalledWith("/notes/reorder", {
      method: "PUT",
      body: JSON.stringify({ order }),
    });
  });

  it("throws on non-ok response", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(reorderNotes({ order: [] })).rejects.toThrow(
      "Failed to reorder notes: 500",
    );
  });
});

describe("renameFolderApi", () => {
  it("sends PATCH with newName", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ updated: 3 }),
    });

    const result = await renameFolderApi("work", "office");

    expect(mockApiFetch).toHaveBeenCalledWith("/notes/folders/work", {
      method: "PATCH",
      body: JSON.stringify({ newName: "office" }),
    });
    expect(result).toEqual({ updated: 3 });
  });

  it("throws on non-ok response", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(renameFolderApi("work", "office")).rejects.toThrow(
      "Failed to rename folder: 500",
    );
  });
});

describe("deleteFolderApi", () => {
  it("sends DELETE request", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ updated: 2 }),
    });

    const result = await deleteFolderApi("work");

    expect(mockApiFetch).toHaveBeenCalledWith("/notes/folders/work", {
      method: "DELETE",
    });
    expect(result).toEqual({ updated: 2 });
  });

  it("throws on non-ok response", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(deleteFolderApi("work")).rejects.toThrow(
      "Failed to delete folder: 500",
    );
  });
});

describe("fetchNotes with tags", () => {
  it("includes tags param in query string", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ notes: [], total: 0 }),
    });

    await fetchNotes({ tags: ["js", "react"] });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/notes?tags=js%2Creact",
    );
  });

  it("omits tags when array is empty", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ notes: [], total: 0 }),
    });

    await fetchNotes({ tags: [] });

    expect(mockApiFetch).toHaveBeenCalledWith("/notes");
  });
});

describe("fetchTags", () => {
  it("fetches tag list", async () => {
    const tags = [{ name: "js", count: 5 }];
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tags }),
    });

    const result = await fetchTags();

    expect(mockApiFetch).toHaveBeenCalledWith("/notes/tags");
    expect(result).toEqual({ tags });
  });

  it("throws on non-ok response", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(fetchTags()).rejects.toThrow("Failed to fetch tags: 500");
  });
});

describe("renameTagApi", () => {
  it("sends PATCH with newName", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ updated: 3 }),
    });

    const result = await renameTagApi("old", "new");

    expect(mockApiFetch).toHaveBeenCalledWith("/notes/tags/old", {
      method: "PATCH",
      body: JSON.stringify({ newName: "new" }),
    });
    expect(result).toEqual({ updated: 3 });
  });

  it("throws on non-ok response", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(renameTagApi("old", "new")).rejects.toThrow(
      "Failed to rename tag: 500",
    );
  });
});

describe("deleteTagApi", () => {
  it("sends DELETE request", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ updated: 2 }),
    });

    const result = await deleteTagApi("old");

    expect(mockApiFetch).toHaveBeenCalledWith("/notes/tags/old", {
      method: "DELETE",
    });
    expect(result).toEqual({ updated: 2 });
  });

  it("throws on non-ok response", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(deleteTagApi("old")).rejects.toThrow(
      "Failed to delete tag: 500",
    );
  });
});
