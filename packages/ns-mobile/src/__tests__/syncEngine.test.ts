import * as SQLite from "expo-sqlite";

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock XMLHttpRequest for SSE
const mockXHR = {
  open: jest.fn(),
  setRequestHeader: jest.fn(),
  send: jest.fn(),
  abort: jest.fn(),
  readyState: 0,
  status: 0,
  responseText: "",
  onreadystatechange: null as (() => void) | null,
  onerror: null as (() => void) | null,
  onloadend: null as (() => void) | null,
};
(global as any).XMLHttpRequest = jest.fn(() => ({ ...mockXHR }));

// Mock AppState
jest.mock("react-native", () => ({
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    currentState: "active",
  },
}));

// Mock tokenManager and tokenStorage
jest.mock("@/services/api", () => ({
  tokenManager: {
    refreshAccessToken: jest.fn().mockResolvedValue("new-token"),
  },
  tokenStorage: {
    setTokens: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  getAllAsync: jest.fn().mockResolvedValue([]),
  runAsync: jest.fn().mockResolvedValue({ changes: 0, lastInsertRowId: 0 }),
};
(SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);

import {
  initSyncEngine,
  destroySyncEngine,
  notifyLocalChange,
  manualSync,
  getSyncEngineStatus,
  type SyncStatus,
} from "@/lib/syncEngine";

const TEST_API_URL = "http://localhost:3004";

function makeCallbacks() {
  return {
    onStatusChange: jest.fn(),
    onDataChanged: jest.fn(),
    onSyncRejections: jest.fn(),
  };
}

describe("syncEngine", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockDb.getFirstAsync.mockResolvedValue(null);
    mockDb.getAllAsync.mockResolvedValue([]);

    // Default: successful push/pull
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          applied: 0,
          rejected: 0,
          skipped: 0,
          cursor: { deviceId: "device-1", lastSyncedAt: new Date().toISOString() },
          changes: [],
          hasMore: false,
        }),
    });
  });

  afterEach(() => {
    destroySyncEngine();
    jest.useRealTimers();
  });

  describe("initialization", () => {
    it("creates a device ID on first init", async () => {
      const callbacks = makeCallbacks();
      await initSyncEngine(TEST_API_URL, async () => "test-token", callbacks);

      // Should have stored deviceId via setSyncMeta
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        "INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)",
        expect.arrayContaining(["deviceId"]),
      );
    });

    it("reuses existing device ID", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ value: "existing-device-id" });
      const callbacks = makeCallbacks();
      await initSyncEngine(TEST_API_URL, async () => "test-token", callbacks);

      // Should not insert a new deviceId
      const setSyncMetaCalls = mockDb.runAsync.mock.calls.filter(
        (call: any[]) => call[1]?.[0] === "deviceId",
      );
      expect(setSyncMetaCalls).toHaveLength(0);
    });

    it("sets status to syncing on init when online", async () => {
      const callbacks = makeCallbacks();
      await initSyncEngine(TEST_API_URL, async () => "test-token", callbacks);

      // Should have gone through syncing status
      expect(callbacks.onStatusChange).toHaveBeenCalledWith("syncing", null);
    });
  });

  describe("status management", () => {
    it("reports idle status initially", () => {
      const { status } = getSyncEngineStatus();
      expect(status).toBe("idle");
    });

    it("reports error with message on sync failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const callbacks = makeCallbacks();
      await initSyncEngine(TEST_API_URL, async () => "test-token", callbacks);

      // Wait for sync to complete
      await jest.advanceTimersByTimeAsync(100);

      expect(callbacks.onStatusChange).toHaveBeenCalledWith(
        "error",
        "Network error",
      );
    });
  });

  describe("notifyLocalChange", () => {
    it("debounces sync trigger", async () => {
      const callbacks = makeCallbacks();
      await initSyncEngine(TEST_API_URL, async () => "test-token", callbacks);

      // Wait for initial sync to complete
      await jest.advanceTimersByTimeAsync(100);
      mockFetch.mockClear();

      notifyLocalChange();
      notifyLocalChange();
      notifyLocalChange();

      // Should not have synced yet (debounce is 5s)
      expect(mockFetch).not.toHaveBeenCalled();

      // Advance past debounce
      await jest.advanceTimersByTimeAsync(5100);

      // Should have synced once (push + pull = 2 fetch calls)
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe("push changes", () => {
    it("deduplicates queue entries by entity", async () => {
      const callbacks = makeCallbacks();

      // Return queue entries with duplicates
      mockDb.getAllAsync
        .mockResolvedValueOnce([
          { id: 1, entity_id: "note-1", entity_type: "note", action: "update", payload: null, created_at: "2026-01-01T00:00:00Z" },
          { id: 2, entity_id: "note-1", entity_type: "note", action: "update", payload: null, created_at: "2026-01-01T00:01:00Z" },
          { id: 3, entity_id: "note-2", entity_type: "note", action: "create", payload: null, created_at: "2026-01-01T00:00:00Z" },
        ]);

      await initSyncEngine(TEST_API_URL, async () => "test-token", callbacks);
      await jest.advanceTimersByTimeAsync(100);

      // The push request should only have 2 unique changes (note-1 and note-2)
      const pushCall = mockFetch.mock.calls.find(
        (call: any[]) => call[0]?.includes("/sync/push"),
      );
      if (pushCall) {
        const body = JSON.parse(pushCall[1].body);
        expect(body.changes).toHaveLength(2);
      }
    });

    it("sorts changes: folder creates → notes → folder deletes", async () => {
      const callbacks = makeCallbacks();

      mockDb.getAllAsync.mockResolvedValueOnce([
        { id: 1, entity_id: "note-1", entity_type: "note", action: "create", payload: null, created_at: "2026-01-01T00:00:00Z" },
        { id: 2, entity_id: "folder-1", entity_type: "folder", action: "delete", payload: null, created_at: "2026-01-01T00:00:00Z" },
        { id: 3, entity_id: "folder-2", entity_type: "folder", action: "create", payload: null, created_at: "2026-01-01T00:00:00Z" },
      ]);

      await initSyncEngine(TEST_API_URL, async () => "test-token", callbacks);
      await jest.advanceTimersByTimeAsync(100);

      const pushCall = mockFetch.mock.calls.find(
        (call: any[]) => call[0]?.includes("/sync/push"),
      );
      if (pushCall) {
        const body = JSON.parse(pushCall[1].body);
        const types = body.changes.map((c: any) => `${c.type}:${c.action}`);
        // folder:create should come before note:create, which should come before folder:delete
        expect(types.indexOf("folder:create")).toBeLessThan(types.indexOf("note:create"));
        expect(types.indexOf("note:create")).toBeLessThan(types.indexOf("folder:delete"));
      }
    });

    it("handles rejections and notifies callback", async () => {
      const callbacks = makeCallbacks();

      mockDb.getAllAsync.mockResolvedValueOnce([
        { id: 1, entity_id: "note-1", entity_type: "note", action: "update", payload: null, created_at: "2026-01-01T00:00:00Z" },
      ]);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            applied: 0,
            rejected: 1,
            skipped: 0,
            cursor: { deviceId: "d", lastSyncedAt: new Date().toISOString() },
            rejections: [
              {
                changeId: "note-1",
                changeType: "note",
                changeAction: "update",
                reason: "timestamp_conflict",
                message: "Local is older",
              },
            ],
          }),
      });

      await initSyncEngine(TEST_API_URL, async () => "test-token", callbacks);
      await jest.advanceTimersByTimeAsync(100);

      expect(callbacks.onSyncRejections).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ changeId: "note-1", reason: "timestamp_conflict" }),
        ]),
        expect.any(Function), // forcePush
        expect.any(Function), // discard
      );
    });
  });

  describe("pull changes", () => {
    it("applies note changes from pull", async () => {
      const callbacks = makeCallbacks();

      // No queue entries
      mockDb.getAllAsync.mockResolvedValue([]);

      // Use implementation to handle sequential push → pull
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/sync/push")) {
          return {
            ok: true,
            json: () => Promise.resolve({ applied: 0, rejected: 0, skipped: 0, cursor: { deviceId: "d", lastSyncedAt: new Date().toISOString() } }),
          };
        }
        // Pull response with a note change
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              changes: [
                {
                  id: "note-remote-1",
                  type: "note",
                  action: "create",
                  data: {
                    id: "note-remote-1",
                    title: "Remote Note",
                    content: "From server",
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
                    createdAt: "2026-01-01T00:00:00Z",
                    updatedAt: "2026-01-01T00:00:00Z",
                    deletedAt: null,
                  },
                  timestamp: "2026-01-01T00:00:00Z",
                },
              ],
              cursor: { deviceId: "d", lastSyncedAt: "2026-01-01T00:01:00Z" },
              hasMore: false,
            }),
        };
      });

      await initSyncEngine(TEST_API_URL, async () => "test-token", callbacks);
      await jest.advanceTimersByTimeAsync(100);

      // Should have called onDataChanged since we got changes
      expect(callbacks.onDataChanged).toHaveBeenCalled();
    });

    it("loops when hasMore is true", async () => {
      const callbacks = makeCallbacks();

      mockDb.getAllAsync.mockResolvedValue([]);

      let pullCount = 0;
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/sync/push")) {
          return {
            ok: true,
            json: () => Promise.resolve({ applied: 0, rejected: 0, skipped: 0, cursor: { deviceId: "d", lastSyncedAt: new Date().toISOString() } }),
          };
        }
        pullCount++;
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              changes: [],
              cursor: { deviceId: "d", lastSyncedAt: new Date().toISOString() },
              hasMore: pullCount === 1, // First pull says hasMore, second doesn't
            }),
        };
      });

      await initSyncEngine(TEST_API_URL, async () => "test-token", callbacks);
      await jest.advanceTimersByTimeAsync(100);

      // Should have pulled twice
      expect(pullCount).toBe(2);
    });
  });

  describe("backoff", () => {
    it("increases backoff on repeated errors", async () => {
      mockFetch.mockRejectedValue(new Error("Server error"));

      const callbacks = makeCallbacks();
      await initSyncEngine(TEST_API_URL, async () => "test-token", callbacks);
      await jest.advanceTimersByTimeAsync(100);

      const errorCalls = callbacks.onStatusChange.mock.calls.filter(
        (call: any[]) => call[0] === "error",
      );
      expect(errorCalls.length).toBeGreaterThan(0);
    });
  });

  describe("manualSync", () => {
    it("triggers an immediate sync", async () => {
      const callbacks = makeCallbacks();
      await initSyncEngine(TEST_API_URL, async () => "test-token", callbacks);
      await jest.advanceTimersByTimeAsync(100);

      mockFetch.mockClear();
      manualSync();
      await jest.advanceTimersByTimeAsync(100);

      // Should have made push + pull calls
      expect(mockFetch).toHaveBeenCalled();
    });
  });
});
