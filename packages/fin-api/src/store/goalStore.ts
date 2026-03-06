import type { Goal } from "@derekentringer/shared";
import { getPrisma } from "../lib/prisma.js";
import {
  decryptGoal,
  encryptGoalForCreate,
  encryptGoalForUpdate,
} from "../lib/mappers.js";

export async function createGoal(
  userId: string,
  data: {
    name: string;
    type: string;
    targetAmount: number;
    currentAmount?: number | null;
    targetDate?: string | null;
    priority?: number;
    accountIds?: string[] | null;
    extraPayment?: number | null;
    notes?: string | null;
  },
): Promise<Goal> {
  const prisma = getPrisma();

  // Auto-assign sortOrder (max + 1), scoped to this user
  const maxResult = await prisma.goal.aggregate({
    where: { userId },
    _max: { sortOrder: true },
  });
  const nextSortOrder = (maxResult._max.sortOrder ?? -1) + 1;

  const encrypted = encryptGoalForCreate(data);
  const row = await prisma.goal.create({
    data: { ...encrypted, userId, sortOrder: nextSortOrder },
  });
  return decryptGoal(row);
}

export async function getGoal(
  userId: string,
  id: string,
): Promise<Goal | null> {
  const prisma = getPrisma();
  const row = await prisma.goal.findUnique({ where: { id } });
  if (!row || row.userId !== userId) return null;
  return decryptGoal(row);
}

export async function listGoals(
  userId: string,
  filter?: {
    isActive?: boolean;
    type?: string;
  },
): Promise<Goal[]> {
  const prisma = getPrisma();
  const where: Record<string, unknown> = { userId };
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
  userId: string,
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

  const existing = await prisma.goal.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) return null;

  const encrypted = encryptGoalForUpdate(data);
  const row = await prisma.goal.update({
    where: { id },
    data: encrypted,
  });
  return decryptGoal(row);
}

export async function deleteGoal(
  userId: string,
  id: string,
): Promise<boolean> {
  const prisma = getPrisma();

  const existing = await prisma.goal.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) return false;

  await prisma.goal.delete({ where: { id } });
  return true;
}

export async function reorderGoals(
  userId: string,
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
