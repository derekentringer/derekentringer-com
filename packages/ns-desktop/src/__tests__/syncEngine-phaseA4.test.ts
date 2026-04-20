import { vi, describe, it, expect, beforeEach } from "vitest";

/**
 * Phase A.4 — the pull-side disk reconciler fires when a folder's
 * isLocalFile flips between remote pulls. These tests hijack all the
 * db + filesystem modules with thin mocks so we can drive applyFolderChange
 * through a `pull` call and assert the reconciler's side effects.
 */

// ---------- Mocks ----------

vi.mock("uuid", () => ({ v4: vi.fn().mockReturnValue("device-id") }));

const mockApiFetch = vi.fn();
vi.mock("../api/client.ts", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  getAccessToken: () => "mock-token",
  refreshAccessToken: () => Promise.resolve("mock-token"),
  tokenManager: { getMsUntilExpiry: () => 10 * 60 * 1000 },
}));

const mockGetLocalFolderIsLocalFile = vi.fn();
const mockGetFolderNotesForReconcile = vi.fn();
const mockLinkNoteToLocalFile = vi.fn();
const mockUnlinkLocalFile = vi.fn();
const mockFindManagedDirForFolder = vi.fn();
const mockGetFolderManagedDiskPath = vi.fn();
const mockUpsertFolderFromRemote = vi.fn();

vi.mock("../lib/db.ts", () => ({
  readSyncQueue: vi.fn().mockResolvedValue([]),
  removeSyncQueueEntries: vi.fn().mockResolvedValue(undefined),
  getSyncMeta: vi.fn().mockResolvedValue(null),
  setSyncMeta: vi.fn().mockResolvedValue(undefined),
  fetchNoteById: vi.fn().mockResolvedValue(null),
  fetchNoteEmbeddingInputById: vi.fn().mockResolvedValue(null),
  upsertNoteFromRemote: vi.fn().mockResolvedValue(undefined),
  upsertFolderFromRemote: (...args: unknown[]) => mockUpsertFolderFromRemote(...args),
  upsertImageFromRemote: vi.fn().mockResolvedValue(undefined),
  softDeleteNoteFromRemote: vi.fn().mockResolvedValue(undefined),
  softDeleteFolderFromRemote: vi.fn().mockResolvedValue(undefined),
  softDeleteImageFromRemote: vi.fn().mockResolvedValue(undefined),
  hardDeleteNoteFromRemote: vi.fn().mockResolvedValue(undefined),
  hardDeleteFolderFromRemote: vi.fn().mockResolvedValue(undefined),
  getNoteLocalPath: vi.fn().mockResolvedValue(null),
  getNoteLocalFileHash: vi.fn().mockResolvedValue(null),
  getNoteLocalFileInfo: vi.fn().mockResolvedValue(null),
  findManagedDirForFolder: (...args: unknown[]) => mockFindManagedDirForFolder(...args),
  getFolderManagedDiskPath: (...args: unknown[]) => mockGetFolderManagedDiskPath(...args),
  getFolderNotesForReconcile: (...args: unknown[]) => mockGetFolderNotesForReconcile(...args),
  getLocalFolderIsLocalFile: (...args: unknown[]) => mockGetLocalFolderIsLocalFile(...args),
  linkNoteToLocalFile: (...args: unknown[]) => mockLinkNoteToLocalFile(...args),
  unlinkLocalFile: (...args: unknown[]) => mockUnlinkLocalFile(...args),
  removeManagedDirectory: vi.fn().mockResolvedValue(undefined),
}));

const mockWriteLocalFile = vi.fn();
const mockMoveToTrash = vi.fn();
const mockEnsureDirectory = vi.fn();
const mockFileExists = vi.fn();
const mockStopWatching = vi.fn();
const mockFilenameForNoteTitle = vi.fn((title: string) => `${title}.md`);

vi.mock("../lib/localFileService.ts", () => ({
  computeContentHash: vi.fn().mockResolvedValue("deadbeef"),
  ensureDirectory: (...args: unknown[]) => mockEnsureDirectory(...args),
  fileExists: (...args: unknown[]) => mockFileExists(...args),
  filenameForNoteTitle: (...args: unknown[]) => mockFilenameForNoteTitle(...(args as [string])),
  moveToTrash: (...args: unknown[]) => mockMoveToTrash(...args),
  stopDirectoryWatching: vi.fn().mockResolvedValue(undefined),
  stopWatching: (...args: unknown[]) => mockStopWatching(...args),
  writeLocalFile: (...args: unknown[]) => mockWriteLocalFile(...args),
}));

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: { load: vi.fn().mockResolvedValue({ execute: vi.fn(), select: vi.fn() }) },
}));

// ---------- Import SUT after mocks ----------

const { initSyncEngine, destroySyncEngine } = await import("../lib/syncEngine.ts");

// ---------- Helpers ----------

