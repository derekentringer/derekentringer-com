import type { AiInsight, AiInsightStatusEntry } from "@derekentringer/shared";
import { getPrisma } from "../lib/prisma.js";
import { encryptInsightStatusForCreate, decryptInsightStatus } from "../lib/mappers.js";

const DASHBOARD_SCOPE = "dashboard";
const NON_BANNER_SCOPES = new Set(["dashboard", "monthly-digest", "quarterly-digest", "alerts"]);

export async function ensureInsightStatuses(insights: AiInsight[]): Promise<void> {
  if (insights.length === 0) return;
  const prisma = getPrisma();

  const existingIds = new Set(
    (
      await prisma.aiInsightStatus.findMany({
        where: { insightId: { in: insights.map((i) => i.id) } },
        select: { insightId: true },
      })
    ).map((r) => r.insightId),
  );

  const toCreate = insights.filter((i) => !existingIds.has(i.id));
  if (toCreate.length === 0) return;

  const data = toCreate.map((i) =>
    encryptInsightStatusForCreate({
      insightId: i.id,
      scope: i.scope,
      title: i.title,
      body: i.body,
      type: i.type,
      severity: i.severity,
      relatedPage: i.relatedPage,
      generatedAt: new Date(i.generatedAt),
    }),
  );

  await prisma.aiInsightStatus.createMany({ data, skipDuplicates: true });
}

export async function markInsightsRead(insightIds: string[]): Promise<void> {
  if (insightIds.length === 0) return;
  const prisma = getPrisma();
  await prisma.aiInsightStatus.updateMany({
    where: { insightId: { in: insightIds }, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
}

export async function markInsightsDismissed(insightIds: string[]): Promise<void> {
  if (insightIds.length === 0) return;
  const prisma = getPrisma();
  await prisma.aiInsightStatus.updateMany({
    where: { insightId: { in: insightIds }, isDismissed: false },
    data: { isDismissed: true, dismissedAt: new Date() },
  });
}

export async function getInsightStatuses(
  insightIds: string[],
): Promise<{ insightId: string; isRead: boolean; isDismissed: boolean }[]> {
  if (insightIds.length === 0) return [];
  const prisma = getPrisma();
  const rows = await prisma.aiInsightStatus.findMany({
    where: { insightId: { in: insightIds } },
    select: { insightId: true, isRead: true, isDismissed: true },
  });
  return rows;
}

export async function getUnseenCounts(): Promise<{ dashboard: number; banners: number }> {
  const prisma = getPrisma();

  const [dashboardCount, bannerCount] = await Promise.all([
    prisma.aiInsightStatus.count({
      where: { scope: DASHBOARD_SCOPE, isRead: false },
    }),
    prisma.aiInsightStatus.count({
      where: {
        scope: { notIn: Array.from(NON_BANNER_SCOPES) },
        isDismissed: false,
        isRead: false,
      },
    }),
  ]);

  return { dashboard: dashboardCount, banners: bannerCount };
}

export async function getArchive(
  limit: number,
  offset: number,
): Promise<{ insights: AiInsightStatusEntry[]; total: number }> {
  const prisma = getPrisma();

  const [rows, total] = await Promise.all([
    prisma.aiInsightStatus.findMany({
      orderBy: { generatedAt: "desc" },
      skip: offset,
      take: limit,
    }),
    prisma.aiInsightStatus.count(),
  ]);

  return {
    insights: rows.map(decryptInsightStatus),
    total,
  };
}

export async function cleanupOldStatuses(retentionDays: number): Promise<number> {
  const prisma = getPrisma();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const result = await prisma.aiInsightStatus.deleteMany({
    where: { generatedAt: { lt: cutoff } },
  });
  return result.count;
}
