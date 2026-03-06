import type { Category } from "@derekentringer/shared";
import { getPrisma } from "../lib/prisma.js";

const DEFAULT_CATEGORIES = [
  "Housing",
  "Utilities",
  "Groceries",
  "Dining",
  "Transportation",
  "Entertainment",
  "Shopping",
  "Health",
  "Insurance",
  "Subscriptions",
  "Income",
  "Transfer",
  "Other",
];

function toCategory(row: {
  id: string;
  name: string;
  isDefault: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): Category {
  return {
    id: row.id,
    name: row.name,
    isDefault: row.isDefault,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listCategories(userId: string): Promise<Category[]> {
  const prisma = getPrisma();
  const rows = await prisma.category.findMany({
    where: { userId },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map(toCategory);
}

export async function createCategory(
  userId: string,
  data: { name: string },
): Promise<Category> {
  const prisma = getPrisma();
  const maxSort = await prisma.category.aggregate({
    where: { userId },
    _max: { sortOrder: true },
  });
  const nextSort = (maxSort._max.sortOrder ?? -1) + 1;
  const row = await prisma.category.create({
    data: {
      userId,
      name: data.name,
      sortOrder: nextSort,
    },
  });
  return toCategory(row);
}

export async function updateCategory(
  userId: string,
  id: string,
  data: { name?: string; sortOrder?: number },
): Promise<Category | null> {
  const prisma = getPrisma();
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) return null;
  try {
    const row = await prisma.category.update({
      where: { id },
      data,
    });
    return toCategory(row);
  } catch (e: unknown) {
    if (
      e !== null &&
      typeof e === "object" &&
      "code" in e &&
      (e as { code: string }).code === "P2025"
    ) {
      return null;
    }
    throw e;
  }
}

export async function deleteCategory(
  userId: string,
  id: string,
): Promise<boolean> {
  const prisma = getPrisma();
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) return false;
  if (existing.isDefault) {
    throw new Error("Cannot delete default category");
  }
  await prisma.category.delete({ where: { id } });
  return true;
}

export async function seedDefaultCategories(userId: string): Promise<void> {
  const prisma = getPrisma();
  for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
    await prisma.category.upsert({
      where: { userId_name: { userId, name: DEFAULT_CATEGORIES[i] } },
      update: {},
      create: {
        userId,
        name: DEFAULT_CATEGORIES[i],
        isDefault: true,
        sortOrder: i,
      },
    });
  }
}
