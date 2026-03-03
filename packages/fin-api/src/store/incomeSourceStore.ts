import type { IncomeSource } from "@derekentringer/shared";
import { getPrisma } from "../lib/prisma.js";
import {
  decryptIncomeSource,
  encryptIncomeSourceForCreate,
  encryptIncomeSourceForUpdate,
} from "../lib/mappers.js";

function isNotFoundError(e: unknown): boolean {
  return (
    e !== null &&
    typeof e === "object" &&
    "code" in e &&
    (e as { code: string }).code === "P2025"
  );
}

export async function createIncomeSource(data: {
  name: string;
  amount: number;
  frequency: string;
  isActive?: boolean;
  notes?: string | null;
}): Promise<IncomeSource> {
  const prisma = getPrisma();
  const encrypted = encryptIncomeSourceForCreate(data);
  const row = await prisma.incomeSource.create({ data: encrypted });
  return decryptIncomeSource(row);
}

export async function getIncomeSource(
  id: string,
): Promise<IncomeSource | null> {
  const prisma = getPrisma();
  const row = await prisma.incomeSource.findUnique({ where: { id } });
  if (!row) return null;
  return decryptIncomeSource(row);
}

export async function listIncomeSources(filter?: {
  isActive?: boolean;
}): Promise<IncomeSource[]> {
  const prisma = getPrisma();
  const where: Record<string, unknown> = {};
  if (filter?.isActive !== undefined) {
    where.isActive = filter.isActive;
  }
  const rows = await prisma.incomeSource.findMany({ where });
  return rows.map(decryptIncomeSource);
}

export async function updateIncomeSource(
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
  const encrypted = encryptIncomeSourceForUpdate(data);

  try {
    const row = await prisma.incomeSource.update({
      where: { id },
      data: encrypted,
    });
    return decryptIncomeSource(row);
  } catch (e: unknown) {
    if (isNotFoundError(e)) return null;
    throw e;
  }
}

export async function deleteIncomeSource(id: string): Promise<boolean> {
  const prisma = getPrisma();
  try {
    await prisma.incomeSource.delete({ where: { id } });
    return true;
  } catch (e: unknown) {
    if (isNotFoundError(e)) return false;
    throw e;
  }
}
