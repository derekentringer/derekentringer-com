-- AlterTable
ALTER TABLE "notes" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Backfill based on updatedAt order
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "updatedAt" DESC) - 1 AS rn
  FROM "notes" WHERE "deletedAt" IS NULL
)
UPDATE "notes" SET "sortOrder" = ranked.rn FROM ranked WHERE "notes".id = ranked.id;

-- CreateIndex
CREATE INDEX "notes_sortOrder_idx" ON "notes"("sortOrder");
