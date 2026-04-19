-- Add isLocalFile flag to folders for Phase 1 of the sync hardening plan
-- (docs/ns/sync-arch/02-phase-1-managed-locally-deletes.md).
--
-- When true, the folder is backed by an on-disk directory managed by a
-- desktop instance. Drives the REST delete path (hard-delete instead of
-- soft-delete) and the web warning when deleting the folder.
--
-- Parallels notes.isLocalFile. Default false preserves today's behavior
-- for every existing row; desktop backfill (Phase 1.3) flips the flag on
-- folders under a managed_directories root.

ALTER TABLE "folders" ADD COLUMN "isLocalFile" BOOLEAN NOT NULL DEFAULT false;
