import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  SetTargetAllocationsRequest,
  PerformancePeriod,
} from "@derekentringer/shared/finance";
import {
  fetchAssetAllocation,
  fetchTargetAllocations,
  setTargetAllocations,
  fetchPerformance,
  fetchRebalanceSuggestions,
} from "@/api/portfolio";

export function useAssetAllocation(accountId?: string) {
  return useQuery({
    queryKey: ["portfolio", "allocation", accountId],
    queryFn: () => fetchAssetAllocation(accountId),
  });
}

export function useTargetAllocations(accountId?: string) {
  return useQuery({
    queryKey: ["portfolio", "targets", accountId],
    queryFn: () => fetchTargetAllocations(accountId),
  });
}

export function useSetTargetAllocations() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SetTargetAllocationsRequest) =>
      setTargetAllocations(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    },
  });
}

export function usePerformance(
  period?: PerformancePeriod,
  accountId?: string,
) {
  return useQuery({
    queryKey: ["portfolio", "performance", period, accountId],
    queryFn: () => fetchPerformance(period, accountId),
  });
}

export function useRebalanceSuggestions(accountId?: string) {
  return useQuery({
    queryKey: ["portfolio", "rebalance", accountId],
    queryFn: () => fetchRebalanceSuggestions(accountId),
  });
}
