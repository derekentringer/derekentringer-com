-- CreateIndex: composite index for Balance(accountId, date) queries
CREATE INDEX "balances_accountId_date_idx" ON "balances"("accountId", "date");

-- AlterTable: Add loan/investment static fields to accounts
ALTER TABLE "accounts" ADD COLUMN "originalBalance" TEXT;
ALTER TABLE "accounts" ADD COLUMN "originationDate" TEXT;
ALTER TABLE "accounts" ADD COLUMN "maturityDate" TEXT;
ALTER TABLE "accounts" ADD COLUMN "loanType" TEXT;
ALTER TABLE "accounts" ADD COLUMN "employerName" TEXT;

-- CreateTable: loan_profiles
CREATE TABLE "loan_profiles" (
    "id" TEXT NOT NULL,
    "balanceId" TEXT NOT NULL,
    "periodStart" TEXT,
    "periodEnd" TEXT,
    "interestRate" TEXT,
    "monthlyPayment" TEXT,
    "principalPaid" TEXT,
    "interestPaid" TEXT,
    "escrowAmount" TEXT,
    "nextPaymentDate" TEXT,
    "remainingTermMonths" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "loan_profiles_balanceId_key" ON "loan_profiles"("balanceId");

-- AddForeignKey
ALTER TABLE "loan_profiles" ADD CONSTRAINT "loan_profiles_balanceId_fkey" FOREIGN KEY ("balanceId") REFERENCES "balances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: investment_profiles
CREATE TABLE "investment_profiles" (
    "id" TEXT NOT NULL,
    "balanceId" TEXT NOT NULL,
    "periodStart" TEXT,
    "periodEnd" TEXT,
    "rateOfReturn" TEXT,
    "ytdReturn" TEXT,
    "totalGainLoss" TEXT,
    "contributions" TEXT,
    "employerMatch" TEXT,
    "vestingPct" TEXT,
    "fees" TEXT,
    "expenseRatio" TEXT,
    "dividends" TEXT,
    "capitalGains" TEXT,
    "numHoldings" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investment_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "investment_profiles_balanceId_key" ON "investment_profiles"("balanceId");

-- AddForeignKey
ALTER TABLE "investment_profiles" ADD CONSTRAINT "investment_profiles_balanceId_fkey" FOREIGN KEY ("balanceId") REFERENCES "balances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: savings_profiles
CREATE TABLE "savings_profiles" (
    "id" TEXT NOT NULL,
    "balanceId" TEXT NOT NULL,
    "periodStart" TEXT,
    "periodEnd" TEXT,
    "apy" TEXT,
    "interestEarned" TEXT,
    "interestEarnedYtd" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "savings_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "savings_profiles_balanceId_key" ON "savings_profiles"("balanceId");

-- AddForeignKey
ALTER TABLE "savings_profiles" ADD CONSTRAINT "savings_profiles_balanceId_fkey" FOREIGN KEY ("balanceId") REFERENCES "balances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
