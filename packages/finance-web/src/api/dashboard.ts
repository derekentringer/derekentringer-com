import type {
  NetWorthResponse,
  SpendingSummary,
  DashboardUpcomingBillsResponse,
} from "@derekentringer/shared/finance";
import { apiFetch } from "./client.ts";

export async function fetchNetWorth(): Promise<NetWorthResponse> {
  const res = await apiFetch("/dashboard/net-worth");
  if (!res.ok) throw new Error("Failed to fetch net worth");
  return res.json();
}

export async function fetchSpendingSummary(
  month?: string,
): Promise<SpendingSummary> {
  const query = month ? `?month=${month}` : "";
  const res = await apiFetch(`/dashboard/spending${query}`);
  if (!res.ok) throw new Error("Failed to fetch spending summary");
  return res.json();
}

export async function fetchUpcomingBills(
  days?: number,
): Promise<DashboardUpcomingBillsResponse> {
  const query = days ? `?days=${days}` : "";
  const res = await apiFetch(`/dashboard/upcoming-bills${query}`);
  if (!res.ok) throw new Error("Failed to fetch upcoming bills");
  return res.json();
}
