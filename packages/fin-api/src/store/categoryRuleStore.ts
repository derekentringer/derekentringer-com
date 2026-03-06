import type { CategoryRule, RuleMatchType } from "@derekentringer/shared";
import { getPrisma } from "../lib/prisma.js";

function toRule(row: {
  id: string;
  pattern: string;
  matchType: string;
  category: string;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}): CategoryRule {
  return {
    id: row.id,
    pattern: row.pattern,
    matchType: row.matchType as RuleMatchType,
    category: row.category,
    priority: row.priority,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listCategoryRules(
  userId: string,
): Promise<CategoryRule[]> {
  const prisma = getPrisma();
  const rows = await prisma.categoryRule.findMany({
    where: { userId },
    orderBy: { priority: "asc" },
  });
  return rows.map(toRule);
}

export async function createCategoryRule(
  userId: string,
  data: {
    pattern: string;
    matchType: RuleMatchType;
    category: string;
    priority?: number;
  },
): Promise<CategoryRule> {
  const prisma = getPrisma();
  const priority =
    data.priority ?? (data.matchType === "exact" ? 0 : 100);
  const row = await prisma.categoryRule.create({
    data: {
      userId,
      pattern: data.pattern,
      matchType: data.matchType,
      category: data.category,
      priority,
    },
  });
  return toRule(row);
}

export async function updateCategoryRule(
  userId: string,
  id: string,
  data: {
    pattern?: string;
    matchType?: RuleMatchType;
    category?: string;
    priority?: number;
  },
): Promise<CategoryRule | null> {
  const prisma = getPrisma();
  const existing = await prisma.categoryRule.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) return null;
  const row = await prisma.categoryRule.update({
    where: { id },
    data,
  });
  return toRule(row);
}

export async function deleteCategoryRule(
  userId: string,
  id: string,
): Promise<boolean> {
  const prisma = getPrisma();
  const existing = await prisma.categoryRule.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) return false;
  await prisma.categoryRule.delete({ where: { id } });
  return true;
}
