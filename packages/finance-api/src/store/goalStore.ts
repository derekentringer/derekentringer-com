import type { Goal } from "@derekentringer/shared";
import { getPrisma } from "../lib/prisma.js";
import {
  decryptGoal,
  encryptGoalForCreate,
  encryptGoalForUpdate,
} from "../lib/mappers.js";

function isNotFoundError(e: unknown): boolean {
  return (
    e !== null &&
    typeof e === "object" &&
    "code" in e &&
    (e as { code: string }).code === "P2025"
  );
}

export async function createGoal(data: {
  name: string;
  type: string;
  targetAmount: number;
  currentAmount?: number | null;
  targetDate?: string | null;
  priority?: number;
  accountIds?: string[] | null;
  extraPayment?: number | null;
  notes?: string | null;
}): Promise<Goal> {
  const prisma = getPrisma();

  // Auto-assign sortOrder (max + 1)
  const maxResult = await prisma.goal.aggregate({
    _max: { sortOrder: true },
  });
  const nextSortOrder = (maxResult._max.sortOrder ?? -1) + 1;

  const encrypted = encryptGoalForCreate(data);
  const row = await prisma.goal.create({
    data: { ...encrypted, sortOrder: nextSortOrder },
  });
  return decryptGoal(row);
}

export async function getGoal(id: string): Promise<Goal | null> {
  const prisma = getPrisma();
  const row = await prisma.goal.findUnique({ where: { id } });
  if (!row) return null;
  return decryptGoal(row);
}

export async function listGoals(filter?: {
  isActive?: boolean;
  type?: string;
}): Promise<Goal[]> {
  const prisma = getPrisma();
  const where: Record<string, unknown> = {};
  if (filter?.isActive !== undefined) {
    where.isActive = filter.isActive;
  }
  if (filter?.type !== undefined) {
    where.type = filter.type;
  }
  const rows = await prisma.goal.findMany({
    where,
    orderBy: { sortOrder: "asc" },
  });
  return rows.map(decryptGoal);
}

export async function updateGoal(
  id: string,
  data: {
    name?: string;
    type?: string;
    targetAmount?: number;
    currentAmount?: number | null;
    targetDate?: string | null;
    priority?: number;
    accountIds?: string[] | null;
    extraPayment?: number | null;
    notes?: string | null;
    isActive?: boolean;
    isCompleted?: boolean;
  },
): Promise<Goal | null> {
  const prisma = getPrisma();
  const encrypted = encryptGoalForUpdate(data);

  try {
    const row = await prisma.goal.update({
      where: { id },
      data: encrypted,
    });
    return decryptGoal(row);
  } catch (e: unknown) {
    if (isNotFoundError(e)) return null;
    throw e;
  }
}

export async function deleteGoal(id: string): Promise<boolean> {
  const prisma = getPrisma();
  try {
    await prisma.goal.delete({ where: { id } });
    return true;
  } catch (e: unknown) {
    if (isNotFoundError(e)) return false;
    throw e;
  }
}

export async function reorderGoals(
  order: Array<{ id: string; sortOrder: number }>,
): Promise<void> {
  const prisma = getPrisma();
  await prisma.$transaction(
    order.map((item) =>
      prisma.goal.update({
        where: { id: item.id },
        data: { sortOrder: item.sortOrder },
      }),
    ),
  );
}
