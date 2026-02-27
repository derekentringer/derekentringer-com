import type {
  AiInsightPreferencesResponse,
  AiInsightsResponse,
  AiInsightScope,
  UpdateAiInsightPreferencesRequest,
  AiInsightUnseenCountResponse,
  AiInsightArchiveResponse,
} from "@derekentringer/shared/finance";
import api from "@/services/api";

export async function fetchAiPreferences(): Promise<AiInsightPreferencesResponse> {
  const { data } = await api.get<AiInsightPreferencesResponse>("/ai/preferences");
  return data;
}

export async function updateAiPreferences(
  body: UpdateAiInsightPreferencesRequest,
): Promise<AiInsightPreferencesResponse> {
  const { data } = await api.put<AiInsightPreferencesResponse>("/ai/preferences", body);
  return data;
}

export async function fetchAiInsights(
  scope: AiInsightScope,
  options?: { month?: string; quarter?: string },
): Promise<AiInsightsResponse> {
  const body: Record<string, string> = { scope };
  if (options?.month) body.month = options.month;
  if (options?.quarter) body.quarter = options.quarter;
  const { data } = await api.post<AiInsightsResponse>("/ai/insights", body);
  return data;
}

export async function clearAiCache(scope?: string): Promise<void> {
  const params: Record<string, string> = {};
  if (scope) params.scope = scope;
  await api.delete("/ai/cache", { params });
}

export async function markInsightsRead(insightIds: string[]): Promise<void> {
  await api.post("/ai/insights/mark-read", { insightIds });
}

export async function markInsightsDismissed(insightIds: string[]): Promise<void> {
  await api.post("/ai/insights/mark-dismissed", { insightIds });
}

export async function fetchUnseenInsightCounts(): Promise<AiInsightUnseenCountResponse> {
  const { data } = await api.get<AiInsightUnseenCountResponse>("/ai/insights/unseen-count");
  return data;
}

export async function fetchInsightArchive(
  limit = 20,
  offset = 0,
): Promise<AiInsightArchiveResponse> {
  const { data } = await api.get<AiInsightArchiveResponse>("/ai/insights/archive", {
    params: { limit, offset },
  });
  return data;
}
