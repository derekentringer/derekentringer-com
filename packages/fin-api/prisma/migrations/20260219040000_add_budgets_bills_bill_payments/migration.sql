-- CreateTable
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "effectiveFrom" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bills" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "dueMonth" INTEGER,
    "dueWeekday" INTEGER,
    "category" TEXT,
    "accountId" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_payments" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" TEXT NOT NULL,

    CONSTRAINT "bill_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "budgets_category_effectiveFrom_idx" ON "budgets"("category", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_category_effectiveFrom_key" ON "budgets"("category", "effectiveFrom");

-- CreateIndex
CREATE INDEX "bills_isActive_idx" ON "bills"("isActive");

-- CreateIndex
CREATE INDEX "bill_payments_billId_idx" ON "bill_payments"("billId");

-- CreateIndex
CREATE INDEX "bill_payments_dueDate_idx" ON "bill_payments"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "bill_payments_billId_dueDate_key" ON "bill_payments"("billId", "dueDate");

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
