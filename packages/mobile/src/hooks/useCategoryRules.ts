import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CreateCategoryRuleRequest,
  UpdateCategoryRuleRequest,
} from "@derekentringer/shared/finance";
import {
  fetchCategoryRules,
  createCategoryRule,
  updateCategoryRule,
  deleteCategoryRule,
} from "@/api/categoryRules";

export function useCategoryRules() {
  return useQuery({
    queryKey: ["categoryRules"],
    queryFn: fetchCategoryRules,
  });
}

export function useCreateCategoryRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ data, apply }: { data: CreateCategoryRuleRequest; apply?: boolean }) =>
      createCategoryRule(data, { apply }),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["categoryRules"] });
      if (variables.apply) {
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
      }
    },
  });
}

export function useUpdateCategoryRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data, apply }: { id: string; data: UpdateCategoryRuleRequest; apply?: boolean }) =>
      updateCategoryRule(id, data, { apply }),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["categoryRules"] });
      if (variables.apply) {
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
      }
    },
  });
}

export function useDeleteCategoryRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => deleteCategoryRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categoryRules"] });
    },
  });
}
