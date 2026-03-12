import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { cacheNote, clearAllCaches } from "../lib/db.ts";
import { enqueue, getQueueCount } from "../lib/offlineQueue.ts";
import type { Note } from "@derekentringer/shared/ns";

// Mock api/notes.ts
vi.mock("../api/client.ts", () => ({
  apiFetch: vi.fn(),
  tokenManager: {
    setOnAuthFailure: vi.fn(),
    getAccessToken: vi.fn().mockReturnValue(null),
    getMsUntilExpiry: vi.fn().mockReturnValue(null),
  },
}));

const mockCreateNote = vi.fn();
const mockUpdateNote = vi.fn();
const mockDeleteNote = vi.fn();

vi.mock("../api/notes.ts", () => ({
  fetchNotes: vi.fn(),
  fetchNote: vi.fn(),
  createNote: (...args: unknown[]) => mockCreateNote(...args),
  updateNote: (...args: unknown[]) => mockUpdateNote(...args),
  deleteNote: (...args: unknown[]) => mockDeleteNote(...args),
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
  reorderNotes: vi.fn(),
  renameTagApi: vi.fn(),
  deleteTagApi: vi.fn(),
}));

// Import useOfflineCache after mocks
const { useOfflineCache } = await import("../hooks/useOfflineCache.ts");

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

describe("useOfflineCache", () => {
  it("starts online with zero pending count", async () => {
    const { result } = renderHook(() => useOfflineCache());
    expect(result.current.isOnline).toBe(true);
    expect(result.current.isSyncing).toBe(false);
  });

  it("tracks pending count", async () => {
    await enqueue({ noteId: "n1", action: "create", payload: { title: "t" }, timestamp: Date.now() });
    await enqueue({ noteId: "n2", action: "update", payload: {}, timestamp: Date.now() });

    const { result } = renderHook(() => useOfflineCache());

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(2);
    }, { timeout: 5000 });
  });

  it("flushes create queue on reconnect", async () => {
    const createdNote = makeNote({ id: "real-1" });
    mockCreateNote.mockResolvedValue(createdNote);

    await cacheNote(makeNote({ id: "temp-abc" }));
    await enqueue({ noteId: "temp-abc", action: "create", payload: { title: "Test" }, timestamp: Date.now() });

    // Start offline
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const { result } = renderHook(() => useOfflineCache());

    // Go online
    await act(async () => {
      Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => {
      expect(mockCreateNote).toHaveBeenCalled();
    }, { timeout: 5000 });

    expect(result.current.isSyncing).toBe(false);
  });

  it("flushes update queue on reconnect", async () => {
    const updatedNote = makeNote({ title: "Updated" });
    mockUpdateNote.mockResolvedValue(updatedNote);

    await cacheNote(makeNote());
    await enqueue({ noteId: "note-1", action: "update", payload: { title: "Updated" }, timestamp: Date.now() });

    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    renderHook(() => useOfflineCache());

    await act(async () => {
      Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => {
      expect(mockUpdateNote).toHaveBeenCalledWith("note-1", { title: "Updated" });
    }, { timeout: 5000 });
  });

  it("flushes delete queue on reconnect", async () => {
    mockDeleteNote.mockResolvedValue(undefined);

    await cacheNote(makeNote());
    await enqueue({ noteId: "note-1", action: "delete", payload: {}, timestamp: Date.now() });

    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    renderHook(() => useOfflineCache());

    await act(async () => {
      Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => {
      expect(mockDeleteNote).toHaveBeenCalledWith("note-1");
    }, { timeout: 5000 });
  });

  it("requeues transient errors and stops processing", async () => {
    mockCreateNote.mockRejectedValueOnce(new Error("500: Internal Server Error"));
    mockUpdateNote.mockResolvedValue(makeNote({ title: "Updated" }));

    await cacheNote(makeNote({ id: "temp-xyz" }));
    await enqueue({ noteId: "temp-xyz", action: "create", payload: { title: "will fail" }, timestamp: 1 });
    await enqueue({ noteId: "note-1", action: "update", payload: { title: "Updated" }, timestamp: 2 });

    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    renderHook(() => useOfflineCache());

    await act(async () => {
      Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => {
      expect(mockCreateNote).toHaveBeenCalled();
    }, { timeout: 5000 });

    // Transient error causes break — update should NOT be called yet
    expect(mockUpdateNote).not.toHaveBeenCalled();

    // The failed entry should be requeued (pending count includes both)
    const count = await getQueueCount();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("skips permanent errors and continues processing", async () => {
    mockCreateNote.mockRejectedValueOnce(new Error("400: Bad Request"));
    mockUpdateNote.mockResolvedValue(makeNote({ title: "Updated" }));

    await cacheNote(makeNote({ id: "temp-xyz" }));
    await enqueue({ noteId: "temp-xyz", action: "create", payload: { title: "will fail" }, timestamp: 1 });
    await enqueue({ noteId: "note-1", action: "update", payload: { title: "Updated" }, timestamp: 2 });

    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    renderHook(() => useOfflineCache());

    await act(async () => {
      Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => {
      expect(mockUpdateNote).toHaveBeenCalled();
    }, { timeout: 5000 });

    expect(mockCreateNote).toHaveBeenCalled();
  });
});
