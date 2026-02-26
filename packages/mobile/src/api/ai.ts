import type {
  AiInsightPreferencesResponse,
  AiInsightsResponse,
  AiInsightScope,
} from "@derekentringer/shared/finance";
import api from "@/services/api";

export async function fetchAiPreferences(): Promise<AiInsightPreferencesResponse> {
  const { data } = await api.get<AiInsightPreferencesResponse>("/ai/preferences");
  return data;
}

export async function fetchAiInsights(
  scope: AiInsightScope,
): Promise<AiInsightsResponse> {
  const { data } = await api.post<AiInsightsResponse>("/ai/insights", { scope });
  return data;
}
