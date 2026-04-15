-- Drop the foreign key constraint on images.note_id.
--
-- The FK was `FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE`
-- (see migration 011). It breaks sync pulls in the same way migration 013
-- fixed `folders.parent_id`: if an image arrives in a sync batch before the
-- note it references (because the note is in a later pagination page), the
-- INSERT fails with FOREIGN KEY constraint failed, the error is swallowed by
-- the sync engine's try/catch, and the image is permanently lost.
--
-- Concrete example encountered in practice: 8 images referencing a note whose
-- `updatedAt` placed it beyond the first pull batch's BATCH_LIMIT boundary.
-- All 8 images failed to insert even though they were fetched from the server
-- in the same batch, because the note was scheduled for a later pull.
--
-- General principle: the local SQLite cache should NOT enforce referential
-- integrity on columns that come from sync payloads. The authoritative source
-- is the remote server, which is eventually consistent. FK constraints add
-- arrival-order requirements that conflict with sync semantics. Derived-data
-- tables (note_links, note_versions, note_embeddings) are fine to keep FKs
-- because they are populated locally *after* their parent notes are synced.
--
-- The ON DELETE CASCADE behavior this FK provided never fired in normal use
-- because notes are only soft-deleted (deleted_at), not hard-deleted.
--
-- SQLite doesn't support ALTER TABLE DROP CONSTRAINT, so we rebuild the table.

CREATE TABLE images_new (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT NOT NULL,
  r2_url TEXT NOT NULL,
  alt_text TEXT NOT NULL DEFAULT '',
  ai_description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  sync_status TEXT NOT NULL DEFAULT 'synced',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

INSERT INTO images_new (id, note_id, filename, mime_type, size_bytes, r2_key, r2_url, alt_text, ai_description, sort_order, sync_status, created_at, updated_at, deleted_at)
SELECT id, note_id, filename, mime_type, size_bytes, r2_key, r2_url, alt_text, ai_description, sort_order, sync_status, created_at, updated_at, deleted_at
FROM images;

DROP TABLE images;

ALTER TABLE images_new RENAME TO images;
