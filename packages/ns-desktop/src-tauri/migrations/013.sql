-- Drop the foreign key constraint on folders.parent_id.
--
-- The FK was `parent_id TEXT REFERENCES folders(id) ON DELETE SET NULL`.
-- Its only runtime behavior was cascade-on-hard-delete, but folders in this
-- app are only ever soft-deleted (deleted_at), so the FK never fires in normal
-- operation. Meanwhile, it breaks sync pulls: if the server returns a child
-- folder before its parent in a batch, the INSERT fails with FOREIGN KEY
-- constraint failed, the error is silently swallowed by the sync engine, and
-- the folder is permanently lost until the client does a full re-pull.
--
-- `notes.folder_id` already has no FK for the same reason — the local SQLite
-- is a cache of an eventually-consistent remote store, and FK ordering
-- constraints conflict with sync semantics. This migration aligns
-- folders.parent_id with that design.
--
-- SQLite doesn't support ALTER TABLE DROP CONSTRAINT, so we rebuild the table.

CREATE TABLE folders_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  parent_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  favorite INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT DEFAULT NULL
);

INSERT INTO folders_new (id, name, parent_id, sort_order, favorite, created_at, updated_at, deleted_at)
SELECT id, name, parent_id, sort_order, favorite, created_at, updated_at, deleted_at
FROM folders;

DROP TABLE folders;

ALTER TABLE folders_new RENAME TO folders;
