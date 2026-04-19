-- Phase 3.2 (sync-arch hardening): pending_refs table.
--
-- Migrations 013 and 014 dropped FK constraints on sync-populated
-- columns (folders.parent_id, images.note_id, notes.folder_id) because
-- a child row can legitimately arrive in a sync batch before its
-- parent — FK enforcement caused silent INSERT failures that the sync
-- engine's try/catch swallowed, leading to permanent data loss.
--
-- The tradeoff: orphan references are now accepted silently. A note
-- arriving before its folder, or an image arriving before its note,
-- lands with a dangling pointer. If the parent is later delivered the
-- link resolves implicitly, but the child is never re-visited, which
-- means it silently carries the orphan link for as long as the parent
-- is missing — and forever if the parent was deleted between server
-- write and client pull.
--
-- pending_refs is the app-level deferral buffer. When an upsert would
-- create an orphan, the payload is parked here with a pointer to what
-- it's waiting for. After each successful parent upsert, matching rows
-- are drained and replayed. Payload is the full SyncChange JSON so
-- replay reuses the same apply path.

CREATE TABLE IF NOT EXISTS pending_refs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,     -- "note" | "image"
  entity_id TEXT NOT NULL,
  ref_type TEXT NOT NULL,        -- "folder" | "note"
  ref_id TEXT NOT NULL,
  payload TEXT NOT NULL,         -- full sync payload JSON
  enqueued_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pending_refs_ref
  ON pending_refs(ref_type, ref_id);

CREATE INDEX IF NOT EXISTS idx_pending_refs_entity
  ON pending_refs(entity_type, entity_id);
