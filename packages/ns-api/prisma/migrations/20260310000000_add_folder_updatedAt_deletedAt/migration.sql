-- AlterTable
ALTER TABLE "folders" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "folders" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "folders_deletedAt_idx" ON "folders"("deletedAt");
