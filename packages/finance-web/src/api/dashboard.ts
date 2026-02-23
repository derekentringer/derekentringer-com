import type {
  NetWorthResponse,
  SpendingSummary,
  DashboardUpcomingBillsResponse,
  AccountBalanceHistoryResponse,
  DailySpendingResponse,
  IncomeSpendingResponse,
  ChartTimeRange,
  ChartGranularity,
  DTIResponse,
  MortgageRatesResponse,
} from "@derekentringer/shared/finance";
import { apiFetch } from "./client.ts";

export async function fetchNetWorth(
  range?: ChartTimeRange,
  granularity?: ChartGranularity,
): Promise<NetWorthResponse> {
  const params = new URLSearchParams();
  if (range) params.set("range", range);
  if (granularity) params.set("granularity", granularity);
  const query = params.toString() ? `?${params}` : "";
  const res = await apiFetch(`/dashboard/net-worth${query}`);
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

export async function fetchDailySpending(
  startDate: string,
  endDate: string,
): Promise<DailySpendingResponse> {
  const params = new URLSearchParams({ startDate, endDate });
  const res = await apiFetch(`/dashboard/spending-daily?${params}`);
  if (!res.ok) throw new Error("Failed to fetch daily spending");
  return res.json();
}

export async function fetchIncomeSpending(
  range?: ChartTimeRange,
  granularity?: "weekly" | "monthly",
  incomeFilter?: "all" | "sources",
): Promise<IncomeSpendingResponse> {
  const params = new URLSearchParams();
  if (range) params.set("range", range);
  if (granularity) params.set("granularity", granularity);
  if (incomeFilter) params.set("incomeFilter", incomeFilter);
  const query = params.toString() ? `?${params}` : "";
  const res = await apiFetch(`/dashboard/income-spending${query}`);
  if (!res.ok) throw new Error("Failed to fetch income vs spending");
  return res.json();
}

export async function fetchAccountBalanceHistory(
  accountId: string,
  range?: ChartTimeRange,
  granularity?: ChartGranularity,
): Promise<AccountBalanceHistoryResponse> {
  const params = new URLSearchParams({ accountId });
  if (range) params.set("range", range);
  if (granularity) params.set("granularity", granularity);
  const res = await apiFetch(`/dashboard/account-history?${params}`);
  if (!res.ok) throw new Error("Failed to fetch account balance history");
  return res.json();
}

export async function fetchDTI(): Promise<DTIResponse> {
  const res = await apiFetch("/dashboard/dti");
  if (!res.ok) throw new Error("Failed to fetch DTI");
  return res.json();
}

export async function fetchMortgageRates(): Promise<MortgageRatesResponse> {
  const res = await apiFetch("/dashboard/mortgage-rates");
  if (!res.ok) throw new Error("Failed to fetch mortgage rates");
  return res.json();
}
