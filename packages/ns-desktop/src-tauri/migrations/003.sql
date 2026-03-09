-- Folders table (adjacency list model)
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  parent_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  favorite INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Standalone FTS5 table (not content-synced because notes uses TEXT PRIMARY KEY, not rowid)
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  title, content, tags
);

-- Mapping table to link note UUIDs to FTS5 rowids
CREATE TABLE IF NOT EXISTS fts_map (
  note_id TEXT PRIMARY KEY,
  fts_rowid INTEGER NOT NULL
);
