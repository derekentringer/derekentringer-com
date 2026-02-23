-- AlterTable
ALTER TABLE "notification_logs" ADD COLUMN "isCleared" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "notification_logs_isCleared_idx" ON "notification_logs"("isCleared");
