import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { UpdateTransactionRequest } from "@derekentringer/shared/finance";
import {
  fetchTransactions,
  fetchTransaction,
  updateTransaction,
  deleteTransaction,
  bulkUpdateCategory,
} from "@/api/transactions";
import { fetchCategories } from "@/api/categories";

const PAGE_SIZE = 50;

interface TransactionFilters {
  accountId?: string;
  startDate?: string;
  endDate?: string;
  category?: string;
  search?: string;
}

export function useTransactions(filters: TransactionFilters) {
  return useInfiniteQuery({
    queryKey: ["transactions", filters],
    queryFn: ({ pageParam = 0 }) =>
      fetchTransactions({ ...filters, limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce(
        (sum, p) => sum + p.transactions.length,
        0,
      );
      return loaded < lastPage.total ? loaded : undefined;
    },
  });
}

export function useTransaction(id: string) {
  return useQuery({
    queryKey: ["transactions", id],
    queryFn: () => fetchTransaction(id),
    enabled: !!id,
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateTransactionRequest;
    }) => updateTransaction(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({
        queryKey: ["transactions", variables.id],
      });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pinToken }: { id: string; pinToken: string }) =>
      deleteTransaction(id, pinToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useBulkUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      ids,
      category,
    }: {
      ids: string[];
      category: string | null;
    }) => bulkUpdateCategory(ids, category),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    staleTime: 10 * 60 * 1000,
  });
}
