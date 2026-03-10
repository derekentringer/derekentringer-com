-- AlterTable
ALTER TABLE "notes" ADD COLUMN "favoriteSortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "notes_favoriteSortOrder_idx" ON "notes"("favoriteSortOrder");
