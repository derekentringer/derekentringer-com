import * as SQLite from "expo-sqlite";

let db: SQLite.SQLiteDatabase | null = null;

// Use a separate SQLite file for dev (localhost ns-api) so the
// prod-synced cache doesn't leak into local sessions and vice
// versa — slash commands like /folders read straight from this
// DB, so cross-environment data leaks otherwise. Mirrors the
// desktop pattern in `src/lib/dbName.ts`.
export function getDatabaseName(): string {
  return __DEV__ ? "notesync_localhost.db" : "notesync.db";
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync(getDatabaseName());
  return db;
}

const CURRENT_SCHEMA_VERSION = 2;

export async function initDatabase(): Promise<void> {
  const database = await getDatabase();

  // v1: base tables
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      folder TEXT,
      folder_id TEXT,
      folder_path TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      summary TEXT,
      favorite INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      favorite_sort_order INTEGER NOT NULL DEFAULT 0,
      audio_mode TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'synced',
      remote_id TEXT
    );

    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      favorite INTEGER NOT NULL DEFAULT 0,
      is_local_file INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS note_versions (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      origin TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      action TEXT NOT NULL,
      payload TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Run migrations
  const version = await getSchemaVersion(database);
  if (version < 2) {
    await migrateToV2(database);
  }
  if (version < 3) {
    await migrateToV3(database);
  }
}

async function getSchemaVersion(database: SQLite.SQLiteDatabase): Promise<number> {
  const row = await database.getFirstAsync<{ value: string | null }>(
    "SELECT value FROM sync_meta WHERE key = 'schema_version'",
  );
  return row?.value ? parseInt(row.value, 10) : 1;
}

async function setSchemaVersion(database: SQLite.SQLiteDatabase, version: number): Promise<void> {
  await database.runAsync(
    "INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('schema_version', ?)",
    [String(version)],
  );
}

async function migrateToV2(database: SQLite.SQLiteDatabase): Promise<void> {
  // FTS5 virtual table for full-text search
  await database.execAsync(`
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      title,
      content,
      tags,
      content=''
    );

    CREATE TABLE IF NOT EXISTS fts_map (
      note_id TEXT PRIMARY KEY,
      fts_rowid INTEGER NOT NULL
    );
  `);

  await setSchemaVersion(database, 2);
}

async function migrateToV3(database: SQLite.SQLiteDatabase): Promise<void> {
  // Phase 1 (sync-arch hardening): add is_local_file to folders so the
  // server's isLocalFile flag round-trips through mobile's local cache.
  // Mobile never stamps the flag locally (managed-locally is a
  // desktop-only concept), but it must not strip it from pulled data.
  //
  // The base CREATE TABLE already includes is_local_file, so a
  // freshly-created DB will throw "duplicate column name" when this
  // ALTER runs — swallow that case so init completes. Only legacy
  // DBs created before the column was added to the base CREATE
  // actually need the ALTER.
  try {
    await database.execAsync(`
      ALTER TABLE folders ADD COLUMN is_local_file INTEGER NOT NULL DEFAULT 0;
    `);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/duplicate column name/i.test(message)) {
      throw err;
    }
  }

  await setSchemaVersion(database, 3);
}

export async function resetDatabase(): Promise<void> {
  const database = await getDatabase();
  await database.execAsync(`
    DELETE FROM notes;
    DELETE FROM folders;
    DELETE FROM note_versions;
    DELETE FROM sync_queue;
    DELETE FROM sync_meta;
  `);
  // Drop FTS tables if they exist
  try {
    await database.execAsync(`
      DROP TABLE IF EXISTS fts_map;
      DROP TABLE IF EXISTS notes_fts;
    `);
  } catch {
    // FTS tables may not exist yet
  }
}
