-- Add parentId and sortOrder to folders
ALTER TABLE "folders" ADD COLUMN "parentId" TEXT;
ALTER TABLE "folders" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "folders" ADD CONSTRAINT "folders_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "folders"("id") ON DELETE SET NULL;
CREATE INDEX "folders_parentId_idx" ON "folders"("parentId");

-- Replace global unique name with sibling-unique name
DROP INDEX "folders_name_key";
CREATE UNIQUE INDEX "folders_parentId_name_key" ON "folders"("parentId", "name");
CREATE UNIQUE INDEX "folders_root_name_key" ON "folders"("name") WHERE "parentId" IS NULL;

-- Add folderId to notes (UUID reference replacing name string)
ALTER TABLE "notes" ADD COLUMN "folderId" TEXT;
CREATE INDEX "notes_folderId_idx" ON "notes"("folderId");
ALTER TABLE "notes" ADD CONSTRAINT "notes_folderId_fkey"
  FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE SET NULL;

-- Backfill folderId from existing folder names
UPDATE "notes" n SET "folderId" = f."id"
FROM "folders" f WHERE n."folder" = f."name" AND n."folder" IS NOT NULL;

-- Assign sortOrder to existing folders alphabetically
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "name") - 1 AS rn FROM "folders"
)
UPDATE "folders" f SET "sortOrder" = r.rn FROM ranked r WHERE f."id" = r."id";
