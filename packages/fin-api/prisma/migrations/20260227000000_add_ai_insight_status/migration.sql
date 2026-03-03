-- CreateTable
CREATE TABLE "ai_insight_statuses" (
    "id" TEXT NOT NULL,
    "insightId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "relatedPage" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isDismissed" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_insight_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_insight_statuses_insightId_key" ON "ai_insight_statuses"("insightId");

-- CreateIndex
CREATE INDEX "ai_insight_statuses_scope_idx" ON "ai_insight_statuses"("scope");

-- CreateIndex
CREATE INDEX "ai_insight_statuses_isRead_idx" ON "ai_insight_statuses"("isRead");

-- CreateIndex
CREATE INDEX "ai_insight_statuses_isDismissed_idx" ON "ai_insight_statuses"("isDismissed");

-- CreateIndex
CREATE INDEX "ai_insight_statuses_generatedAt_idx" ON "ai_insight_statuses"("generatedAt");
