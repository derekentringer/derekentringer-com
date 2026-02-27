import type {
  AiInsightPreferencesResponse,
  UpdateAiInsightPreferencesRequest,
  AiInsightsResponse,
  AiInsightScope,
  AiInsightUnseenCountResponse,
  AiInsightArchiveResponse,
} from "@derekentringer/shared/finance";
import { apiFetch } from "./client.ts";

export async function fetchAiPreferences(): Promise<AiInsightPreferencesResponse> {
  const res = await apiFetch("/ai/preferences");
  if (!res.ok) throw new Error("Failed to fetch AI preferences");
  return res.json();
}

export async function updateAiPreferences(
  data: UpdateAiInsightPreferencesRequest,
): Promise<AiInsightPreferencesResponse> {
  const res = await apiFetch("/ai/preferences", {
    method: "PUT",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Failed to update AI preferences");
  }
  return res.json();
}

export async function fetchAiInsights(
  scope: AiInsightScope,
  options?: { month?: string; quarter?: string },
): Promise<AiInsightsResponse> {
  const res = await apiFetch("/ai/insights", {
    method: "POST",
    body: JSON.stringify({ scope, ...options }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Failed to fetch AI insights");
  }
  return res.json();
}

export async function clearAiCache(
  scope?: string,
): Promise<{ cleared: number }> {
  const url = scope ? `/ai/cache?scope=${scope}` : "/ai/cache";
  const res = await apiFetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to clear AI cache");
  return res.json();
}

export async function markInsightsRead(insightIds: string[]): Promise<void> {
  const res = await apiFetch("/ai/insights/mark-read", {
    method: "POST",
    body: JSON.stringify({ insightIds }),
  });
  if (!res.ok) throw new Error("Failed to mark insights as read");
}

export async function markInsightsDismissed(insightIds: string[]): Promise<void> {
  const res = await apiFetch("/ai/insights/mark-dismissed", {
    method: "POST",
    body: JSON.stringify({ insightIds }),
  });
  if (!res.ok) throw new Error("Failed to mark insights as dismissed");
}

export async function fetchUnseenInsightCounts(): Promise<AiInsightUnseenCountResponse> {
  const res = await apiFetch("/ai/insights/unseen-count");
  if (!res.ok) throw new Error("Failed to fetch unseen counts");
  return res.json();
}

export async function fetchInsightArchive(
  limit = 20,
  offset = 0,
): Promise<AiInsightArchiveResponse> {
  const res = await apiFetch(`/ai/insights/archive?limit=${limit}&offset=${offset}`);
  if (!res.ok) throw new Error("Failed to fetch insight archive");
  return res.json();
}
