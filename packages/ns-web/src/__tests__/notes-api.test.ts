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
