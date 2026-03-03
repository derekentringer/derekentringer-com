import type {
  Balance,
  LoanProfileData,
  InvestmentProfileData,
  SavingsProfileData,
} from "@derekentringer/shared";
import { getPrisma } from "../lib/prisma.js";
import {
  encryptBalanceForCreate,
  decryptBalance,
  encryptLoanProfileForCreate,
  encryptInvestmentProfileForCreate,
  encryptSavingsProfileForCreate,
} from "../lib/mappers.js";

const PROFILE_INCLUDE = {
  loanProfile: true,
  investmentProfile: true,
  savingsProfile: true,
  creditProfile: true,
} as const;

export async function createBalance(input: {
  accountId: string;
  balance: number;
  date: Date;
  loanProfile?: LoanProfileData;
  investmentProfile?: InvestmentProfileData;
  savingsProfile?: SavingsProfileData;
}): Promise<Balance> {
  const prisma = getPrisma();
  const encrypted = encryptBalanceForCreate(input);

  // Wrap in transaction so Balance + profile creation is atomic
  const balanceId = await prisma.$transaction(async (tx) => {
    const row = await tx.balance.create({ data: encrypted });

    if (input.loanProfile && hasData(input.loanProfile)) {
      await tx.loanProfile.create({
        data: encryptLoanProfileForCreate(row.id, input.loanProfile),
      });
    }
    if (input.investmentProfile && hasData(input.investmentProfile)) {
      await tx.investmentProfile.create({
        data: encryptInvestmentProfileForCreate(row.id, input.investmentProfile),
      });
    }
    if (input.savingsProfile && hasData(input.savingsProfile)) {
      await tx.savingsProfile.create({
        data: encryptSavingsProfileForCreate(row.id, input.savingsProfile),
      });
    }

    return row.id;
  });

  const full = await prisma.balance.findUniqueOrThrow({
    where: { id: balanceId },
    include: PROFILE_INCLUDE,
  });
  return decryptBalance(full);
}

// Transactional version used by the confirm endpoint
export async function createBalanceInTx(
  tx: Parameters<Parameters<ReturnType<typeof getPrisma>["$transaction"]>[0]>[0],
  input: {
    accountId: string;
    balance: number;
    date: Date;
    loanProfile?: LoanProfileData;
    investmentProfile?: InvestmentProfileData;
    savingsProfile?: SavingsProfileData;
  },
): Promise<string> {
  const encrypted = encryptBalanceForCreate(input);
  const row = await tx.balance.create({ data: encrypted });

  if (input.loanProfile && hasData(input.loanProfile)) {
    await tx.loanProfile.create({
      data: encryptLoanProfileForCreate(row.id, input.loanProfile),
    });
  }
  if (input.investmentProfile && hasData(input.investmentProfile)) {
    await tx.investmentProfile.create({
      data: encryptInvestmentProfileForCreate(row.id, input.investmentProfile),
    });
  }
  if (input.savingsProfile && hasData(input.savingsProfile)) {
    await tx.savingsProfile.create({
      data: encryptSavingsProfileForCreate(row.id, input.savingsProfile),
    });
  }

  return row.id;
}

// #4: Check for existing balance on the same account+date for deduplication
export async function findBalanceByDate(
  accountId: string,
  date: Date,
): Promise<Balance | null> {
  const prisma = getPrisma();
  // Match balances on the same calendar day
  const startOfDay = new Date(date);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const row = await prisma.balance.findFirst({
    where: {
      accountId,
      date: { gte: startOfDay, lte: endOfDay },
    },
    include: PROFILE_INCLUDE,
  });
  if (!row) return null;
  return decryptBalance(row);
}

export async function listBalances(accountId: string): Promise<Balance[]> {
  const prisma = getPrisma();
  const rows = await prisma.balance.findMany({
    where: { accountId },
    orderBy: { date: "desc" },
    include: PROFILE_INCLUDE,
  });
  return rows.map(decryptBalance);
}

/** Check if a profile data object has at least one non-null/undefined value */
function hasData(obj: object): boolean {
  return Object.values(obj).some((v) => v != null);
}
