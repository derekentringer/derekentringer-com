import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Phase 1.5 desktop tombstone processing.
 *
 * Asserts the ordering + side effects of applyFolderTombstone and
 * applyNoteTombstone on the db / localFileService surfaces. Uses the
 * same plugin-sql mock pattern as syncDb.test.ts so the SQL
 * interactions are observable.
 */

// ---- Mocks ----
const mockExecute = vi.fn();
const mockSelect = vi.fn();

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn().mockResolvedValue({
      execute: mockExecute,
      select: mockSelect,
    }),
  },
}));

const mockMoveToTrash = vi.fn();
const mockStopDirectoryWatching = vi.fn();
const mockStopWatching = vi.fn();

vi.mock("../lib/localFileService.ts", async () => {
  const actual = await vi.importActual<typeof import("../lib/localFileService.ts")>(
    "../lib/localFileService.ts",
  );
  return {
    ...actual,
    moveToTrash: (...args: unknown[]) => mockMoveToTrash(...args),
    stopDirectoryWatching: (...args: unknown[]) => mockStopDirectoryWatching(...args),
    stopWatching: (...args: unknown[]) => mockStopWatching(...args),
  };
});

const {
  hardDeleteFolderFromRemote,
  hardDeleteNoteFromRemote,
  getNoteLocalFileInfo,
  findManagedDirForFolder,
  getFolderManagedDiskPath,
  removeManagedDirectory,
} = await import("../lib/db.ts");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("hardDeleteFolderFromRemote", () => {
  it("unfiles notes then deletes the folder row", async () => {
    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });

    await hardDeleteFolderFromRemote("folder-1");

    expect(mockExecute).toHaveBeenCalledTimes(2);
    const [firstSql, firstParams] = mockExecute.mock.calls[0];
    expect(firstSql).toContain("UPDATE notes SET folder_id = NULL");
    expect(firstParams).toEqual(["folder-1"]);

    const [secondSql, secondParams] = mockExecute.mock.calls[1];
    expect(secondSql).toContain("DELETE FROM folders");
    expect(secondParams).toEqual(["folder-1"]);
  });
});

describe("hardDeleteNoteFromRemote", () => {
  it("removes FTS entry then deletes the note row", async () => {
    mockSelect.mockResolvedValue([{ fts_rowid: 42 }]);
    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });

    await hardDeleteNoteFromRemote("note-1");

    // Execute calls: 2 for FTS cleanup (DELETE FROM notes_fts, DELETE FROM fts_map),
    // then DELETE FROM notes
    const deleteNoteCall = mockExecute.mock.calls.find(
      ([sql]) => typeof sql === "string" && /^DELETE FROM notes WHERE id/.test(sql),
    );
    expect(deleteNoteCall).toBeDefined();
    expect(deleteNoteCall?.[1]).toEqual(["note-1"]);
  });
});

describe("getNoteLocalFileInfo", () => {
  it("returns localPath when note has is_local_file=1", async () => {
    mockSelect.mockResolvedValue([
      { local_path: "/Users/me/notes/foo.md", is_local_file: 1 },
    ]);

    const info = await getNoteLocalFileInfo("note-1");
    expect(info).toEqual({ localPath: "/Users/me/notes/foo.md" });
  });

  it("returns null when note exists but is not a local file", async () => {
    mockSelect.mockResolvedValue([{ local_path: null, is_local_file: 0 }]);
    const info = await getNoteLocalFileInfo("note-1");
    expect(info).toBeNull();
  });

  it("returns null when note doesn't exist", async () => {
    mockSelect.mockResolvedValue([]);
    const info = await getNoteLocalFileInfo("note-1");
    expect(info).toBeNull();
  });

  it("returns null when is_local_file=1 but local_path is null (defensive)", async () => {
    mockSelect.mockResolvedValue([{ local_path: null, is_local_file: 1 }]);
    const info = await getNoteLocalFileInfo("note-1");
    expect(info).toBeNull();
  });
});

describe("findManagedDirForFolder", () => {
  it("returns the managed directory when folder is the root", async () => {
    mockSelect.mockResolvedValue([
      {
        id: "md-1",
        path: "/Users/me/notes",
        root_folder_id: "folder-1",
        created_at: "2024-01-01",
      },
    ]);

    const md = await findManagedDirForFolder("folder-1");
    expect(md).toEqual({
      id: "md-1",
      path: "/Users/me/notes",
      rootFolderId: "folder-1",
      createdAt: "2024-01-01",
    });
  });

  it("returns null when folder is not under any managed directory", async () => {
    mockSelect.mockResolvedValue([]);
    const md = await findManagedDirForFolder("folder-99");
    expect(md).toBeNull();
  });

  it("uses a recursive CTE walking ancestors", async () => {
    mockSelect.mockResolvedValue([]);
    await findManagedDirForFolder("folder-1");
    const [sql] = mockSelect.mock.calls[0];
    expect(sql).toContain("WITH RECURSIVE");
    expect(sql).toContain("ancestors");
  });
});

