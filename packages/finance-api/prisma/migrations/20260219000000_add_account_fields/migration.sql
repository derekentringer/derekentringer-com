-- AlterTable
ALTER TABLE "accounts" ADD COLUMN "interestRate" TEXT,
ADD COLUMN "csvParserId" TEXT,
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