function makeFolderChange(overrides: Partial<{ id: string; isLocalFile: boolean; parentId: string | null }> = {}) {
  return {
    id: overrides.id ?? "folder-1",
    type: "folder" as const,
    action: "update" as const,
    timestamp: "2026-04-18T00:00:00.000Z",
    data: {
      id: overrides.id ?? "folder-1",
      name: "Folder",
      parentId: overrides.parentId ?? null,
      sortOrder: 0,
      favorite: false,
      isLocalFile: overrides.isLocalFile ?? false,
      createdAt: "2026-04-18T00:00:00.000Z",
      updatedAt: "2026-04-18T00:00:00.000Z",
      deletedAt: null,
    },
  };
}

function pullResponse(changes: unknown[]) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        changes,
        hasMore: false,
        cursor: { deviceId: "device-id", lastSyncedAt: "2026-04-18T00:00:00.000Z" },
      }),
  };
}

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  destroySyncEngine();
  Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
  // SSE fetch hangs so it doesn't interfere.
  globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {})) as unknown as typeof fetch;
  // Default — no previous local flag → no flip.
  mockGetLocalFolderIsLocalFile.mockResolvedValue(null);
  mockUpsertFolderFromRemote.mockResolvedValue(undefined);
  mockGetFolderNotesForReconcile.mockResolvedValue([]);
  mockFileExists.mockResolvedValue(true);
  mockWriteLocalFile.mockResolvedValue("deadbeef");
  mockEnsureDirectory.mockResolvedValue(undefined);
});

async function runPull(changes: unknown[]) {
  mockApiFetch.mockResolvedValue(pullResponse(changes));
  await initSyncEngine({
    onStatusChange: vi.fn(),
    onDataChanged: vi.fn(),
  });
  await flushPromises();
}

afterEach(() => {
  destroySyncEngine();
  globalThis.fetch = originalFetch;
});

// afterEach is Vitest-global per the package's vitest.config.ts — import it lazily.
function afterEach(fn: () => void) {
  // Vitest's globals include `afterEach`. This shim silences TS in the
  // isolated imports above without pulling in explicit vitest types.
  (globalThis as unknown as { afterEach: (fn: () => void) => void }).afterEach(fn);
}

// ---------- Tests ----------

