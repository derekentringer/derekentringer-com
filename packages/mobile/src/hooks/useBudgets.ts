import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CreateBudgetRequest,
  UpdateBudgetRequest,
} from "@derekentringer/shared/finance";
import {
  fetchBudgets,
  fetchBudgetSummary,
  createBudget,
  updateBudget,
  deleteBudget,
} from "@/api/budgets";

export function useBudgets() {
  return useQuery({
    queryKey: ["budgets"],
    queryFn: fetchBudgets,
  });
}

export function useBudgetSummary(month?: string) {
  return useQuery({
    queryKey: ["budgets", "summary", month],
    queryFn: () => fetchBudgetSummary(month),
    enabled: !!month,
  });
}

export function useCreateBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBudgetRequest) => createBudget(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBudgetRequest }) =>
      updateBudget(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pinToken }: { id: string; pinToken: string }) =>
      deleteBudget(id, pinToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
