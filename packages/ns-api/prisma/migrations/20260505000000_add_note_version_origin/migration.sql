-- Adds the `origin` column to `note_versions` so the version-history list can
-- show a per-row provenance badge ("web", "mobile", "desktop"). Existing rows
-- get the default "web" since they were all captured via the REST PATCH path.
ALTER TABLE "note_versions" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'web';
