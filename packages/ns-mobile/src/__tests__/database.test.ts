const mockExecAsync = jest.fn().mockResolvedValue(undefined);
const mockOpenDatabaseAsync = jest.fn().mockResolvedValue({
  execAsync: mockExecAsync,
  getFirstAsync: jest.fn().mockResolvedValue(null),
  getAllAsync: jest.fn().mockResolvedValue([]),
  runAsync: jest.fn().mockResolvedValue({ changes: 0, lastInsertRowId: 0 }),
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
    const { initDatabase } = require("../lib/database");
    await initDatabase();

    expect(mockOpenDatabaseAsync).toHaveBeenCalledWith("notesync.db");
  });

  it("creates all required tables", async () => {
    jest.doMock("expo-sqlite", () => ({
      openDatabaseAsync: mockOpenDatabaseAsync,
    }));
    const { initDatabase } = require("../lib/database");
    await initDatabase();

    expect(mockExecAsync).toHaveBeenCalledTimes(1);
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
});