describe("Phase A.4 — folder isLocalFile flip triggers pull-side disk reconciler", () => {
  describe("unmanaged → managed (flip to true)", () => {
    it("materializes direct notes to disk under the managed root", async () => {
      mockGetLocalFolderIsLocalFile.mockResolvedValueOnce(false);
      mockFindManagedDirForFolder.mockResolvedValueOnce({
        id: "md-1",
        path: "/Users/me/Notes",
        rootFolderId: "root-1",
        createdAt: "2026-01-01",
      });
      mockGetFolderManagedDiskPath.mockResolvedValueOnce({
        managedDirId: "md-1",
        managedRootPath: "/Users/me/Notes",
        diskPath: "/Users/me/Notes/sub",
      });
      mockGetFolderNotesForReconcile.mockResolvedValueOnce([
        { id: "note-1", title: "Hello", content: "body one", localPath: null },
        { id: "note-2", title: "World", content: "body two", localPath: null },
      ]);

      await runPull([makeFolderChange({ id: "folder-sub", isLocalFile: true })]);

      // mkdir for the target folder
      expect(mockEnsureDirectory).toHaveBeenCalledWith("/Users/me/Notes/sub");
      // one write per note
      expect(mockWriteLocalFile).toHaveBeenCalledTimes(2);
      expect(mockWriteLocalFile).toHaveBeenCalledWith(
        "/Users/me/Notes/sub/Hello.md",
        "body one",
      );
      expect(mockWriteLocalFile).toHaveBeenCalledWith(
        "/Users/me/Notes/sub/World.md",
        "body two",
      );
      // link note → local path + hash
      expect(mockLinkNoteToLocalFile).toHaveBeenCalledWith(
        "note-1",
        "/Users/me/Notes/sub/Hello.md",
        "deadbeef",
      );
    });

    it("skips reconciliation when ancestor isn't managed locally (desktop doesn't know the disk path)", async () => {
      mockGetLocalFolderIsLocalFile.mockResolvedValueOnce(false);
      mockFindManagedDirForFolder.mockResolvedValueOnce(null);

      await runPull([makeFolderChange({ id: "orphan", isLocalFile: true })]);

      expect(mockEnsureDirectory).not.toHaveBeenCalled();
      expect(mockWriteLocalFile).not.toHaveBeenCalled();
      expect(mockLinkNoteToLocalFile).not.toHaveBeenCalled();
    });

    it("uses the managed root's path directly when the flipping folder IS the managed root", async () => {
      mockGetLocalFolderIsLocalFile.mockResolvedValueOnce(false);
      mockFindManagedDirForFolder.mockResolvedValueOnce({
        id: "md-1",
        path: "/Users/me/Notes",
        rootFolderId: "root-1",
        createdAt: "2026-01-01",
      });
      mockGetFolderNotesForReconcile.mockResolvedValueOnce([
        { id: "n1", title: "A", content: "x", localPath: null },
      ]);

      await runPull([makeFolderChange({ id: "root-1", isLocalFile: true })]);

      // getFolderManagedDiskPath not needed when folder IS the managed root.
      expect(mockGetFolderManagedDiskPath).not.toHaveBeenCalled();
      expect(mockEnsureDirectory).toHaveBeenCalledWith("/Users/me/Notes");
      expect(mockWriteLocalFile).toHaveBeenCalledWith("/Users/me/Notes/A.md", "x");
    });

    it("doesn't re-materialize notes that already have a local_path", async () => {
      mockGetLocalFolderIsLocalFile.mockResolvedValueOnce(false);
      mockFindManagedDirForFolder.mockResolvedValueOnce({
        id: "md-1",
        path: "/Users/me/Notes",
        rootFolderId: "root-1",
        createdAt: "2026-01-01",
      });
      mockGetFolderManagedDiskPath.mockResolvedValueOnce({
        managedDirId: "md-1",
        managedRootPath: "/Users/me/Notes",
        diskPath: "/Users/me/Notes/sub",
      });
      mockGetFolderNotesForReconcile.mockResolvedValueOnce([
        {
          id: "already-on-disk",
          title: "Existing",
          content: "keep me",
          localPath: "/Users/me/Notes/sub/Existing.md",
        },
      ]);

      await runPull([makeFolderChange({ id: "folder-sub", isLocalFile: true })]);

      expect(mockWriteLocalFile).not.toHaveBeenCalled();
      expect(mockLinkNoteToLocalFile).not.toHaveBeenCalled();
    });
  });

  describe("managed → unmanaged (flip to false)", () => {
    it("trashes on-disk files for direct notes and clears local_path", async () => {
      mockGetLocalFolderIsLocalFile.mockResolvedValueOnce(true);
      mockGetFolderNotesForReconcile.mockResolvedValueOnce([
        {
          id: "note-1",
          title: "Hello",
          content: "body",
          localPath: "/Users/me/Notes/sub/Hello.md",
        },
        {
          id: "note-2",
          title: "World",
          content: "body two",
          localPath: "/Users/me/Notes/sub/World.md",
        },
      ]);

      await runPull([makeFolderChange({ id: "folder-sub", isLocalFile: false })]);

      expect(mockStopWatching).toHaveBeenCalledWith("note-1");
      expect(mockStopWatching).toHaveBeenCalledWith("note-2");
      expect(mockMoveToTrash).toHaveBeenCalledWith("/Users/me/Notes/sub/Hello.md");
      expect(mockMoveToTrash).toHaveBeenCalledWith("/Users/me/Notes/sub/World.md");
      expect(mockUnlinkLocalFile).toHaveBeenCalledWith("note-1");
      expect(mockUnlinkLocalFile).toHaveBeenCalledWith("note-2");
    });

    it("unlinks even when the disk file is already gone (moveToTrash skipped)", async () => {
      mockGetLocalFolderIsLocalFile.mockResolvedValueOnce(true);
      mockFileExists.mockResolvedValue(false);
      mockGetFolderNotesForReconcile.mockResolvedValueOnce([
        {
          id: "orphan",
          title: "Missing",
          content: "",
          localPath: "/Users/me/Notes/gone.md",
        },
      ]);

      await runPull([makeFolderChange({ id: "folder", isLocalFile: false })]);

      expect(mockMoveToTrash).not.toHaveBeenCalled();
      expect(mockUnlinkLocalFile).toHaveBeenCalledWith("orphan");
    });

    it("skips notes that don't have a local_path (cloud-only notes)", async () => {
      mockGetLocalFolderIsLocalFile.mockResolvedValueOnce(true);
      mockGetFolderNotesForReconcile.mockResolvedValueOnce([
        { id: "cloud-only", title: "X", content: "", localPath: null },
      ]);

      await runPull([makeFolderChange({ id: "folder", isLocalFile: false })]);

      expect(mockMoveToTrash).not.toHaveBeenCalled();
      expect(mockUnlinkLocalFile).not.toHaveBeenCalled();
    });
  });

  describe("no flip", () => {
    it("does nothing when the folder is new locally (no previous flag)", async () => {
      mockGetLocalFolderIsLocalFile.mockResolvedValueOnce(null);
      await runPull([makeFolderChange({ id: "new-folder", isLocalFile: true })]);

      expect(mockFindManagedDirForFolder).not.toHaveBeenCalled();
      expect(mockWriteLocalFile).not.toHaveBeenCalled();
      expect(mockMoveToTrash).not.toHaveBeenCalled();
    });

    it("does nothing when the flag is unchanged", async () => {
      mockGetLocalFolderIsLocalFile.mockResolvedValueOnce(true);
      await runPull([makeFolderChange({ id: "folder", isLocalFile: true })]);

      expect(mockFindManagedDirForFolder).not.toHaveBeenCalled();
      expect(mockWriteLocalFile).not.toHaveBeenCalled();
      expect(mockMoveToTrash).not.toHaveBeenCalled();
    });
  });
});
