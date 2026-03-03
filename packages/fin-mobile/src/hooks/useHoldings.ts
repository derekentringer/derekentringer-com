import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CreateHoldingRequest,
  UpdateHoldingRequest,
  ReorderHoldingsRequest,
  Holding,
  HoldingListResponse,
} from "@derekentringer/shared/finance";
import { AccountType } from "@derekentringer/shared/finance";
import {
  fetchHoldings,
  fetchHolding,
  createHolding,
  updateHolding,
  deleteHolding,
  reorderHoldings,
  fetchQuote,
} from "@/api/holdings";
import { useAccounts } from "@/hooks/useAccounts";

export function useHoldings(accountId?: string) {
  const { data: accountsData } = useAccounts();

  // When accountId is provided, fetch for that single account
  const singleQuery = useQuery({
    queryKey: ["holdings", accountId],
    queryFn: () => fetchHoldings(accountId!),
    enabled: !!accountId,
  });

  // When accountId is undefined ("All Accounts"), fetch for each investment account
  const investmentAccountIds = accountId
    ? []
    : (accountsData?.accounts ?? [])
        .filter((a) => a.type === AccountType.Investment)
        .map((a) => a.id);

  const multiQueries = useQueries({
    queries: investmentAccountIds.map((id) => ({
      queryKey: ["holdings", id],
      queryFn: () => fetchHoldings(id),
    })),
  });

  if (accountId) {
    return singleQuery;
  }

  // Merge results from all investment accounts
  const isLoading =
    investmentAccountIds.length === 0
      ? !accountsData
      : multiQueries.some((q) => q.isLoading);
  const error = multiQueries.find((q) => q.error)?.error ?? null;
  const allHoldings: Holding[] = [];
  for (const q of multiQueries) {
    if (q.data?.holdings) {
      allHoldings.push(...q.data.holdings);
    }
  }

  return {
    data: allHoldings.length > 0 || !isLoading ? { holdings: allHoldings } as HoldingListResponse : undefined,
    isLoading,
    error,
    refetch: async () => {
      await Promise.all(multiQueries.map((q) => q.refetch()));
      return {} as any;
    },
  } as ReturnType<typeof useQuery<HoldingListResponse>>;
}

export function useHolding(id: string) {
  return useQuery({
    queryKey: ["holdings", "detail", id],
    queryFn: () => fetchHolding(id),
    enabled: !!id,
  });
}

export function useCreateHolding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateHoldingRequest) => createHolding(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateHolding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateHoldingRequest }) =>
      updateHolding(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteHolding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => deleteHolding(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useReorderHoldings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ReorderHoldingsRequest) => reorderHoldings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
    },
  });
}

export function useQuote(ticker: string) {
  return useQuery({
    queryKey: ["quote", ticker],
    queryFn: () => fetchQuote(ticker),
    enabled: !!ticker,
    staleTime: 60_000,
  });
}
