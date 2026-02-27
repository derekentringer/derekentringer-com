import { useQuery } from "@tanstack/react-query";
import type { AiInsightScope } from "@derekentringer/shared/finance";
import { fetchAiInsights } from "@/api/ai";

export function useAiDigest(
  scope: AiInsightScope,
  options?: { month?: string; quarter?: string },
  enabled = true,
) {
  return useQuery({
    queryKey: ["ai", "digest", scope, options?.month ?? options?.quarter],
    queryFn: () => fetchAiInsights(scope, options),
    enabled,
  });
}
