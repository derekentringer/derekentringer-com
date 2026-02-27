import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UpdateAiInsightPreferencesRequest } from "@derekentringer/shared/finance";
import { updateAiPreferences, clearAiCache } from "@/api/ai";

export function useUpdateAiPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateAiInsightPreferencesRequest) => updateAiPreferences(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai", "preferences"] });
    },
  });
}

export function useClearAiCache() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scope?: string) => clearAiCache(scope),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai"] });
    },
  });
}
