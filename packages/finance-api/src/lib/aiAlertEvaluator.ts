import { NotificationType } from "@derekentringer/shared";
import type { PendingNotification } from "./notificationEvaluator.js";
import { loadConfig } from "../config.js";
import {
  getAiPreferences,
  getCachedInsights,
  setCachedInsights,
  getDailyUsage,
  incrementDailyUsage,
} from "../store/aiInsightStore.js";
import { listNotificationPreferences } from "../store/notificationStore.js";
import { buildContextForScope } from "../store/aiContextStore.js";
import { generateInsights } from "./anthropicService.js";

const DAILY_LIMIT = 10;

export async function evaluateAiAlerts(): Promise<PendingNotification[]> {
  // Guard: API key configured?
  const config = loadConfig();
  if (!config.anthropicApiKey) return [];

  // Guard: master + smartAlerts enabled?
  const prefs = await getAiPreferences();
  if (!prefs.masterEnabled || !prefs.smartAlerts) return [];

  // Guard: notification pref enabled?
  const notifPrefs = await listNotificationPreferences();
  const aiAlertPref = notifPrefs.find((p) => p.type === NotificationType.AiAlert);
  if (aiAlertPref && !aiAlertPref.enabled) return [];

  // Guard: daily usage under limit?
  const usage = await getDailyUsage();
  if (usage >= DAILY_LIMIT) return [];

  // Build context and check cache
  const context = await buildContextForScope("alerts");
  const cached = await getCachedInsights("alerts", context.contentHash);

  let insights;
  if (cached) {
    insights = cached;
  } else {
    const result = await generateInsights("alerts", context.data);
    await setCachedInsights("alerts", context.contentHash, result.insights, result.expiresAt);
    await incrementDailyUsage();
    insights = result.insights;
  }

  // Filter for alerts/warnings only
  const alertInsights = insights.filter(
    (i) => i.type === "alert" || i.severity === "warning",
  );

  return alertInsights.map((insight) => ({
    type: NotificationType.AiAlert,
    title: insight.title,
    body: insight.body,
    dedupeKey: `ai-alert:${insight.id}`,
    metadata: { insightId: insight.id, scope: insight.scope },
    route: insight.relatedPage ?? "/",
  }));
}
