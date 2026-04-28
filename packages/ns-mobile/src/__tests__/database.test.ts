const mockExecAsync = jest.fn().mockResolvedValue(undefined);
const mockGetFirstAsync = jest.fn().mockResolvedValue(null);
const mockRunAsync = jest.fn().mockResolvedValue({ changes: 0, lastInsertRowId: 0 });
const mockOpenDatabaseAsync = jest.fn().mockResolvedValue({
  execAsync: mockExecAsync,
  getFirstAsync: mockGetFirstAsync,
  getAllAsync: jest.fn().mockResolvedValue([]),
  runAsync: mockRunAsync,
});

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: mockOpenDatabaseAsync,
}));

describe("database", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset module cache so the cached db instance is cleared
    jest.resetModules();
  });

  it("opens the notesync database", async () => {
    // Re-require after resetModules to get fresh module with db = null
    // Re-mock expo-sqlite since resetModules clears mocks
    jest.doMock("expo-sqlite", () => ({
      openDatabaseAsync: mockOpenDatabaseAsync,
    }));
    const { initDatabase, getDatabaseName } = require("../lib/database");
    await initDatabase();

    // Jest sets __DEV__ = true (see jest.config.js globals), so we get
    // the dev DB name. Both names are valid in production code paths.
    expect(mockOpenDatabaseAsync).toHaveBeenCalledWith(getDatabaseName());
  });

  it("creates all required tables", async () => {
    jest.doMock("expo-sqlite", () => ({
      openDatabaseAsync: mockOpenDatabaseAsync,
    }));
    const { initDatabase } = require("../lib/database");
    await initDatabase();

    // First call is base tables, second is FTS5 migration
    expect(mockExecAsync).toHaveBeenCalled();
    const sql = mockExecAsync.mock.calls[0][0] as string;

    // Verify all tables are created
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS notes");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS folders");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS note_versions");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS sync_queue");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS sync_meta");
  });

  it("notes table has expected columns", async () => {
    jest.doMock("expo-sqlite", () => ({
      openDatabaseAsync: mockOpenDatabaseAsync,
    }));
    const { initDatabase } = require("../lib/database");
    await initDatabase();

    const sql = mockExecAsync.mock.calls[0][0] as string;

    expect(sql).toContain("id TEXT PRIMARY KEY");
    expect(sql).toContain("title TEXT NOT NULL DEFAULT ''");
    expect(sql).toContain("content TEXT NOT NULL DEFAULT ''");
    expect(sql).toContain("folder_id TEXT");
    expect(sql).toContain("tags TEXT NOT NULL DEFAULT '[]'");
    expect(sql).toContain("favorite INTEGER NOT NULL DEFAULT 0");
    expect(sql).toContain("sync_status TEXT NOT NULL DEFAULT 'synced'");
    expect(sql).toContain("created_at TEXT NOT NULL");
    expect(sql).toContain("updated_at TEXT NOT NULL");
    expect(sql).toContain("deleted_at TEXT");
  });

  it("folders table has expected columns", async () => {
    jest.doMock("expo-sqlite", () => ({
      openDatabaseAsync: mockOpenDatabaseAsync,
    }));
    const { initDatabase } = require("../lib/database");
    await initDatabase();

    const sql = mockExecAsync.mock.calls[0][0] as string;

    expect(sql).toContain("name TEXT NOT NULL");
    expect(sql).toContain("parent_id TEXT");
    expect(sql).toContain("sort_order INTEGER NOT NULL DEFAULT 0");
  });

  it("sync_queue table has auto-increment id", async () => {
    jest.doMock("expo-sqlite", () => ({
      openDatabaseAsync: mockOpenDatabaseAsync,
    }));
    const { initDatabase } = require("../lib/database");
    await initDatabase();

    const sql = mockExecAsync.mock.calls[0][0] as string;

    expect(sql).toContain("id INTEGER PRIMARY KEY AUTOINCREMENT");
    expect(sql).toContain("entity_type TEXT NOT NULL");
    expect(sql).toContain("action TEXT NOT NULL");
  });

  describe("schema versioning", () => {
    it("runs FTS5 migration when schema_version is missing", async () => {
      // No schema_version in sync_meta
      mockGetFirstAsync.mockResolvedValue(null);

      jest.doMock("expo-sqlite", () => ({
        openDatabaseAsync: mockOpenDatabaseAsync,
      }));
      const { initDatabase } = require("../lib/database");
      await initDatabase();

      // Should have created FTS5 tables
      const allExecCalls = mockExecAsync.mock.calls.map((c: any[]) => c[0]) as string[];
      const ftsSql = allExecCalls.find((sql: string) => sql.includes("notes_fts"));
      expect(ftsSql).toBeDefined();
      expect(ftsSql).toContain("CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5");
      expect(ftsSql).toContain("CREATE TABLE IF NOT EXISTS fts_map");
    });

    it("sets schema_version to 2 after migration", async () => {
      mockGetFirstAsync.mockResolvedValue(null);

      jest.doMock("expo-sqlite", () => ({
        openDatabaseAsync: mockOpenDatabaseAsync,
      }));
      const { initDatabase } = require("../lib/database");
      await initDatabase();

      expect(mockRunAsync).toHaveBeenCalledWith(
        "INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('schema_version', ?)",
        ["2"],
      );
    });

    it("runs v3 migration when schema_version is 2", async () => {
      mockGetFirstAsync.mockResolvedValue({ value: "2" });

      jest.doMock("expo-sqlite", () => ({
        openDatabaseAsync: mockOpenDatabaseAsync,
      }));
      const { initDatabase } = require("../lib/database");
      await initDatabase();

      // Base tables + v3 ALTER TABLE for folders.is_local_file
      expect(mockExecAsync).toHaveBeenCalledTimes(2);
      expect(mockRunAsync).toHaveBeenCalledWith(
        "INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('schema_version', ?)",
        ["3"],
      );
    });

    it("skips migration when schema_version is already 3", async () => {
      mockGetFirstAsync.mockResolvedValue({ value: "3" });

      jest.doMock("expo-sqlite", () => ({
        openDatabaseAsync: mockOpenDatabaseAsync,
      }));
      const { initDatabase } = require("../lib/database");
      await initDatabase();

      // Only base tables; no migrations run when already at current version
      expect(mockExecAsync).toHaveBeenCalledTimes(1);
    });
  });
});
