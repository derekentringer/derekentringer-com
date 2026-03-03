-- CreateTable
CREATE TABLE "goals" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "targetAmount" TEXT NOT NULL,
    "currentAmount" TEXT,
    "targetDate" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "accountIds" TEXT,
    "extraPayment" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "goals_isActive_idx" ON "goals"("isActive");

-- CreateIndex
CREATE INDEX "goals_type_idx" ON "goals"("type");

-- CreateIndex
CREATE INDEX "goals_sortOrder_idx" ON "goals"("sortOrder");
