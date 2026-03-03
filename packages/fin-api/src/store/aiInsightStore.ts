import type { AiInsightPreferences, AiInsight } from "@derekentringer/shared";
import { DEFAULT_AI_INSIGHT_PREFERENCES } from "@derekentringer/shared";
import { getPrisma } from "../lib/prisma.js";
import { encryptField, decryptField } from "../lib/encryption.js";

// ─── Preferences ─────────────────────────────────────────────────────────────

export async function getAiPreferences(): Promise<AiInsightPreferences> {
  const prisma = getPrisma();
  const row = await prisma.aiInsightPreference.findFirst();
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
  updates: Partial<AiInsightPreferences>,
): Promise<AiInsightPreferences> {
  const prisma = getPrisma();
  const current = await getAiPreferences();
  const merged = { ...current, ...updates };
  const encrypted = encryptField(JSON.stringify(merged));

  const existing = await prisma.aiInsightPreference.findFirst();
  if (existing) {
    await prisma.aiInsightPreference.update({
      where: { id: existing.id },
      data: { config: encrypted },
    });
  } else {
    await prisma.aiInsightPreference.create({
      data: { config: encrypted },
    });
  }

  return merged;
}

// ─── Cache ───────────────────────────────────────────────────────────────────

export async function getCachedInsights(
  scope: string,
  contentHash: string,
): Promise<AiInsight[] | null> {
  const prisma = getPrisma();
  const row = await prisma.aiInsightCache.findUnique({
    where: { scope_contentHash: { scope, contentHash } },
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
  scope: string,
  contentHash: string,
  insights: AiInsight[],
  expiresAt: Date,
): Promise<void> {
  const prisma = getPrisma();
  const encrypted = encryptField(JSON.stringify(insights));

  await prisma.aiInsightCache.upsert({
    where: { scope_contentHash: { scope, contentHash } },
    create: { scope, contentHash, response: encrypted, expiresAt },
    update: { response: encrypted, expiresAt },
  });
}

export async function clearInsightCache(scope?: string): Promise<number> {
  const prisma = getPrisma();
  const result = await prisma.aiInsightCache.deleteMany(
    scope ? { where: { scope } } : undefined,
  );
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

export async function getDailyUsage(): Promise<number> {
  const prisma = getPrisma();
  const row = await prisma.aiInsightUsage.findUnique({
    where: { date: todayKey() },
  });
  return row?.count ?? 0;
}

export async function incrementDailyUsage(): Promise<number> {
  const prisma = getPrisma();
  const date = todayKey();
  const row = await prisma.aiInsightUsage.upsert({
    where: { date },
    create: { date, count: 1 },
    update: { count: { increment: 1 } },
  });
  return row.count;
}
