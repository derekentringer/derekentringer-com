import type {
  AssetAllocationResponse,
  TargetAllocationListResponse,
  SetTargetAllocationsRequest,
  PerformanceResponse,
  PerformancePeriod,
  RebalanceResponse,
} from "@derekentringer/shared/finance";
import api from "@/services/api";

export async function fetchAssetAllocation(
  accountId?: string,
): Promise<AssetAllocationResponse> {
  const params: Record<string, string> = {};
  if (accountId) params.accountId = accountId;
  const { data } = await api.get<AssetAllocationResponse>(
    "/portfolio/allocation",
    { params },
  );
  return data;
}

export async function fetchTargetAllocations(
  accountId?: string,
): Promise<TargetAllocationListResponse> {
  const params: Record<string, string> = {};
  if (accountId) params.accountId = accountId;
  const { data } = await api.get<TargetAllocationListResponse>(
    "/portfolio/target-allocations",
    { params },
  );
  return data;
}

export async function setTargetAllocations(
  body: SetTargetAllocationsRequest,
): Promise<TargetAllocationListResponse> {
  const { data } = await api.put<TargetAllocationListResponse>(
    "/portfolio/target-allocations",
    body,
  );
  return data;
}

export async function fetchPerformance(
  period?: PerformancePeriod,
  accountId?: string,
): Promise<PerformanceResponse> {
  const params: Record<string, string> = {};
  if (period) params.period = period;
  if (accountId) params.accountId = accountId;
  const { data } = await api.get<PerformanceResponse>(
    "/portfolio/performance",
    { params },
  );
  return data;
}

export async function fetchRebalanceSuggestions(
  accountId?: string,
): Promise<RebalanceResponse> {
  const params: Record<string, string> = {};
  if (accountId) params.accountId = accountId;
  const { data } = await api.get<RebalanceResponse>("/portfolio/rebalance", {
    params,
  });
  return data;
}
