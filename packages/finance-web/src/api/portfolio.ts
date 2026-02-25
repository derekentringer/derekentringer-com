import type {
  AssetAllocationResponse,
  TargetAllocationListResponse,
  SetTargetAllocationsRequest,
  PerformancePeriod,
  PerformanceResponse,
  RebalanceResponse,
} from "@derekentringer/shared/finance";
import { apiFetch } from "./client.ts";

export async function fetchAssetAllocation(
  accountId?: string,
): Promise<AssetAllocationResponse> {
  const query = accountId ? `?accountId=${accountId}` : "";
  const res = await apiFetch(`/portfolio/allocation${query}`);
  if (!res.ok) throw new Error("Failed to fetch asset allocation");
  return res.json();
}

export async function fetchTargetAllocations(
  accountId?: string | null,
): Promise<TargetAllocationListResponse> {
  const query = accountId ? `?accountId=${accountId}` : "";
  const res = await apiFetch(`/portfolio/target-allocations${query}`);
  if (!res.ok) throw new Error("Failed to fetch target allocations");
  return res.json();
}

export async function setTargetAllocations(
  data: SetTargetAllocationsRequest,
): Promise<TargetAllocationListResponse> {
  const res = await apiFetch("/portfolio/target-allocations", {
    method: "PUT",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Failed to set target allocations");
  }
  return res.json();
}

export async function fetchPerformance(
  period?: PerformancePeriod,
  accountId?: string,
): Promise<PerformanceResponse> {
  const params = new URLSearchParams();
  if (period) params.set("period", period);
  if (accountId) params.set("accountId", accountId);
  const query = params.toString() ? `?${params}` : "";
  const res = await apiFetch(`/portfolio/performance${query}`);
  if (!res.ok) throw new Error("Failed to fetch performance");
  return res.json();
}

export async function fetchRebalanceSuggestions(
  accountId?: string,
): Promise<RebalanceResponse> {
  const query = accountId ? `?accountId=${accountId}` : "";
  const res = await apiFetch(`/portfolio/rebalance${query}`);
  if (!res.ok) throw new Error("Failed to fetch rebalance suggestions");
  return res.json();
}
