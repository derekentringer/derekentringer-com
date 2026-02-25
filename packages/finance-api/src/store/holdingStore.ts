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

export async function createHolding(data: {
  accountId: string;
  name: string;
  ticker?: string | null;
  shares?: number | null;
  costBasis?: number | null;
  currentPrice?: number | null;
  assetClass: string;
  notes?: string | null;
}): Promise<Holding> {
  const prisma = getPrisma();

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

export async function getHolding(id: string): Promise<Holding | null> {
  const prisma = getPrisma();
  const row = await prisma.holding.findUnique({ where: { id } });
  if (!row) return null;
  return decryptHolding(row);
}

export async function listHoldings(accountId: string): Promise<Holding[]> {
  const prisma = getPrisma();
  const rows = await prisma.holding.findMany({
    where: { accountId },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map(decryptHolding);
}

export async function updateHolding(
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

export async function deleteHolding(id: string): Promise<boolean> {
  const prisma = getPrisma();
  try {
    await prisma.holding.delete({ where: { id } });
    return true;
  } catch (e: unknown) {
    if (isNotFoundError(e)) return false;
    throw e;
  }
}

export async function reorderHoldings(
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
  return updateHolding(id, { currentPrice: price });
}

export async function listAllHoldingsWithTickers(): Promise<Holding[]> {
  const prisma = getPrisma();
  const rows = await prisma.holding.findMany();
  const all = rows.map(decryptHolding);
  return all.filter((h) => h.ticker != null && h.ticker !== "");
}
