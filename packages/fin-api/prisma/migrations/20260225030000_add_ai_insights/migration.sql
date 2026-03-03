-- CreateTable
CREATE TABLE "ai_insight_preferences" (
    "id" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_insight_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_insight_cache" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_insight_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_insight_cache_scope_idx" ON "ai_insight_cache"("scope");

-- CreateIndex
CREATE INDEX "ai_insight_cache_expiresAt_idx" ON "ai_insight_cache"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ai_insight_cache_scope_contentHash_key" ON "ai_insight_cache"("scope", "contentHash");

-- CreateTable
CREATE TABLE "ai_insight_usage" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_insight_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_insight_usage_date_key" ON "ai_insight_usage"("date");
