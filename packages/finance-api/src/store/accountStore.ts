import type { Account, AccountType } from "@derekentringer/shared";
import { getPrisma } from "../lib/prisma.js";
import { decryptNumber } from "../lib/encryption.js";
import {
  decryptAccount,
  encryptAccountForCreate,
  encryptAccountForUpdate,
  encryptBalanceForCreate,
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
  institution: string;
  currentBalance: number;
  accountNumber?: string | null;
  interestRate?: number | null;
  csvParserId?: string | null;
  isActive?: boolean;
}): Promise<Account> {
  const prisma = getPrisma();
  const encrypted = encryptAccountForCreate(data);
  const row = await prisma.account.create({ data: encrypted });
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
}): Promise<Account[]> {
  const prisma = getPrisma();
  const where: Record<string, unknown> = {};
  if (filter?.isActive !== undefined) {
    where.isActive = filter.isActive;
  }
  const rows = await prisma.account.findMany({ where });
  const accounts = rows.map(decryptAccount);
  accounts.sort((a, b) => a.name.localeCompare(b.name));
  return accounts;
}

export async function updateAccount(
  id: string,
  data: {
    name?: string;
    type?: AccountType;
    institution?: string;
    currentBalance?: number;
    accountNumber?: string | null;
    interestRate?: number | null;
    csvParserId?: string | null;
    isActive?: boolean;
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
