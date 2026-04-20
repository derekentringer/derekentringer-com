import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// ---------- Mocks ----------

vi.mock("uuid", () => ({ v4: vi.fn().mockReturnValue("mock-device-id") }));

const mockApiFetch = vi.fn();
const mockGetAccessToken = vi.fn().mockReturnValue("mock-token");
const mockRefreshAccessToken = vi.fn().mockResolvedValue("mock-token");
const mockGetMsUntilExpiry = vi.fn().mockReturnValue(10 * 60 * 1000);
vi.mock("../api/client.ts", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  getAccessToken: () => mockGetAccessToken(),
  refreshAccessToken: () => mockRefreshAccessToken(),
  tokenManager: {
    getMsUntilExpiry: () => mockGetMsUntilExpiry(),
  },
}));

const mockReadSyncQueue = vi.fn().mockResolvedValue([]);
const mockRemoveSyncQueueEntries = vi.fn().mockResolvedValue(undefined);
const mockGetSyncMeta = vi.fn().mockResolvedValue(null);
const mockSetSyncMeta = vi.fn().mockResolvedValue(undefined);
const mockFetchNoteById = vi.fn().mockResolvedValue(null);
const mockFetchNoteEmbeddingInputById = vi.fn().mockResolvedValue(null);
const mockUpsertNoteFromRemote = vi.fn().mockResolvedValue(undefined);
const mockUpsertFolderFromRemote = vi.fn().mockResolvedValue(undefined);
const mockSoftDeleteNoteFromRemote = vi.fn().mockResolvedValue(undefined);
const mockSoftDeleteFolderFromRemote = vi.fn().mockResolvedValue(undefined);

vi.mock("../lib/db.ts", () => ({
  readSyncQueue: (...args: unknown[]) => mockReadSyncQueue(...args),
  removeSyncQueueEntries: (...args: unknown[]) => mockRemoveSyncQueueEntries(...args),
  getSyncMeta: (...args: unknown[]) => mockGetSyncMeta(...args),
  setSyncMeta: (...args: unknown[]) => mockSetSyncMeta(...args),
  fetchNoteById: (...args: unknown[]) => mockFetchNoteById(...args),
  fetchNoteEmbeddingInputById: (...args: unknown[]) => mockFetchNoteEmbeddingInputById(...args),
  upsertNoteFromRemote: (...args: unknown[]) => mockUpsertNoteFromRemote(...args),
  upsertFolderFromRemote: (...args: unknown[]) => mockUpsertFolderFromRemote(...args),
  softDeleteNoteFromRemote: (...args: unknown[]) => mockSoftDeleteNoteFromRemote(...args),
  softDeleteFolderFromRemote: (...args: unknown[]) => mockSoftDeleteFolderFromRemote(...args),
  getNoteLocalPath: vi.fn().mockResolvedValue(null),
  // Phase A.4 reconciler deps — default to "no flip" so existing tests
  // don't trigger the reconcile path.
  getLocalFolderIsLocalFile: vi.fn().mockResolvedValue(null),
  getFolderNotesForReconcile: vi.fn().mockResolvedValue([]),
  linkNoteToLocalFile: vi.fn().mockResolvedValue(undefined),
  unlinkLocalFile: vi.fn().mockResolvedValue(undefined),
  findManagedDirForFolder: vi.fn().mockResolvedValue(null),
  getFolderManagedDiskPath: vi.fn().mockResolvedValue(null),
  hardDeleteFolderFromRemote: vi.fn().mockResolvedValue(undefined),
  hardDeleteNoteFromRemote: vi.fn().mockResolvedValue(undefined),
  getNoteLocalFileHash: vi.fn().mockResolvedValue(null),
  getNoteLocalFileInfo: vi.fn().mockResolvedValue(null),
  removeManagedDirectory: vi.fn().mockResolvedValue(undefined),
  softDeleteImageFromRemote: vi.fn().mockResolvedValue(undefined),
  upsertImageFromRemote: vi.fn().mockResolvedValue(undefined),
  // Phase 5.2 — parallel image upload mocks
  fetchImageById: (...args: unknown[]) => mockFetchImageById(...args),
  updateImageAfterUpload: (...args: unknown[]) => mockUpdateImageAfterUpload(...args),
  updateNote: (...args: unknown[]) => mockUpdateNote(...args),
}));

const mockFetchImageById = vi.fn();
const mockUpdateImageAfterUpload = vi.fn().mockResolvedValue(undefined);
const mockUpdateNote = vi.fn().mockResolvedValue(undefined);
const mockReadCachedImage = vi.fn();
const mockUploadImage = vi.fn();

vi.mock("../lib/imageCacheService.ts", () => ({
  readCachedImage: (...args: unknown[]) => mockReadCachedImage(...args),
}));

vi.mock("../api/imageApi.ts", () => ({
  uploadImage: (...args: unknown[]) => mockUploadImage(...args),
}));

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: { load: vi.fn().mockResolvedValue({ execute: vi.fn(), select: vi.fn() }) },
}));

