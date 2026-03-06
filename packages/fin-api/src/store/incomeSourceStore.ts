import type { IncomeSource } from "@derekentringer/shared";
import { getPrisma } from "../lib/prisma.js";
import {
  decryptIncomeSource,
  encryptIncomeSourceForCreate,
  encryptIncomeSourceForUpdate,
} from "../lib/mappers.js";

export async function createIncomeSource(
  userId: string,
  data: {
    name: string;
    amount: number;
    frequency: string;
    isActive?: boolean;
    notes?: string | null;
  },
): Promise<IncomeSource> {
  const prisma = getPrisma();
  const encrypted = encryptIncomeSourceForCreate(data);
  const row = await prisma.incomeSource.create({
    data: { ...encrypted, userId },
  });
  return decryptIncomeSource(row);
}

export async function getIncomeSource(
  userId: string,
  id: string,
): Promise<IncomeSource | null> {
  const prisma = getPrisma();
  const row = await prisma.incomeSource.findUnique({ where: { id } });
  if (!row || row.userId !== userId) return null;
  return decryptIncomeSource(row);
}

export async function listIncomeSources(
  userId: string,
  filter?: {
    isActive?: boolean;
  },
): Promise<IncomeSource[]> {
  const prisma = getPrisma();
  const where: Record<string, unknown> = { userId };
  if (filter?.isActive !== undefined) {
    where.isActive = filter.isActive;
  }
  const rows = await prisma.incomeSource.findMany({ where });
  return rows.map(decryptIncomeSource);
}

export async function updateIncomeSource(
  userId: string,
  id: string,
  data: {
    name?: string;
    amount?: number;
    frequency?: string;
    isActive?: boolean;
    notes?: string | null;
  },
): Promise<IncomeSource | null> {
  const prisma = getPrisma();

  const existing = await prisma.incomeSource.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) return null;

  const encrypted = encryptIncomeSourceForUpdate(data);
  const row = await prisma.incomeSource.update({
    where: { id },
    data: encrypted,
  });
  return decryptIncomeSource(row);
}

export async function deleteIncomeSource(
  userId: string,
  id: string,
): Promise<boolean> {
  const prisma = getPrisma();

  const existing = await prisma.incomeSource.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) return false;

  await prisma.incomeSource.delete({ where: { id } });
  return true;
}
