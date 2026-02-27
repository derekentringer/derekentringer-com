import { useMutation, useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { UpdateAiInsightPreferencesRequest, AiInsightArchiveResponse } from "@derekentringer/shared/finance";
import {
  updateAiPreferences,
  clearAiCache,
  markInsightsRead,
  markInsightsDismissed,
  fetchUnseenInsightCounts,
  fetchInsightArchive,
} from "@/api/ai";

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

export function useMarkInsightsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (insightIds: string[]) => markInsightsRead(insightIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai", "unseen-counts"] });
    },
  });
}

export function useMarkInsightsDismissed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (insightIds: string[]) => markInsightsDismissed(insightIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai", "unseen-counts"] });
    },
  });
}

export function useUnseenInsightCounts() {
  return useQuery({
    queryKey: ["ai", "unseen-counts"],
    queryFn: fetchUnseenInsightCounts,
  });
}

const ARCHIVE_PAGE_SIZE = 20;

export function useInsightArchive() {
  return useInfiniteQuery<AiInsightArchiveResponse>({
    queryKey: ["ai", "archive"],
    queryFn: ({ pageParam }) =>
      fetchInsightArchive(ARCHIVE_PAGE_SIZE, pageParam as number),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.insights.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });
}
