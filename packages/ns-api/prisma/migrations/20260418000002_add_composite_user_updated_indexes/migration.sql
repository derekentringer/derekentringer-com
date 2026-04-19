-- Phase 4.1 — composite (userId, updatedAt) indexes.
--
-- The /sync/pull hot path filters by userId AND ranges on updatedAt
-- (plus id for keyset tie-break). Postgres picks at most one index per
-- scan, so separate single-column indexes on userId and updatedAt
-- force a filter on one side. A composite covering both sides gives
-- the planner an index-only range scan.
--
-- Added as CREATE INDEX IF NOT EXISTS so a re-run is a no-op. Not using
-- CONCURRENTLY here because Prisma migrations run inside a transaction
-- and CONCURRENTLY can't — Railway's tables are small enough for a brief
-- lock. If the tables grow significantly, revisit with a manual
-- CREATE INDEX CONCURRENTLY + `prisma db pull`.

CREATE INDEX IF NOT EXISTS "notes_userId_updatedAt_idx"
  ON "notes" ("userId", "updatedAt");

CREATE INDEX IF NOT EXISTS "folders_userId_updatedAt_idx"
  ON "folders" ("userId", "updatedAt");

CREATE INDEX IF NOT EXISTS "images_userId_updatedAt_idx"
  ON "images" ("userId", "updatedAt");
