import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CreateIncomeSourceRequest,
  UpdateIncomeSourceRequest,
} from "@derekentringer/shared/finance";
import {
  fetchIncomeSources,
  fetchDetectedIncome,
  createIncomeSource,
  updateIncomeSource,
  deleteIncomeSource,
} from "@/api/incomeSources";

export function useIncomeSources(active?: boolean) {
  return useQuery({
    queryKey: ["incomeSources", { active }],
    queryFn: () => fetchIncomeSources(active),
  });
}

export function useDetectedIncome() {
  return useQuery({
    queryKey: ["incomeSources", "detected"],
    queryFn: fetchDetectedIncome,
  });
}

export function useCreateIncomeSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateIncomeSourceRequest) => createIncomeSource(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incomeSources"] });
      queryClient.invalidateQueries({ queryKey: ["projections"] });
    },
  });
}

export function useUpdateIncomeSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateIncomeSourceRequest }) =>
      updateIncomeSource(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incomeSources"] });
      queryClient.invalidateQueries({ queryKey: ["projections"] });
    },
  });
}

export function useDeleteIncomeSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => deleteIncomeSource(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incomeSources"] });
      queryClient.invalidateQueries({ queryKey: ["projections"] });
    },
  });
}
