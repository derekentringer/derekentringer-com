import type {
  AiInsightPreferencesResponse,
  AiInsightsResponse,
  AiInsightScope,
  UpdateAiInsightPreferencesRequest,
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
