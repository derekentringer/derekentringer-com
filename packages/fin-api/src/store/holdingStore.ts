import type { Holding } from "@derekentringer/shared";
import { getPrisma } from "../lib/prisma.js";
import {
  decryptHolding,
  encryptHoldingForCreate,
  encryptHoldingForUpdate,
} from "../lib/mappers.js";

function isNotFoundError(e: unknown): boolean {
  return (
    e !== null &&
    typeof e === "object" &&
    "code" in e &&
    (e as { code: string }).code === "P2025"
  );
}

export async function createHolding(
  userId: string,
  data: {
    accountId: string;
    name: string;
    ticker?: string | null;
    shares?: number | null;
    costBasis?: number | null;
    currentPrice?: number | null;
    assetClass: string;
    notes?: string | null;
  },
): Promise<Holding> {
  const prisma = getPrisma();

  // Verify the account belongs to the user
  const acct = await prisma.account.findUnique({ where: { id: data.accountId } });
  if (!acct || acct.userId !== userId) throw new Error("Account not found");

  // Auto-assign sortOrder per account (max + 1)
  const maxResult = await prisma.holding.aggregate({
    _max: { sortOrder: true },
    where: { accountId: data.accountId },
  });
  const nextSortOrder = (maxResult._max.sortOrder ?? -1) + 1;

  const encrypted = encryptHoldingForCreate(data);
  const row = await prisma.holding.create({
    data: { ...encrypted, sortOrder: nextSortOrder },
  });
  return decryptHolding(row);
}

export async function getHolding(userId: string, id: string): Promise<Holding | null> {
  const prisma = getPrisma();
  const row = await prisma.holding.findUnique({
    where: { id },
    include: { account: { select: { userId: true } } },
  });
  if (!row) return null;
  if (row.account.userId !== userId) return null;
  return decryptHolding(row);
}

export async function listHoldings(userId: string, accountId: string): Promise<Holding[]> {
  const prisma = getPrisma();

  // Verify account ownership
  const acct = await prisma.account.findUnique({ where: { id: accountId } });
  if (!acct || acct.userId !== userId) throw new Error("Account not found");

  const rows = await prisma.holding.findMany({
    where: { accountId },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map(decryptHolding);
}

export async function updateHolding(
  userId: string,
  id: string,
  data: {
    name?: string;
    ticker?: string | null;
    shares?: number | null;
    costBasis?: number | null;
    currentPrice?: number | null;
    assetClass?: string;
    notes?: string | null;
  },
): Promise<Holding | null> {
  const prisma = getPrisma();

  // Verify holding ownership via account
  const existing = await prisma.holding.findUnique({
    where: { id },
    include: { account: { select: { userId: true } } },
  });
  if (!existing) return null;
  if (existing.account.userId !== userId) return null;

  const encrypted = encryptHoldingForUpdate(data);

  try {
    const row = await prisma.holding.update({
      where: { id },
      data: encrypted,
    });
    return decryptHolding(row);
  } catch (e: unknown) {
    if (isNotFoundError(e)) return null;
    throw e;
  }
}

export async function deleteHolding(userId: string, id: string): Promise<boolean> {
  const prisma = getPrisma();

  // Verify holding ownership via account
  const existing = await prisma.holding.findUnique({
    where: { id },
    include: { account: { select: { userId: true } } },
  });
  if (!existing) return false;
  if (existing.account.userId !== userId) return false;

  try {
    await prisma.holding.delete({ where: { id } });
    return true;
  } catch (e: unknown) {
    if (isNotFoundError(e)) return false;
    throw e;
  }
}

export async function reorderHoldings(
  userId: string,
  order: Array<{ id: string; sortOrder: number }>,
): Promise<void> {
  const prisma = getPrisma();
  await prisma.$transaction(
    order.map((item) =>
      prisma.holding.update({
        where: { id: item.id },
        data: { sortOrder: item.sortOrder },
      }),
    ),
  );
}

export async function updateHoldingPrice(
  id: string,
  price: number,
): Promise<Holding | null> {
  const prisma = getPrisma();
  const encrypted = encryptHoldingForUpdate({ currentPrice: price });

  try {
    const row = await prisma.holding.update({
      where: { id },
      data: encrypted,
    });
    return decryptHolding(row);
  } catch (e: unknown) {
    if (isNotFoundError(e)) return null;
    throw e;
  }
}

export async function listAllHoldingsWithTickers(): Promise<Holding[]> {
  const prisma = getPrisma();
  const rows = await prisma.holding.findMany();
  const all = rows.map(decryptHolding);
  return all.filter((h) => h.ticker != null && h.ticker !== "");
}
