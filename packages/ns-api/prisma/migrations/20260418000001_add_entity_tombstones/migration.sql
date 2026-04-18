-- Phase 1.5 (sync-arch hardening): tombstone table for hard-deleted
-- entities so clients learn about deletions on their next /sync/pull.
--
-- Scope: folders (all deletes — no folder-restore UI exists) and notes
-- with isLocalFile=true (the sync-push path hard-deletes these). Regular
-- notes stay soft-deleted so the web trash/restore UX keeps working.
--
-- Sweep (Phase 4): after every active sync_cursor for a user has
-- advanced past `deletedAt`, the tombstone is safe to purge.

CREATE TABLE "entity_tombstones" (
  "id"         TEXT PRIMARY KEY,
  "userId"     TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId"   TEXT NOT NULL,
  "deletedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "entity_tombstones_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- One tombstone per entity per user. Re-emitted deletes upsert the
-- existing row's timestamp rather than piling up duplicates.
CREATE UNIQUE INDEX "entity_tombstones_userId_entityId_key"
  ON "entity_tombstones"("userId", "entityId");

-- Sync pull range query: rows since last cursor, per user.
CREATE INDEX "entity_tombstones_userId_deletedAt_idx"
  ON "entity_tombstones"("userId", "deletedAt");

-- Sweep query: rows older than all active cursors.
CREATE INDEX "entity_tombstones_deletedAt_idx"
  ON "entity_tombstones"("deletedAt");
