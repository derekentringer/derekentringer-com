-- CreateTable
CREATE TABLE "credit_profiles" (
    "id" TEXT NOT NULL,
    "balanceId" TEXT NOT NULL,
    "periodStart" TEXT,
    "periodEnd" TEXT,
    "apr" TEXT,
    "minimumPayment" TEXT,
    "creditLimit" TEXT,
    "availableCredit" TEXT,
    "interestCharged" TEXT,
    "feesCharged" TEXT,
    "rewardsEarned" TEXT,
    "paymentDueDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credit_profiles_balanceId_key" ON "credit_profiles"("balanceId");

-- AddForeignKey
ALTER TABLE "credit_profiles" ADD CONSTRAINT "credit_profiles_balanceId_fkey" FOREIGN KEY ("balanceId") REFERENCES "balances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
