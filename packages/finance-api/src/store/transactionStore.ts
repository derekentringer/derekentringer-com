import type { Transaction, CategoryRule } from "@derekentringer/shared";
import { getPrisma } from "../lib/prisma.js";
import {
  decryptTransaction,
  encryptTransactionForCreate,
  encryptTransactionForUpdate,
} from "../lib/mappers.js";
import { decryptField } from "../lib/encryption.js";

function isNotFoundError(e: unknown): boolean {
  return (
    e !== null &&
    typeof e === "object" &&
    "code" in e &&
    (e as { code: string }).code === "P2025"
  );
}

export async function listTransactions(filter?: {
  accountId?: string;
  startDate?: Date;
  endDate?: Date;
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ transactions: Transaction[]; total: number }> {
  const prisma = getPrisma();
  const where: Record<string, unknown> = {};

  if (filter?.accountId) where.accountId = filter.accountId;
  if (filter?.category) where.category = filter.category;
  if (filter?.startDate || filter?.endDate) {
    const dateFilter: Record<string, Date> = {};
    if (filter.startDate) dateFilter.gte = filter.startDate;
    if (filter.endDate) dateFilter.lte = filter.endDate;
    where.date = dateFilter;
  }

  const limit = filter?.limit ?? 50;
  const offset = filter?.offset ?? 0;

  // When search is active, fetch all SQL-matching rows, decrypt, filter in-memory, then paginate
  if (filter?.search) {
    const rows = await prisma.transaction.findMany({
      where,
      orderBy: { date: "desc" },
      take: 10000,
    });

    const searchLower = filter.search.toLowerCase();
    const filtered = rows
      .map(decryptTransaction)
      .filter((t) => t.description.toLowerCase().includes(searchLower));

    return {
      transactions: filtered.slice(offset, offset + limit),
      total: filtered.length,
    };
  }

  const [rows, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { date: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    transactions: rows.map(decryptTransaction),
    total,
  };
}

export async function getTransaction(
  id: string,
): Promise<Transaction | null> {
  const prisma = getPrisma();
  const row = await prisma.transaction.findUnique({ where: { id } });
  if (!row) return null;
  return decryptTransaction(row);
}

export async function findExistingHashes(
  accountId: string,
  hashes: string[],
): Promise<Set<string>> {
  const prisma = getPrisma();
  const existing = await prisma.transaction.findMany({
    where: {
      accountId,
      dedupeHash: { in: hashes },
    },
    select: { dedupeHash: true },
  });
  return new Set(
    existing.map((r) => r.dedupeHash).filter((h): h is string => h !== null),
  );
}

export async function bulkCreateTransactions(
  transactions: Array<{
    accountId: string;
    date: Date;
    description: string;
    amount: number;
    category?: string | null;
    dedupeHash?: string | null;
  }>,
): Promise<number> {
  const prisma = getPrisma();
  const data = transactions.map((t) => encryptTransactionForCreate(t));

  const result = await prisma.transaction.createMany({
    data,
    skipDuplicates: true,
  });

  return result.count;
}

export async function updateTransaction(
  id: string,
  data: { category?: string | null; notes?: string | null },
): Promise<Transaction | null> {
  const prisma = getPrisma();
  const encrypted = encryptTransactionForUpdate(data);
  try {
    const row = await prisma.transaction.update({
      where: { id },
      data: encrypted,
    });
    return decryptTransaction(row);
  } catch (e: unknown) {
    if (isNotFoundError(e)) return null;
    throw e;
  }
}

export async function deleteTransaction(id: string): Promise<boolean> {
  const prisma = getPrisma();
  try {
    await prisma.transaction.delete({ where: { id } });
    return true;
  } catch (e: unknown) {
    if (isNotFoundError(e)) return false;
    throw e;
  }
}

export async function bulkUpdateCategory(
  ids: string[],
  category: string | null,
): Promise<number> {
  const prisma = getPrisma();
  const result = await prisma.transaction.updateMany({
    where: { id: { in: ids } },
    data: { category },
  });
  return result.count;
}

export async function applyRuleToTransactions(
  rule: CategoryRule,
): Promise<number> {
  const prisma = getPrisma();
  const patternLower = rule.pattern.toLowerCase();

  // Load all transactions that don't already have this category
  // Use OR to include null categories (NOT excludes nulls in SQL)
  const rows = await prisma.transaction.findMany({
    where: {
      OR: [
        { category: null },
        { NOT: { category: rule.category } },
      ],
    },
    select: { id: true, description: true },
  });

  // Decrypt descriptions and find matches
  const matchingIds: string[] = [];
  for (const row of rows) {
    const description = decryptField(row.description).toLowerCase();
    const matches =
      rule.matchType === "exact"
        ? description === patternLower
        : description.includes(patternLower);
    if (matches) matchingIds.push(row.id);
  }

  if (matchingIds.length === 0) return 0;

  const result = await prisma.transaction.updateMany({
    where: { id: { in: matchingIds } },
    data: { category: rule.category },
  });

  return result.count;
}