const mockQueueEmbeddingForNote = vi.fn().mockResolvedValue(undefined);
vi.mock("../lib/embeddingService.ts", () => ({
  queueEmbeddingForNote: (...args: unknown[]) => mockQueueEmbeddingForNote(...args),
}));

// ---------- Import SUT after mocks ----------

const {
  getSyncStatus,
  initSyncEngine,
  destroySyncEngine,
  notifyLocalChange,
  manualSync,
  forcePushChanges,
  discardChanges,
  setSyncSemanticSearchEnabled,
} = await import("../lib/syncEngine.ts");

// ---------- Helpers ----------

function makePullResponse(
  changes: Array<{ id: string; type: "note" | "folder"; action: string; data?: unknown; timestamp?: string }> = [],
  hasMore = false,
  lastSyncedAt = "2024-06-01T00:00:00.000Z",
) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        changes,
        hasMore,
        cursor: { deviceId: "mock-device-id", lastSyncedAt },
      }),
  };
}

function makePushResponse(applied = 1, rejected = 0, rejections?: Array<{ changeId: string; changeType: string; changeAction: string; reason: string; message: string }>) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        applied,
        rejected,
        cursor: { deviceId: "mock-device-id", lastSyncedAt: "2024-06-01T00:00:00.000Z" },
        ...(rejections ? { rejections } : {}),
      }),
  };
}

/** Set up apiFetch to succeed for both push (no queue) and pull (no changes). */
function mockSuccessfulEmptySync() {
  mockReadSyncQueue.mockResolvedValue([]);
  mockApiFetch.mockResolvedValue(makePullResponse());
}

/** Wait for all pending micro-tasks / resolved promises to flush. */
async function flushPromises() {
  await new Promise((r) => setTimeout(r, 0));
}

// ---------- Test suite ----------

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  destroySyncEngine();
  Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
  mockGetAccessToken.mockReturnValue("mock-token");
  // Default: SSE fetch hangs (never resolves) so it doesn't interfere with sync tests
  mockFetch = vi.fn().mockReturnValue(new Promise(() => {}));
  globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  vi.useRealTimers();
  destroySyncEngine();
  globalThis.fetch = originalFetch;
});

