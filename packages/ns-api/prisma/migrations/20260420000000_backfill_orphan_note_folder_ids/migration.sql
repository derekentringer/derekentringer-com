-- Null out folderId on notes pointing to folders that are gone or soft-deleted.
-- Such notes are "orphaned": the folder they reference isn't in the visible
-- tree, so they can never be navigated to AND don't count as Unfiled in the
-- client's count formula (totalNotes - sum(folderCounts)). The Unfiled view
-- then silently hid them, making dragged-to-unfiled notes appear to vanish.
--
-- Two classes of orphans are collapsed to Unfiled here:
--   1. folderId points to a folder row that has been soft-deleted
--      (folders.deletedAt IS NOT NULL).
--   2. folderId points to a folder id that no longer exists at all. With
--      the current FK-less schema a hard-delete should null its notes out,
--      but this covers any residual drift.
--
-- Also nulls the legacy `folder` (name-based) column in the same pass so
-- the two columns stay in agreement after the move. The filter on
-- `notes.deletedAt IS NULL` avoids touching trashed notes — those will be
-- purged on their own schedule and re-filing them would waste cycles.
--
-- Idempotent: once drift is cleared, the WHERE clause selects zero rows.

UPDATE notes
SET "folderId" = NULL,
    "folder" = NULL
WHERE "deletedAt" IS NULL
  AND "folderId" IS NOT NULL
  AND "folderId" NOT IN (
    SELECT id FROM folders WHERE "deletedAt" IS NULL
  );
