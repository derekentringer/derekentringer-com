-- Phase 1 (sync-arch hardening): add isLocalFile to folders.
--
-- Mirrors notes.is_local_file. When 1, this folder is backed by an
-- on-disk directory under a managed_directories root. Drives the
-- sync payload's isLocalFile flag and is the authority other clients
-- (web) read to decide hard-delete-vs-soft-delete on user delete.
--
-- Default 0 preserves today's behavior for every existing row; the
-- Phase 1.3 backfill flips it to 1 on folders under a managed root.

ALTER TABLE folders ADD COLUMN is_local_file INTEGER NOT NULL DEFAULT 0;