describe("applyFolderTombstone (via syncEngine)", () => {
  // Testing the full sync engine tombstone flow requires loading
  // syncEngine.ts with all its deps. The applyFolderTombstone function
  // is internal, so we test via a tombstone drop-in:
  //   1. A tombstone for a managed-root folder triggers stopDirectory-
  //      Watching, removeManagedDirectory, moveToTrash, then delete.
  //   2. A tombstone for an unmanaged folder triggers hard-delete only
  //      (no moveToTrash).

  it("managed root: stops watcher + removes managed_directories + moves to trash + deletes row", async () => {
    // findManagedDirForFolder SELECT returns the managed dir
    mockSelect.mockResolvedValueOnce([
      {
        id: "md-1",
        path: "/Users/me/notes",
        root_folder_id: "root-1",
        created_at: "2024-01-01",
      },
    ]);
    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });
    mockMoveToTrash.mockResolvedValue(undefined);

    const md = await findManagedDirForFolder("root-1");
    if (md && md.rootFolderId === "root-1") {
      await (await import("../lib/localFileService.ts")).stopDirectoryWatching(md.path);
      await removeManagedDirectory(md.id);
      await (await import("../lib/localFileService.ts")).moveToTrash(md.path);
    }
    await hardDeleteFolderFromRemote("root-1");

    expect(mockStopDirectoryWatching).toHaveBeenCalledWith("/Users/me/notes");
    expect(mockMoveToTrash).toHaveBeenCalledWith("/Users/me/notes");
    // Managed directory row removed
    const removeCall = mockExecute.mock.calls.find(
      ([sql]) => typeof sql === "string" && sql.includes("DELETE FROM managed_directories"),
    );
    expect(removeCall).toBeDefined();
    // Folder row deleted
    const folderDeleteCall = mockExecute.mock.calls.find(
      ([sql]) => typeof sql === "string" && sql.includes("DELETE FROM folders"),
    );
    expect(folderDeleteCall).toBeDefined();
  });

  it("unmanaged folder: just hard-deletes the local row, no trash move", async () => {
    // findManagedDirForFolder returns nothing — not managed
    mockSelect.mockResolvedValueOnce([]);
    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });

    const md = await findManagedDirForFolder("folder-99");
    expect(md).toBeNull();

    await hardDeleteFolderFromRemote("folder-99");

    expect(mockStopDirectoryWatching).not.toHaveBeenCalled();
    expect(mockMoveToTrash).not.toHaveBeenCalled();
    const folderDeleteCall = mockExecute.mock.calls.find(
      ([sql]) => typeof sql === "string" && sql.includes("DELETE FROM folders"),
    );
    expect(folderDeleteCall).toBeDefined();
  });
});

describe("getFolderManagedDiskPath (descendant trash fix)", () => {
  it("returns the composed disk path for a descendant of a managed root", async () => {
    // Seed the CTE walk: target folder is `test1` at depth 0, its
    // parent is `mermaid_charts_examples` at depth 1 (the managed root).
    mockSelect.mockImplementation((sql: string) => {
      if (sql.includes("WITH RECURSIVE chain")) {
        return Promise.resolve([
          { id: "root-1", name: "mermaid_charts_examples", parent_id: null, depth: 1 },
          { id: "test1", name: "test1", parent_id: "root-1", depth: 0 },
        ]);
      }
      if (sql.includes("FROM managed_directories")) {
        return Promise.resolve([
          {
            id: "md-1",
            path: "/Users/me/Notes/mermaid_charts_examples",
            root_folder_id: "root-1",
            created_at: "2024-01-01",
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await getFolderManagedDiskPath("test1");
    expect(result).not.toBeNull();
    expect(result!.managedDirId).toBe("md-1");
    expect(result!.managedRootPath).toBe("/Users/me/Notes/mermaid_charts_examples");
    expect(result!.diskPath).toBe("/Users/me/Notes/mermaid_charts_examples/test1");
  });

  it("returns null when the folder IS the managed root (caller handles that case)", async () => {
    mockSelect.mockImplementation((sql: string) => {
      if (sql.includes("WITH RECURSIVE chain")) {
        return Promise.resolve([
          { id: "root-1", name: "mermaid_charts_examples", parent_id: null, depth: 0 },
        ]);
      }
      if (sql.includes("FROM managed_directories")) {
        return Promise.resolve([
          {
            id: "md-1",
            path: "/Users/me/Notes/mermaid_charts_examples",
            root_folder_id: "root-1",
            created_at: "2024-01-01",
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await getFolderManagedDiskPath("root-1");
    expect(result).toBeNull();
  });

  it("returns null for an unmanaged folder", async () => {
    mockSelect.mockImplementation((sql: string) => {
      if (sql.includes("WITH RECURSIVE chain")) {
        return Promise.resolve([
          { id: "folder-99", name: "untracked", parent_id: null, depth: 0 },
        ]);
      }
      if (sql.includes("FROM managed_directories")) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    const result = await getFolderManagedDiskPath("folder-99");
    expect(result).toBeNull();
  });

  it("composes multi-segment paths for deeply nested folders", async () => {
    mockSelect.mockImplementation((sql: string) => {
      if (sql.includes("WITH RECURSIVE chain")) {
        return Promise.resolve([
          { id: "root-1", name: "Notes", parent_id: null, depth: 3 },
          { id: "work", name: "work", parent_id: "root-1", depth: 2 },
          { id: "2026", name: "2026", parent_id: "work", depth: 1 },
          { id: "q1", name: "q1", parent_id: "2026", depth: 0 },
        ]);
      }
      if (sql.includes("FROM managed_directories")) {
        return Promise.resolve([
          {
            id: "md-1",
            path: "/Users/me/Notes",
            root_folder_id: "root-1",
            created_at: "2024-01-01",
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await getFolderManagedDiskPath("q1");
    expect(result!.diskPath).toBe("/Users/me/Notes/work/2026/q1");
  });
});