describe("syncEngine", () => {
  // 1
  it("getSyncStatus returns idle initially", () => {
    const { status, error } = getSyncStatus();
    expect(status).toBe("idle");
    expect(error).toBeNull();
  });

  // 2
  it("initSyncEngine generates and stores device ID when none exists", async () => {
    mockGetSyncMeta.mockResolvedValue(null);
    mockSuccessfulEmptySync();

    const onStatusChange = vi.fn();
    const onDataChanged = vi.fn();
    await initSyncEngine({ onStatusChange, onDataChanged });
    await flushPromises();

    // Should have asked for stored device ID
    expect(mockGetSyncMeta).toHaveBeenCalledWith("deviceId");
    // Should have stored the new UUID
    expect(mockSetSyncMeta).toHaveBeenCalledWith("deviceId", "mock-device-id");
  });

  // 3
  it("initSyncEngine uses existing device ID if stored", async () => {
    mockGetSyncMeta.mockImplementation((key: string) => {
      if (key === "deviceId") return Promise.resolve("existing-device-id");
      return Promise.resolve(null);
    });
    mockSuccessfulEmptySync();

    const onStatusChange = vi.fn();
    const onDataChanged = vi.fn();
    await initSyncEngine({ onStatusChange, onDataChanged });
    await flushPromises();

    // Should NOT store a new device ID since one already exists
    expect(mockSetSyncMeta).not.toHaveBeenCalledWith("deviceId", expect.anything());
  });

  // 4
  it("initSyncEngine triggers initial sync when online", async () => {
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
    mockGetSyncMeta.mockResolvedValue(null);
    mockSuccessfulEmptySync();

    const onStatusChange = vi.fn();
    const onDataChanged = vi.fn();
    await initSyncEngine({ onStatusChange, onDataChanged });
    await flushPromises();

    // Should have called apiFetch for pull (push has empty queue so no call)
    expect(mockApiFetch).toHaveBeenCalledWith("/sync/pull", expect.objectContaining({ method: "POST" }));
    // Should transition through syncing -> idle
    expect(onStatusChange).toHaveBeenCalledWith("syncing", null);
  });

  // 5
  it("initSyncEngine sets offline status when offline", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true });
    mockGetSyncMeta.mockResolvedValue(null);

    const onStatusChange = vi.fn();
    const onDataChanged = vi.fn();
    await initSyncEngine({ onStatusChange, onDataChanged });
    await flushPromises();

    expect(onStatusChange).toHaveBeenCalledWith("offline", null);
    // Should NOT have called apiFetch since we are offline
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  // 6
  it("destroySyncEngine resets status to idle", async () => {
    mockGetSyncMeta.mockResolvedValue(null);
    mockSuccessfulEmptySync();

    const onStatusChange = vi.fn();
    const onDataChanged = vi.fn();
    await initSyncEngine({ onStatusChange, onDataChanged });
    await flushPromises();

    destroySyncEngine();

    const { status, error } = getSyncStatus();
    expect(status).toBe("idle");
    expect(error).toBeNull();
  });

  // 7
  it("notifyLocalChange debounces sync trigger", async () => {
    vi.useFakeTimers();
    mockGetSyncMeta.mockResolvedValue(null);

    // Init engine while offline so no initial sync fires
    Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true });

    const onStatusChange = vi.fn();
    const onDataChanged = vi.fn();
    await initSyncEngine({ onStatusChange, onDataChanged });

    // Go online and set up mock for the debounced sync
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
    mockApiFetch.mockResolvedValue(makePullResponse());
    mockApiFetch.mockClear();

    // Fire multiple local change notifications rapidly
    notifyLocalChange();
    notifyLocalChange();
    notifyLocalChange();

    // Advance less than 5000ms -- should NOT trigger sync yet
    await vi.advanceTimersByTimeAsync(3000);
    expect(mockApiFetch).not.toHaveBeenCalled();

    // Advance past the debounce threshold (5000ms total from last call)
    await vi.advanceTimersByTimeAsync(2500);

    // Now sync should have been triggered
    expect(mockApiFetch).toHaveBeenCalled();
  });

  // 8
  it("manualSync triggers immediate sync", async () => {
    mockGetSyncMeta.mockResolvedValue(null);
    mockSuccessfulEmptySync();

    const onStatusChange = vi.fn();
    const onDataChanged = vi.fn();
    await initSyncEngine({ onStatusChange, onDataChanged });
    await flushPromises();
    mockApiFetch.mockClear();

    // Set up mock again for the manual sync
    mockApiFetch.mockResolvedValue(makePullResponse());

    manualSync();
    await flushPromises();

    expect(mockApiFetch).toHaveBeenCalledWith("/sync/pull", expect.objectContaining({ method: "POST" }));
  });

  // 9
  it("push sends changes from sync queue to API", async () => {
    mockGetSyncMeta.mockResolvedValue(null);
    mockReadSyncQueue.mockResolvedValue([
      {
        id: 1,
        entity_type: "note",
        entity_id: "note-1",
        action: "local:create",
        created_at: "2024-06-01T00:00:00.000Z",
      },
    ]);
    mockFetchNoteById.mockResolvedValue({
      id: "note-1",
      title: "Test Note",
      content: "Content",
      tags: [],
      favorite: false,
      createdAt: "2024-06-01T00:00:00.000Z",
      updatedAt: "2024-06-01T00:00:00.000Z",
    });
    mockApiFetch
      .mockResolvedValueOnce(makePushResponse())  // push
      .mockResolvedValueOnce(makePullResponse());  // pull

    const onStatusChange = vi.fn();
    const onDataChanged = vi.fn();
    await initSyncEngine({ onStatusChange, onDataChanged });
    await flushPromises();

    // Should have posted to /sync/push
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/sync/push",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"note-1"'),
      }),
    );
  });

  // 10
  it("push deduplicates entries per entity", async () => {
    mockGetSyncMeta.mockResolvedValue(null);
    mockReadSyncQueue.mockResolvedValue([
      {
        id: 1,
        entity_type: "note",
        entity_id: "note-1",
        action: "local:update",
        created_at: "2024-06-01T00:00:00.000Z",
      },
      {
        id: 2,
        entity_type: "note",
        entity_id: "note-1",
        action: "local:update",
        created_at: "2024-06-01T00:01:00.000Z",
      },
      {
        id: 3,
        entity_type: "note",
        entity_id: "note-2",
        action: "local:create",
        created_at: "2024-06-01T00:00:00.000Z",
      },
    ]);
    mockFetchNoteById.mockResolvedValue({
      id: "note-1",
      title: "Test",
      content: "",
      tags: [],
      favorite: false,
      createdAt: "2024-06-01T00:00:00.000Z",
      updatedAt: "2024-06-01T00:01:00.000Z",
    });
    mockApiFetch
      .mockResolvedValueOnce(makePushResponse(2))  // push
      .mockResolvedValueOnce(makePullResponse());   // pull

    const onStatusChange = vi.fn();
    const onDataChanged = vi.fn();
    await initSyncEngine({ onStatusChange, onDataChanged });
    await flushPromises();

    // Find the push call
    const pushCall = mockApiFetch.mock.calls.find(
      (call: unknown[]) => call[0] === "/sync/push",
    );
    expect(pushCall).toBeDefined();
    const body = JSON.parse(pushCall![1].body);
    // Should only have 2 changes (note-1 deduped, note-2 kept)
    expect(body.changes).toHaveLength(2);
    const entityIds = body.changes.map((c: { id: string }) => c.id);
    expect(entityIds).toContain("note-1");
    expect(entityIds).toContain("note-2");
  });

  // 11
  it("push removes queue entries after successful push", async () => {
    mockGetSyncMeta.mockResolvedValue(null);
    mockReadSyncQueue.mockResolvedValue([
      {
        id: 10,
        entity_type: "note",
        entity_id: "note-1",
        action: "local:create",
        created_at: "2024-06-01T00:00:00.000Z",
      },
      {
        id: 11,
        entity_type: "note",
        entity_id: "note-1",
        action: "local:update",
        created_at: "2024-06-01T00:01:00.000Z",
      },
    ]);
    mockFetchNoteById.mockResolvedValue({
      id: "note-1",
      title: "Test",
      content: "",
      tags: [],
      favorite: false,
      createdAt: "2024-06-01T00:00:00.000Z",
      updatedAt: "2024-06-01T00:01:00.000Z",
    });
    mockApiFetch
      .mockResolvedValueOnce(makePushResponse())  // push
      .mockResolvedValueOnce(makePullResponse());  // pull

    const onStatusChange = vi.fn();
    const onDataChanged = vi.fn();
    await initSyncEngine({ onStatusChange, onDataChanged });
    await flushPromises();

    // All original entries (not just deduped) should be removed
    expect(mockRemoveSyncQueueEntries).toHaveBeenCalledWith([10, 11]);
  });

  // 12
  it("pull applies note changes from server", async () => {
    mockGetSyncMeta.mockResolvedValue(null);
    mockReadSyncQueue.mockResolvedValue([]); // empty push queue

    const noteData = {
      id: "remote-note-1",
      title: "Remote Note",
      content: "Remote content",
      tags: [],
      favorite: false,
      createdAt: "2024-06-01T00:00:00.000Z",
      updatedAt: "2024-06-01T00:00:00.000Z",
    };

    mockApiFetch.mockResolvedValue(
      makePullResponse([
        { id: "remote-note-1", type: "note", action: "create", data: noteData, timestamp: "2024-06-01T00:00:00.000Z" },
        { id: "remote-note-2", type: "note", action: "delete", timestamp: "2024-06-01T00:00:00.000Z" },
      ]),
    );

    const onStatusChange = vi.fn();
    const onDataChanged = vi.fn();
    await initSyncEngine({ onStatusChange, onDataChanged });
    await flushPromises();

    // Should upsert the created note
    expect(mockUpsertNoteFromRemote).toHaveBeenCalledWith(noteData);
    // Should soft-delete the deleted note
    expect(mockSoftDeleteNoteFromRemote).toHaveBeenCalledWith("remote-note-2", "2024-06-01T00:00:00.000Z");
    // Should notify UI of data changes
    expect(onDataChanged).toHaveBeenCalled();
  });

  // Phase 5.1 — embedding dedup on pull
  describe("embedding dedup on pull", () => {
    const noteData = {
      id: "note-dedup",
      title: "Title",
      content: "Hello world",
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
      createdAt: "2024-06-01T00:00:00.000Z",
      updatedAt: "2024-06-01T00:00:00.000Z",
      deletedAt: null,
    };

    async function runPullWithNote() {
      mockGetSyncMeta.mockResolvedValue(null);
      mockReadSyncQueue.mockResolvedValue([]);
      mockApiFetch.mockResolvedValue(
        makePullResponse([
          { id: "note-dedup", type: "note", action: "update", data: noteData, timestamp: "2024-06-01T00:00:00.000Z" },
        ]),
      );
      await initSyncEngine({ onStatusChange: vi.fn(), onDataChanged: vi.fn() });
      await flushPromises();
      // fetchNoteEmbeddingInputById is awaited inside applyNoteChange,
      // so by now that call has definitely happened. The embedding
      // queue itself is fire-and-forget via dynamic import, so assert
      // on its state via waitFor in the individual test bodies rather
      // than relying on microtask-tick counts.
    }

    /**
     * Give the fire-and-forget embedding import a real chance to settle.
     * Dynamic import() takes more than one microtask tick to resolve
     * in vitest; flushPromises alone isn't enough.
     */
    async function settleEmbeddingDispatch() {
      await new Promise((r) => setTimeout(r, 20));
    }

    it("skips queueEmbeddingForNote when title + content match the existing row", async () => {
      setSyncSemanticSearchEnabled(true);
      mockFetchNoteEmbeddingInputById.mockResolvedValue({ title: "Title", content: "Hello world" });

      await runPullWithNote();
      await settleEmbeddingDispatch();

      expect(mockFetchNoteEmbeddingInputById).toHaveBeenCalledWith("note-dedup");
      expect(mockUpsertNoteFromRemote).toHaveBeenCalledWith(noteData);
      expect(mockQueueEmbeddingForNote).not.toHaveBeenCalled();
    });

    it("queues an embedding when content changed", async () => {
      setSyncSemanticSearchEnabled(true);
      mockFetchNoteEmbeddingInputById.mockResolvedValue({ title: "Title", content: "stale body" });

      await runPullWithNote();
      await settleEmbeddingDispatch();

      expect(mockQueueEmbeddingForNote).toHaveBeenCalledWith("note-dedup", "Title", "Hello world");
    });

    it("queues an embedding when title changed (even if content matches)", async () => {
      setSyncSemanticSearchEnabled(true);
      mockFetchNoteEmbeddingInputById.mockResolvedValue({ title: "Old Title", content: "Hello world" });

      await runPullWithNote();
      await settleEmbeddingDispatch();

      expect(mockQueueEmbeddingForNote).toHaveBeenCalledWith("note-dedup", "Title", "Hello world");
    });

    it("queues an embedding for a brand-new note (no prior row)", async () => {
      setSyncSemanticSearchEnabled(true);
      mockFetchNoteEmbeddingInputById.mockResolvedValue(null);

      await runPullWithNote();
      await settleEmbeddingDispatch();

      expect(mockQueueEmbeddingForNote).toHaveBeenCalledWith("note-dedup", "Title", "Hello world");
    });

    it("skips queueEmbeddingForNote entirely when semantic search is disabled", async () => {
      setSyncSemanticSearchEnabled(false);
      mockFetchNoteEmbeddingInputById.mockResolvedValue(null);

      await runPullWithNote();
      await settleEmbeddingDispatch();

      // Prior-row fetch is also skipped — dedup work is gated behind the same flag.
      expect(mockFetchNoteEmbeddingInputById).not.toHaveBeenCalled();
      expect(mockQueueEmbeddingForNote).not.toHaveBeenCalled();
    });
  });

  // Phase 5.2 — parallel image upload on push
  describe("parallel image upload on push", () => {
    function makeImageEntry(i: number) {
      return {
        id: i,
        entity_type: "image" as const,
        entity_id: `img-${i}`,
        action: "image:create",
        payload: JSON.stringify({ queued: true }),
        created_at: "2024-06-01T00:00:00.000Z",
      };
    }

    function stubImageDeps() {
      mockFetchImageById.mockImplementation((id: string) =>
        Promise.resolve({
          id,
          noteId: `note-for-${id}`,
          filename: `${id}.png`,
          mimeType: "image/png",
          r2Url: `notesync-local://${id}`,
        }),
      );
      mockReadCachedImage.mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
      // fetchNoteById is used for the placeholder replace path; return
      // a note whose content doesn't include the placeholder so we
      // skip the updateNote call in most tests.
      mockFetchNoteById.mockResolvedValue({
        id: "note-for-img",
        content: "no placeholder here",
      });
    }

    it("uploads multiple queued images concurrently with a bound of 3", async () => {
      const entries = Array.from({ length: 10 }, (_, i) => makeImageEntry(i));
      mockGetSyncMeta.mockResolvedValue(null);
      mockReadSyncQueue.mockResolvedValue(entries);
      stubImageDeps();

      let inFlight = 0;
      let maxInFlight = 0;
      mockUploadImage.mockImplementation(async () => {
        inFlight++;
        if (inFlight > maxInFlight) maxInFlight = inFlight;
        // Small stagger so overlap is observable
        await new Promise((r) => setTimeout(r, 20));
        inFlight--;
        return { r2Url: "https://r2.example/x.png" };
      });
      mockApiFetch
        .mockResolvedValueOnce(makePushResponse())
        .mockResolvedValueOnce(makePullResponse());

      await initSyncEngine({ onStatusChange: vi.fn(), onDataChanged: vi.fn() });
      await new Promise((r) => setTimeout(r, 400));

      // Every queued image got uploaded
      expect(mockUploadImage).toHaveBeenCalledTimes(10);
      // Concurrency cap held
      expect(maxInFlight).toBeGreaterThan(1);
      expect(maxInFlight).toBeLessThanOrEqual(3);
    });

    it("one failed upload does not block the rest of the batch", async () => {
      const entries = Array.from({ length: 5 }, (_, i) => makeImageEntry(i));
      mockGetSyncMeta.mockResolvedValue(null);
      mockReadSyncQueue.mockResolvedValue(entries);
      stubImageDeps();

      mockUploadImage.mockImplementation(async (noteId: string) => {
        if (noteId === "note-for-img-2") {
          throw new Error("synthetic upload failure");
        }
        return { r2Url: "https://r2.example/x.png" };
      });
      mockApiFetch
        .mockResolvedValueOnce(makePushResponse())
        .mockResolvedValueOnce(makePullResponse());

      await initSyncEngine({ onStatusChange: vi.fn(), onDataChanged: vi.fn() });
      await new Promise((r) => setTimeout(r, 200));

      // All 5 attempted; the failure was swallowed and the others
      // went through.
      expect(mockUploadImage).toHaveBeenCalledTimes(5);
      expect(mockUpdateImageAfterUpload).toHaveBeenCalledTimes(4);
    });

    it("image entries do not end up in the /sync/push payload", async () => {
      mockGetSyncMeta.mockResolvedValue(null);
      mockReadSyncQueue.mockResolvedValue([makeImageEntry(0)]);
      stubImageDeps();
      mockUploadImage.mockResolvedValue({ r2Url: "https://r2.example/x.png" });
      mockApiFetch
        .mockResolvedValueOnce(makePushResponse())
        .mockResolvedValueOnce(makePullResponse());

      await initSyncEngine({ onStatusChange: vi.fn(), onDataChanged: vi.fn() });
      await new Promise((r) => setTimeout(r, 100));

      const pushCall = mockApiFetch.mock.calls.find((c) => c[0] === "/sync/push");
      expect(pushCall).toBeTruthy();
      const body = JSON.parse(pushCall![1].body);
      // Image entries are pushed via REST, not the sync protocol —
      // the /sync/push payload must not reference them.
      expect(body.changes.some((c: { id: string }) => c.id === "img-0")).toBe(false);
    });
  });

  // 13
  it("pull applies folder changes from server", async () => {
    mockGetSyncMeta.mockResolvedValue(null);
    mockReadSyncQueue.mockResolvedValue([]);

    const folderData = {
      id: "remote-folder-1",
      name: "Remote Folder",
      parentId: null,
      sortOrder: 0,
      favorite: false,
      createdAt: "2024-06-01T00:00:00.000Z",
      updatedAt: "2024-06-01T00:00:00.000Z",
      deletedAt: null,
    };

    mockApiFetch.mockResolvedValue(
      makePullResponse([
        { id: "remote-folder-1", type: "folder", action: "create", data: folderData, timestamp: "2024-06-01T00:00:00.000Z" },
        { id: "remote-folder-2", type: "folder", action: "delete", timestamp: "2024-06-01T00:00:00.000Z" },
      ]),
    );

    const onStatusChange = vi.fn();
    const onDataChanged = vi.fn();
    await initSyncEngine({ onStatusChange, onDataChanged });
    await flushPromises();

    // Should upsert the created folder
    expect(mockUpsertFolderFromRemote).toHaveBeenCalledWith(folderData);
    // Should soft-delete the deleted folder
    expect(mockSoftDeleteFolderFromRemote).toHaveBeenCalledWith("remote-folder-2");
    // Should notify UI
    expect(onDataChanged).toHaveBeenCalled();
  });

  // 14
  it("pull recurses when hasMore is true", async () => {
    mockGetSyncMeta.mockResolvedValue(null);
    mockReadSyncQueue.mockResolvedValue([]);

    const firstBatchNote = {
      id: "note-batch-1",
      title: "Batch 1",
      content: "",
      tags: [],
      favorite: false,
      createdAt: "2024-06-01T00:00:00.000Z",
      updatedAt: "2024-06-01T00:00:00.000Z",
    };
    const secondBatchNote = {
      id: "note-batch-2",
      title: "Batch 2",
      content: "",
      tags: [],
      favorite: false,
      createdAt: "2024-06-02T00:00:00.000Z",
      updatedAt: "2024-06-02T00:00:00.000Z",
    };

    mockApiFetch
      // First pull returns hasMore: true
      .mockResolvedValueOnce(
        makePullResponse(
          [{ id: "note-batch-1", type: "note", action: "create", data: firstBatchNote, timestamp: "2024-06-01T00:00:00.000Z" }],
          true,
          "2024-06-01T00:00:00.000Z",
        ),
      )
      // Second pull returns hasMore: false
      .mockResolvedValueOnce(
        makePullResponse(
          [{ id: "note-batch-2", type: "note", action: "create", data: secondBatchNote, timestamp: "2024-06-02T00:00:00.000Z" }],
          false,
          "2024-06-02T00:00:00.000Z",
        ),
      );

    const onStatusChange = vi.fn();
    const onDataChanged = vi.fn();
    await initSyncEngine({ onStatusChange, onDataChanged });
    await flushPromises();

    // Should have called pull twice
    const pullCalls = mockApiFetch.mock.calls.filter(
      (call: unknown[]) => call[0] === "/sync/pull",
    );
    expect(pullCalls).toHaveLength(2);

    // Both notes should have been upserted
    expect(mockUpsertNoteFromRemote).toHaveBeenCalledTimes(2);
    expect(mockUpsertNoteFromRemote).toHaveBeenCalledWith(firstBatchNote);
    expect(mockUpsertNoteFromRemote).toHaveBeenCalledWith(secondBatchNote);

    // Cursor should be updated twice
    expect(mockSetSyncMeta).toHaveBeenCalledWith("lastPullAt", "2024-06-01T00:00:00.000Z");
    expect(mockSetSyncMeta).toHaveBeenCalledWith("lastPullAt", "2024-06-02T00:00:00.000Z");
  });

  // 15
  it("sync sets error status on API failure", async () => {
    mockGetSyncMeta.mockResolvedValue(null);
    mockReadSyncQueue.mockResolvedValue([]);
    mockApiFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    const onStatusChange = vi.fn();
    const onDataChanged = vi.fn();
    await initSyncEngine({ onStatusChange, onDataChanged });
    await flushPromises();

    // Should have set error status
    expect(onStatusChange).toHaveBeenCalledWith("error", expect.stringContaining("Pull failed"));
    const { status, error } = getSyncStatus();
    expect(status).toBe("error");
    expect(error).toContain("Pull failed");
  });

  // ---------- SSE tests ----------

  // 16
  it("SSE connects on init when online", async () => {
    mockGetSyncMeta.mockResolvedValue(null);
    mockSuccessfulEmptySync();

    const onStatusChange = vi.fn();
    const onDataChanged = vi.fn();
    await initSyncEngine({ onStatusChange, onDataChanged });
    await flushPromises();

    // fetch should have been called for SSE endpoint
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/sync/events?deviceId="),
      expect.objectContaining({
        headers: { Authorization: "Bearer mock-token" },
      }),
    );
  });

  // 17
  it("SSE triggers sync on sync event", async () => {
    mockGetSyncMeta.mockResolvedValue(null);
    mockSuccessfulEmptySync();

    // Create a ReadableStream that emits an SSE sync event then closes
    const ssePayload = "event: sync\ndata: {}\n\n";
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(ssePayload));
        // Close after a tick so the reader loop finishes
        setTimeout(() => controller.close(), 10);
      },
    });
    mockFetch.mockResolvedValue({ ok: true, body: stream });

    const onStatusChange = vi.fn();
    const onDataChanged = vi.fn();
    await initSyncEngine({ onStatusChange, onDataChanged });
    await flushPromises();
    // Wait for the SSE stream to be read and processed
    await new Promise((r) => setTimeout(r, 50));
    await flushPromises();

    // The initial sync + SSE-triggered sync should both call pull
    const pullCalls = mockApiFetch.mock.calls.filter(
      (call: unknown[]) => call[0] === "/sync/pull",
    );
    expect(pullCalls.length).toBeGreaterThanOrEqual(1);
  });

  // 18
  it("SSE reconnects with backoff on failure", async () => {
    vi.useFakeTimers();
    mockGetSyncMeta.mockResolvedValue(null);
    mockSuccessfulEmptySync();

    // SSE fetch rejects immediately
    mockFetch.mockRejectedValue(new Error("network error"));

    const onStatusChange = vi.fn();
    const onDataChanged = vi.fn();
    await initSyncEngine({ onStatusChange, onDataChanged });
    await vi.advanceTimersByTimeAsync(0);

    // First SSE attempt failed, should schedule reconnect at 1s
    const firstCallCount = mockFetch.mock.calls.length;

    // Advance 1s — should attempt reconnect
    mockFetch.mockRejectedValue(new Error("still down"));
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch.mock.calls.length).toBeGreaterThan(firstCallCount);

    // Next reconnect should be at 2s (backoff doubled)
    const secondCallCount = mockFetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(0);
    // Should NOT have reconnected yet (only 1s passed, need 2s)
    expect(mockFetch.mock.calls.length).toBe(secondCallCount);

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(0);
    // Now 2s has passed — should reconnect
    expect(mockFetch.mock.calls.length).toBeGreaterThan(secondCallCount);
  });

  // 19
  it("SSE disconnects on destroy", async () => {
    mockGetSyncMeta.mockResolvedValue(null);
    mockSuccessfulEmptySync();

    // SSE fetch hangs forever (simulates open connection)
    let abortSignal: AbortSignal | undefined;
    mockFetch.mockImplementation((_url: string, opts?: { signal?: AbortSignal }) => {
      abortSignal = opts?.signal;
      return new Promise(() => {});
    });

    const onStatusChange = vi.fn();
    const onDataChanged = vi.fn();
    await initSyncEngine({ onStatusChange, onDataChanged });
    await flushPromises();

    expect(abortSignal).toBeDefined();
    expect(abortSignal!.aborted).toBe(false);

    destroySyncEngine();

    expect(abortSignal!.aborted).toBe(true);
  });

  // 20
  it("SSE does not connect when offline", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true });
    mockGetSyncMeta.mockResolvedValue(null);

    const onStatusChange = vi.fn();
    const onDataChanged = vi.fn();
    await initSyncEngine({ onStatusChange, onDataChanged });
    await flushPromises();

    // fetch should NOT have been called (neither for sync nor SSE)
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  // ---------- Rejection callback tests ----------

  // 21
  it("calls onSyncRejections when server returns rejections", async () => {
    mockGetSyncMeta.mockResolvedValue(null);
    mockReadSyncQueue.mockResolvedValue([
      {
        id: 1,
        entity_type: "note",
        entity_id: "note-1",
        action: "local:update",
        created_at: "2024-06-01T00:00:00.000Z",
      },
    ]);
    mockFetchNoteById.mockResolvedValue({
      id: "note-1",
      title: "Test",
      content: "",
      tags: [],
      favorite: false,
      createdAt: "2024-06-01T00:00:00.000Z",
      updatedAt: "2024-06-01T00:00:00.000Z",
    });

    const rejections = [
      {
        changeId: "note-1",
        changeType: "note",
        changeAction: "update",
        reason: "timestamp_conflict",
        message: "Server has a newer version",
      },
    ];
    mockApiFetch
      .mockResolvedValueOnce(makePushResponse(0, 0, rejections))
      .mockResolvedValueOnce(makePullResponse());

    const onSyncRejections = vi.fn();
    const onStatusChange = vi.fn();
    const onDataChanged = vi.fn();
    await initSyncEngine({ onStatusChange, onDataChanged, onSyncRejections });
    await flushPromises();

    expect(onSyncRejections).toHaveBeenCalledTimes(1);
    expect(onSyncRejections).toHaveBeenCalledWith(
      rejections,
      expect.any(Function),
      expect.any(Function),
    );
    // Should set error status without throwing (no backoff retry)
    expect(onStatusChange).toHaveBeenCalledWith("error", expect.stringContaining("rejected"));
  });

  // 22
  it("removes only applied entries when there are rejections", async () => {
    mockGetSyncMeta.mockResolvedValue(null);
    mockReadSyncQueue.mockResolvedValue([
      {
        id: 1,
        entity_type: "note",
        entity_id: "note-1",
        action: "local:update",
        created_at: "2024-06-01T00:00:00.000Z",
      },
      {
        id: 2,
        entity_type: "note",
        entity_id: "note-2",
        action: "local:create",
        created_at: "2024-06-01T00:00:00.000Z",
      },
    ]);
    mockFetchNoteById.mockResolvedValue({
      id: "note-1",
      title: "Test",
      content: "",
      tags: [],
      favorite: false,
      createdAt: "2024-06-01T00:00:00.000Z",
      updatedAt: "2024-06-01T00:00:00.000Z",
    });

    const rejections = [
      {
        changeId: "note-1",
        changeType: "note",
        changeAction: "update",
        reason: "fk_constraint",
        message: "FK error",
      },
    ];
    mockApiFetch
      .mockResolvedValueOnce(makePushResponse(1, 1, rejections))
      .mockResolvedValueOnce(makePullResponse());

    const onSyncRejections = vi.fn();
    await initSyncEngine({
      onStatusChange: vi.fn(),
      onDataChanged: vi.fn(),
      onSyncRejections,
    });
    await flushPromises();

    // Only note-2 (id=2) should be removed; note-1 (id=1) is rejected
    expect(mockRemoveSyncQueueEntries).toHaveBeenCalledWith([2]);
  });

  // 23
  it("forcePushChanges sends changes with force flag", async () => {
    mockReadSyncQueue.mockResolvedValue([
      {
        id: 1,
        entity_type: "note",
        entity_id: "note-1",
        action: "local:update",
        created_at: "2024-06-01T00:00:00.000Z",
      },
    ]);
    mockFetchNoteById.mockResolvedValue({
      id: "note-1",
      title: "Test",
      content: "",
      tags: [],
      favorite: false,
      createdAt: "2024-06-01T00:00:00.000Z",
      updatedAt: "2024-06-01T00:00:00.000Z",
    });
    mockApiFetch.mockResolvedValue(makePushResponse(1, 0));

    await forcePushChanges("mock-device-id", ["note-1"]);
    await flushPromises();

    const pushCall = mockApiFetch.mock.calls.find(
      (call: unknown[]) => call[0] === "/sync/push",
    );
    expect(pushCall).toBeDefined();
    const body = JSON.parse(pushCall![1].body);
    expect(body.changes[0].force).toBe(true);
    expect(mockRemoveSyncQueueEntries).toHaveBeenCalledWith([1]);
  });

  // 24
  it("discardChanges removes entries and pulls latest", async () => {
    mockReadSyncQueue.mockResolvedValue([
      {
        id: 5,
        entity_type: "note",
        entity_id: "note-1",
        action: "local:update",
        created_at: "2024-06-01T00:00:00.000Z",
      },
      {
        id: 6,
        entity_type: "note",
        entity_id: "note-2",
        action: "local:create",
        created_at: "2024-06-01T00:00:00.000Z",
      },
    ]);
    mockApiFetch.mockResolvedValue(makePullResponse());

    await discardChanges("mock-device-id", ["note-1"]);
    await flushPromises();

    // Should remove only the discarded entry
    expect(mockRemoveSyncQueueEntries).toHaveBeenCalledWith([5]);
    // Should pull latest
    expect(mockApiFetch).toHaveBeenCalledWith("/sync/pull", expect.objectContaining({ method: "POST" }));
  });
});
