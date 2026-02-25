-- CreateTable
CREATE TABLE "holdings" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ticker" TEXT,
    "shares" TEXT,
    "costBasis" TEXT,
    "currentPrice" TEXT,
    "assetClass" TEXT NOT NULL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "target_allocations" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "assetClass" TEXT NOT NULL,
    "targetPct" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "target_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_history" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benchmark_history" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "benchmark_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "holdings_accountId_idx" ON "holdings"("accountId");

-- CreateIndex
CREATE INDEX "holdings_assetClass_idx" ON "holdings"("assetClass");

-- CreateIndex
CREATE UNIQUE INDEX "target_allocations_accountId_assetClass_key" ON "target_allocations"("accountId", "assetClass");

-- CreateIndex
CREATE UNIQUE INDEX "price_history_ticker_date_key" ON "price_history"("ticker", "date");

-- CreateIndex
CREATE UNIQUE INDEX "benchmark_history_symbol_date_key" ON "benchmark_history"("symbol", "date");

-- AddForeignKey
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
