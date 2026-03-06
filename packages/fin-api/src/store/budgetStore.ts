import type { Budget } from "@derekentringer/shared";
import { getPrisma } from "../lib/prisma.js";
import {
  decryptBudget,
  encryptBudgetForCreate,
  encryptBudgetForUpdate,
} from "../lib/mappers.js";

export async function createBudget(
  userId: string,
  data: {
    category: string;
    amount: number;
    effectiveFrom: string;
    notes?: string | null;
  },
): Promise<Budget> {
  const prisma = getPrisma();
  const encrypted = encryptBudgetForCreate(data);
  const row = await prisma.budget.create({ data: { ...encrypted, userId } });
  return decryptBudget(row);
}

export async function listBudgets(userId: string): Promise<Budget[]> {
  const prisma = getPrisma();
  const rows = await prisma.budget.findMany({
    where: { userId },
    orderBy: [{ category: "asc" }, { effectiveFrom: "desc" }],
  });
  return rows.map(decryptBudget);
}

export async function updateBudget(
  userId: string,
  id: string,
  data: { amount?: number; notes?: string | null },
): Promise<Budget | null> {
  const prisma = getPrisma();

  const existing = await prisma.budget.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) return null;

  const encrypted = encryptBudgetForUpdate(data);
  const row = await prisma.budget.update({
    where: { id },
    data: encrypted,
  });
  return decryptBudget(row);
}

export async function deleteBudget(
  userId: string,
  id: string,
): Promise<boolean> {
  const prisma = getPrisma();

  const existing = await prisma.budget.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) return false;

  await prisma.budget.delete({ where: { id } });
  return true;
}

/**
 * Get the active budget for each category for a given month.
 * A budget is "active" if its effectiveFrom <= targetMonth.
 * For each category, we pick the one with the latest effectiveFrom.
 */
export async function getActiveBudgetsForMonth(
  userId: string,
  targetMonth: string,
): Promise<Budget[]> {
  const prisma = getPrisma();

  // Get all budget rows where effectiveFrom <= targetMonth
  const rows = await prisma.budget.findMany({
    where: {
      userId,
      effectiveFrom: { lte: targetMonth },
    },
    orderBy: { effectiveFrom: "desc" },
  });

  // Group by category, keep only the latest effectiveFrom per category
  const latestByCategory = new Map<string, (typeof rows)[0]>();
  for (const row of rows) {
    if (!latestByCategory.has(row.category)) {
      latestByCategory.set(row.category, row);
    }
  }

  return Array.from(latestByCategory.values()).map(decryptBudget);
}
