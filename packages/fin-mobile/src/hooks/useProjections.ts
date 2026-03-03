import { useQuery } from "@tanstack/react-query";
import {
  fetchNetIncomeProjection,
  fetchAccountProjections,
  fetchSavingsAccounts,
  fetchSavingsProjection,
  fetchDebtAccounts,
  fetchDebtPayoff,
} from "@/api/projections";

export function useNetIncomeProjection(months: number) {
  return useQuery({
    queryKey: ["projections", "net-income", months],
    queryFn: () => fetchNetIncomeProjection({ months }),
  });
}

export function useAccountProjections(months: number) {
  return useQuery({
    queryKey: ["projections", "account-balances", months],
    queryFn: () => fetchAccountProjections({ months }),
  });
}

export function useSavingsAccounts() {
  return useQuery({
    queryKey: ["projections", "savings-accounts"],
    queryFn: fetchSavingsAccounts,
  });
}

export function useSavingsProjection(
  accountId: string,
  params: { months?: number; contribution?: number; apy?: number },
) {
  return useQuery({
    queryKey: [
      "projections",
      "savings",
      accountId,
      params.months,
      params.contribution,
      params.apy,
    ],
    queryFn: () => fetchSavingsProjection(accountId, params),
    enabled: !!accountId,
  });
}

export function useDebtAccounts(includeMortgages: boolean) {
  return useQuery({
    queryKey: ["projections", "debt-accounts", includeMortgages],
    queryFn: () => fetchDebtAccounts({ includeMortgages }),
  });
}

export function useDebtPayoff(params: {
  extraPayment?: number;
  includeMortgages?: boolean;
  accountIds?: string[];
  maxMonths?: number;
}) {
  return useQuery({
    queryKey: [
      "projections",
      "debt-payoff",
      params.extraPayment,
      params.includeMortgages,
      params.accountIds,
      params.maxMonths,
    ],
    queryFn: () => fetchDebtPayoff(params),
  });
}
