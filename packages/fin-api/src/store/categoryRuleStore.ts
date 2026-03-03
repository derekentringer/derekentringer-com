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

export async function listCategoryRules(): Promise<CategoryRule[]> {
  const prisma = getPrisma();
  const rows = await prisma.categoryRule.findMany({
    orderBy: { priority: "asc" },
  });
  return rows.map(toRule);
}

export async function createCategoryRule(data: {
  pattern: string;
  matchType: RuleMatchType;
  category: string;
  priority?: number;
}): Promise<CategoryRule> {
  const prisma = getPrisma();
  const priority =
    data.priority ?? (data.matchType === "exact" ? 0 : 100);
  const row = await prisma.categoryRule.create({
    data: {
      pattern: data.pattern,
      matchType: data.matchType,
      category: data.category,
      priority,
    },
  });
  return toRule(row);
}

export async function updateCategoryRule(
  id: string,
  data: {
    pattern?: string;
    matchType?: RuleMatchType;
    category?: string;
    priority?: number;
  },
): Promise<CategoryRule | null> {
  const prisma = getPrisma();
  try {
    const row = await prisma.categoryRule.update({
      where: { id },
      data,
    });
    return toRule(row);
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

export async function deleteCategoryRule(id: string): Promise<boolean> {
  const prisma = getPrisma();
  try {
    await prisma.categoryRule.delete({ where: { id } });
    return true;
  } catch (e: unknown) {
    if (
      e !== null &&
      typeof e === "object" &&
      "code" in e &&
      (e as { code: string }).code === "P2025"
    ) {
      return false;
    }
    throw e;
  }
}
