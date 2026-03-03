-- CreateIndex
CREATE INDEX "accounts_isActive_idx" ON "accounts"("isActive");

-- AlterTable
ALTER TABLE "balances" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
