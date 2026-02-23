import type { Account, AccountType, LoanStaticData } from "@derekentringer/shared";
import { getPrisma } from "../lib/prisma.js";
import { decryptNumber, encryptNumber, encryptOptionalField } from "../lib/encryption.js";
import {
  decryptAccount,
  encryptAccountForCreate,
  encryptAccountForUpdate,
  encryptBalanceForCreate,
  encryptLoanStaticForUpdate,
} from "../lib/mappers.js";

function isNotFoundError(e: unknown): boolean {
  return (
    e !== null &&
    typeof e === "object" &&
    "code" in e &&
    (e as { code: string }).code === "P2025"
  );
}

export async function createAccount(data: {
  name: string;
  type: AccountType;
  institution?: string;
  currentBalance?: number;
  estimatedValue?: number;
  accountNumber?: string | null;
  interestRate?: number | null;
  csvParserId?: string | null;
  isActive?: boolean;
  isFavorite?: boolean;
  excludeFromIncomeSources?: boolean;
  dtiPercentage?: number;
}): Promise<Account> {
  const prisma = getPrisma();
  const encrypted = encryptAccountForCreate(data);

  // Auto-assign sortOrder = max(sortOrder) + 1
  const maxResult = await prisma.account.aggregate({
    _max: { sortOrder: true },
  });
  const nextSortOrder = (maxResult._max.sortOrder ?? -1) + 1;

  const row = await prisma.account.create({
    data: { ...encrypted, sortOrder: nextSortOrder },
  });
  return decryptAccount(row);
}

export async function getAccount(id: string): Promise<Account | null> {
  const prisma = getPrisma();
  const row = await prisma.account.findUnique({ where: { id } });
  if (!row) return null;
  return decryptAccount(row);
}

export async function listAccounts(filter?: {
  isActive?: boolean;
  type?: string;
}): Promise<Account[]> {
  const prisma = getPrisma();
  const where: Record<string, unknown> = {};
  if (filter?.isActive !== undefined) {
    where.isActive = filter.isActive;
  }
  if (filter?.type !== undefined) {
    where.type = filter.type;
  }
  const rows = await prisma.account.findMany({
    where,
    orderBy: { sortOrder: "asc" },
  });
  return rows.map(decryptAccount);
}

export async function updateAccount(
  id: string,
  data: {
    name?: string;
    type?: AccountType;
    institution?: string;
    currentBalance?: number;
    estimatedValue?: number | null;
    accountNumber?: string | null;
    interestRate?: number | null;
    csvParserId?: string | null;
    isActive?: boolean;
    isFavorite?: boolean;
    excludeFromIncomeSources?: boolean;
    dtiPercentage?: number;
  },
): Promise<Account | null> {
  const prisma = getPrisma();
  const encrypted = encryptAccountForUpdate(data);

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Read current balance before update to detect actual change
      let oldBalance: number | undefined;
      if (data.currentBalance !== undefined) {
        const existing = await tx.account.findUnique({
          where: { id },
          select: { currentBalance: true },
        });
        if (existing) {
          oldBalance = decryptNumber(existing.currentBalance);
        }
      }

      const row = await tx.account.update({
        where: { id },
        data: encrypted,
      });

      if (data.currentBalance !== undefined && data.currentBalance !== oldBalance) {
        const balanceData = encryptBalanceForCreate({
          accountId: id,
          balance: data.currentBalance,
          date: new Date(),
        });
        await tx.balance.create({ data: balanceData });
      }

      return row;
    });

    return decryptAccount(result);
  } catch (e: unknown) {
    if (isNotFoundError(e)) return null;
    throw e;
  }
}

// #3: Update only currentBalance without creating a Balance record.
// Used by PDF import confirm to avoid the auto-Balance side effect in updateAccount.
export async function updateAccountBalanceOnly(
  id: string,
  balance: number,
): Promise<boolean> {
  const prisma = getPrisma();
  const existing = await prisma.account.findUnique({
    where: { id },
    select: { currentBalance: true },
  });
  if (!existing) return false;

  const oldBalance = decryptNumber(existing.currentBalance);
  if (oldBalance === balance) return false;

  await prisma.account.update({
    where: { id },
    data: { currentBalance: encryptNumber(balance) },
  });
  return true;
}

// Update only interest rate without creating a Balance record.
export async function updateAccountInterestRateOnly(
  id: string,
  rate: number,
): Promise<boolean> {
  const prisma = getPrisma();
  const existing = await prisma.account.findUnique({
    where: { id },
    select: { interestRate: true },
  });
  if (!existing) return false;

  await prisma.account.update({
    where: { id },
    data: { interestRate: encryptNumber(rate) },
  });
  return true;
}

// Update static loan fields on an Account
export async function updateAccountLoanStatic(
  id: string,
  data: LoanStaticData,
): Promise<boolean> {
  const prisma = getPrisma();
  const existing = await prisma.account.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return false;

  const encrypted = encryptLoanStaticForUpdate(data);
  if (Object.keys(encrypted).length === 0) return false;

  await prisma.account.update({
    where: { id },
    data: encrypted,
  });
  return true;
}

// Update employer name for 401k/investment accounts
export async function updateAccountEmployerName(
  id: string,
  name: string,
): Promise<boolean> {
  const prisma = getPrisma();
  const existing = await prisma.account.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return false;

  await prisma.account.update({
    where: { id },
    data: { employerName: encryptOptionalField(name) },
  });
  return true;
}

/**
 * Return IDs of accounts with excludeFromIncomeSources=true.
 * Avoids decrypting all account fields when only IDs are needed.
 */
export async function listExcludedAccountIds(): Promise<string[]> {
  const prisma = getPrisma();
  const rows = await prisma.account.findMany({
    where: { excludeFromIncomeSources: true },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function deleteAccount(id: string): Promise<boolean> {
  const prisma = getPrisma();
  try {
    await prisma.account.delete({ where: { id } });
    return true;
  } catch (e: unknown) {
    if (isNotFoundError(e)) return false;
    throw e;
  }
}

export async function reorderAccounts(
  order: Array<{ id: string; sortOrder: number }>,
): Promise<void> {
  const prisma = getPrisma();
  await prisma.$transaction(
    order.map(({ id, sortOrder }) =>
      prisma.account.update({
        where: { id },
        data: { sortOrder },
      }),
    ),
  );
}
