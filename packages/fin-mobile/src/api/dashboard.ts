import type {
  NetWorthResponse,
  SpendingSummary,
  DashboardUpcomingBillsResponse,
  DailySpendingResponse,
  IncomeSpendingResponse,
  AccountBalanceHistoryResponse,
  ChartTimeRange,
  ChartGranularity,
  DTIResponse,
} from "@derekentringer/shared/finance";
import api from "@/services/api";

export async function fetchNetWorth(
  range?: ChartTimeRange,
  granularity?: ChartGranularity,
): Promise<NetWorthResponse> {
  const params: Record<string, string> = {};
  if (range) params.range = range;
  if (granularity) params.granularity = granularity;
  const { data } = await api.get<NetWorthResponse>("/dashboard/net-worth", { params });
  return data;
}

export async function fetchSpendingSummary(
  month?: string,
): Promise<SpendingSummary> {
  const params: Record<string, string> = {};
  if (month) params.month = month;
  const { data } = await api.get<SpendingSummary>("/dashboard/spending", { params });
  return data;
}

export async function fetchUpcomingBills(
  days?: number,
): Promise<DashboardUpcomingBillsResponse> {
  const params: Record<string, string> = {};
  if (days) params.days = String(days);
  const { data } = await api.get<DashboardUpcomingBillsResponse>("/dashboard/upcoming-bills", { params });
  return data;
}

export async function fetchDailySpending(
  startDate: string,
  endDate: string,
): Promise<DailySpendingResponse> {
  const { data } = await api.get<DailySpendingResponse>("/dashboard/spending-daily", {
    params: { startDate, endDate },
  });
  return data;
}

export async function fetchIncomeSpending(
  range?: ChartTimeRange,
  granularity?: "daily" | "weekly" | "monthly",
  incomeFilter?: "all" | "sources",
): Promise<IncomeSpendingResponse> {
  const params: Record<string, string> = {};
  if (range) params.range = range;
  if (granularity) params.granularity = granularity;
  if (incomeFilter) params.incomeFilter = incomeFilter;
  const { data } = await api.get<IncomeSpendingResponse>("/dashboard/income-spending", { params });
  return data;
}

export async function fetchAccountBalanceHistory(
  accountId: string,
  range?: ChartTimeRange,
  granularity?: ChartGranularity,
): Promise<AccountBalanceHistoryResponse> {
  const params: Record<string, string> = { accountId };
  if (range) params.range = range;
  if (granularity) params.granularity = granularity;
  const { data } = await api.get<AccountBalanceHistoryResponse>("/dashboard/account-history", { params });
  return data;
}

export async function fetchDTI(): Promise<DTIResponse> {
  const { data } = await api.get<DTIResponse>("/dashboard/dti");
  return data;
}
