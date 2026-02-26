import { useQuery } from "@tanstack/react-query";
import type { ChartTimeRange, ChartGranularity } from "@derekentringer/shared/finance";
import {
  fetchNetWorth,
  fetchSpendingSummary,
  fetchUpcomingBills,
  fetchDailySpending,
  fetchIncomeSpending,
  fetchAccountBalanceHistory,
  fetchDTI,
} from "@/api/dashboard";
import { fetchGoalProgress } from "@/api/goals";
import { fetchAiPreferences, fetchAiInsights } from "@/api/ai";
import type { AiInsightScope } from "@derekentringer/shared/finance";

export function useNetWorth(range: ChartTimeRange, granularity: ChartGranularity) {
  return useQuery({
    queryKey: ["dashboard", "net-worth", range, granularity],
    queryFn: () => fetchNetWorth(range, granularity),
  });
}

export function useSpendingSummary(month?: string) {
  return useQuery({
    queryKey: ["dashboard", "spending", month],
    queryFn: () => fetchSpendingSummary(month),
  });
}

export function useUpcomingBills(days?: number) {
  return useQuery({
    queryKey: ["dashboard", "upcoming-bills", days],
    queryFn: () => fetchUpcomingBills(days),
  });
}

export function useDailySpending(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["dashboard", "spending-daily", startDate, endDate],
    queryFn: () => fetchDailySpending(startDate, endDate),
    enabled: !!startDate && !!endDate,
  });
}

export function useIncomeSpending(
  range: ChartTimeRange,
  granularity: "daily" | "weekly" | "monthly",
  incomeFilter: "all" | "sources",
) {
  return useQuery({
    queryKey: ["dashboard", "income-spending", range, granularity, incomeFilter],
    queryFn: () => fetchIncomeSpending(range, granularity, incomeFilter),
  });
}

export function useAccountBalanceHistory(
  accountId: string,
  range: ChartTimeRange,
  granularity: ChartGranularity,
  enabled = true,
) {
  return useQuery({
    queryKey: ["dashboard", "account-history", accountId, range, granularity],
    queryFn: () => fetchAccountBalanceHistory(accountId, range, granularity),
    enabled: enabled && !!accountId,
  });
}

export function useDTI() {
  return useQuery({
    queryKey: ["dashboard", "dti"],
    queryFn: fetchDTI,
  });
}

export function useGoalProgress(months?: number) {
  return useQuery({
    queryKey: ["goals", "progress", months],
    queryFn: () => fetchGoalProgress(months),
  });
}

export function useAiPreferences() {
  return useQuery({
    queryKey: ["ai", "preferences"],
    queryFn: fetchAiPreferences,
  });
}

export function useAiInsights(scope: AiInsightScope, enabled = true) {
  return useQuery({
    queryKey: ["ai", "insights", scope],
    queryFn: () => fetchAiInsights(scope),
    enabled,
  });
}
