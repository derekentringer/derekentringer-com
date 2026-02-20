-- AlterTable
ALTER TABLE "accounts" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Backfill: assign sortOrder based on createdAt order
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) - 1 AS rn
  FROM "accounts"
)
UPDATE "accounts" SET "sortOrder" = ranked.rn FROM ranked WHERE "accounts".id = ranked.id;

-- CreateIndex
CREATE INDEX "accounts_sortOrder_idx" ON "accounts"("sortOrder");
