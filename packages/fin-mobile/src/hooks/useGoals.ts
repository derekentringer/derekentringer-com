import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CreateGoalRequest,
  UpdateGoalRequest,
  ReorderGoalsRequest,
} from "@derekentringer/shared/finance";
import {
  fetchGoals,
  fetchGoal,
  createGoal,
  updateGoal,
  deleteGoal,
  reorderGoals,
} from "@/api/goals";

export function useGoals(active?: boolean) {
  return useQuery({
    queryKey: ["goals", { active }],
    queryFn: () => fetchGoals(active),
  });
}

export function useGoal(id: string) {
  return useQuery({
    queryKey: ["goals", id],
    queryFn: () => fetchGoal(id),
    enabled: !!id,
  });
}

export function useCreateGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateGoalRequest) => createGoal(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateGoalRequest }) =>
      updateGoal(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      queryClient.invalidateQueries({ queryKey: ["goals", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => deleteGoal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useReorderGoals() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ReorderGoalsRequest) => reorderGoals(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
    },
  });
}
