import type { AiInsightPreferences, AiInsight } from "@derekentringer/shared";
import { DEFAULT_AI_INSIGHT_PREFERENCES } from "@derekentringer/shared";
import { getPrisma } from "../lib/prisma.js";
import { encryptField, decryptField } from "../lib/encryption.js";

// ─── Preferences ─────────────────────────────────────────────────────────────

export async function getAiPreferences(userId: string): Promise<AiInsightPreferences> {
  const prisma = getPrisma();
  const row = await prisma.aiInsightPreference.findFirst({
    where: { userId },
  });
  if (!row) return { ...DEFAULT_AI_INSIGHT_PREFERENCES };

  try {
    const decrypted = decryptField(row.config);
    const parsed = JSON.parse(decrypted) as Partial<AiInsightPreferences>;
    return { ...DEFAULT_AI_INSIGHT_PREFERENCES, ...parsed };
  } catch {
    return { ...DEFAULT_AI_INSIGHT_PREFERENCES };
  }
}

export async function updateAiPreferences(
  userId: string,
  updates: Partial<AiInsightPreferences>,
): Promise<AiInsightPreferences> {
  const prisma = getPrisma();
  const current = await getAiPreferences(userId);
  const merged = { ...current, ...updates };
  const encrypted = encryptField(JSON.stringify(merged));

  const existing = await prisma.aiInsightPreference.findFirst({
    where: { userId },
  });
  if (existing) {
    await prisma.aiInsightPreference.update({
      where: { id: existing.id },
      data: { config: encrypted },
    });
  } else {
    await prisma.aiInsightPreference.create({
      data: { userId, config: encrypted },
    });
  }

  return merged;
}

// ─── Cache ───────────────────────────────────────────────────────────────────

export async function getCachedInsights(
  userId: string,
  scope: string,
  contentHash: string,
): Promise<AiInsight[] | null> {
  const prisma = getPrisma();
  const row = await prisma.aiInsightCache.findUnique({
    where: { userId_scope_contentHash: { userId, scope, contentHash } },
  });

  if (!row) return null;
  if (new Date(row.expiresAt) < new Date()) {
    await prisma.aiInsightCache.delete({ where: { id: row.id } }).catch(() => {});
    return null;
  }

  try {
    const decrypted = decryptField(row.response);
    return JSON.parse(decrypted) as AiInsight[];
  } catch {
    return null;
  }
}

export async function setCachedInsights(
  userId: string,
  scope: string,
  contentHash: string,
  insights: AiInsight[],
  expiresAt: Date,
): Promise<void> {
  const prisma = getPrisma();
  const encrypted = encryptField(JSON.stringify(insights));

  await prisma.aiInsightCache.upsert({
    where: { userId_scope_contentHash: { userId, scope, contentHash } },
    create: { userId, scope, contentHash, response: encrypted, expiresAt },
    update: { response: encrypted, expiresAt },
  });
}

export async function clearInsightCache(userId: string, scope?: string): Promise<number> {
  const prisma = getPrisma();
  const result = await prisma.aiInsightCache.deleteMany({
    where: { userId, ...(scope ? { scope } : {}) },
  });
  return result.count;
}

export async function cleanupExpiredCache(): Promise<number> {
  const prisma = getPrisma();
  const result = await prisma.aiInsightCache.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}

// ─── Usage Tracking ──────────────────────────────────────────────────────────

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export async function getDailyUsage(userId: string): Promise<number> {
  const prisma = getPrisma();
  const date = todayKey();
  const row = await prisma.aiInsightUsage.findUnique({
    where: { userId_date: { userId, date } },
  });
  return row?.count ?? 0;
}

export async function incrementDailyUsage(userId: string): Promise<number> {
  const prisma = getPrisma();
  const date = todayKey();
  const row = await prisma.aiInsightUsage.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, count: 1 },
    update: { count: { increment: 1 } },
  });
  return row.count;
}
