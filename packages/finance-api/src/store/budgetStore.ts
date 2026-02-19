import type { Budget } from "@derekentringer/shared";
import { getPrisma } from "../lib/prisma.js";
import {
  decryptBudget,
  encryptBudgetForCreate,
  encryptBudgetForUpdate,
} from "../lib/mappers.js";

function isNotFoundError(e: unknown): boolean {
  return (
    e !== null &&
    typeof e === "object" &&
    "code" in e &&
    (e as { code: string }).code === "P2025"
  );
}

export async function createBudget(data: {
  category: string;
  amount: number;
  effectiveFrom: string;
  notes?: string | null;
}): Promise<Budget> {
  const prisma = getPrisma();
  const encrypted = encryptBudgetForCreate(data);
  const row = await prisma.budget.create({ data: encrypted });
  return decryptBudget(row);
}

export async function listBudgets(): Promise<Budget[]> {
  const prisma = getPrisma();
  const rows = await prisma.budget.findMany({
    orderBy: [{ category: "asc" }, { effectiveFrom: "desc" }],
  });
  return rows.map(decryptBudget);
}

export async function updateBudget(
  id: string,
  data: { amount?: number; notes?: string | null },
): Promise<Budget | null> {
  const prisma = getPrisma();
  const encrypted = encryptBudgetForUpdate(data);

  try {
    const row = await prisma.budget.update({
      where: { id },
      data: encrypted,
    });
    return decryptBudget(row);
  } catch (e: unknown) {
    if (isNotFoundError(e)) return null;
    throw e;
  }
}

export async function deleteBudget(id: string): Promise<boolean> {
  const prisma = getPrisma();
  try {
    await prisma.budget.delete({ where: { id } });
    return true;
  } catch (e: unknown) {
    if (isNotFoundError(e)) return false;
    throw e;
  }
}

/**
 * Get the active budget for each category for a given month.
 * A budget is "active" if its effectiveFrom <= targetMonth.
 * For each category, we pick the one with the latest effectiveFrom.
 */
export async function getActiveBudgetsForMonth(
  targetMonth: string,
): Promise<Budget[]> {
  const prisma = getPrisma();

  // Get all budget rows where effectiveFrom <= targetMonth
  const rows = await prisma.budget.findMany({
    where: {
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
