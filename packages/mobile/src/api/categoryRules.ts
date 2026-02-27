import type {
  CategoryRuleListResponse,
  CategoryRuleResponse,
  CreateCategoryRuleRequest,
  UpdateCategoryRuleRequest,
} from "@derekentringer/shared/finance";
import api from "@/services/api";

export async function fetchCategoryRules(): Promise<CategoryRuleListResponse> {
  const { data } = await api.get<CategoryRuleListResponse>("/category-rules");
  return data;
}

export async function createCategoryRule(
  body: CreateCategoryRuleRequest,
  options?: { apply?: boolean },
): Promise<CategoryRuleResponse> {
  const params: Record<string, string> = {};
  if (options?.apply) params.apply = "true";
  const { data } = await api.post<CategoryRuleResponse>("/category-rules", body, { params });
  return data;
}

export async function updateCategoryRule(
  id: string,
  body: UpdateCategoryRuleRequest,
  options?: { apply?: boolean },
): Promise<CategoryRuleResponse> {
  const params: Record<string, string> = {};
  if (options?.apply) params.apply = "true";
  const { data } = await api.patch<CategoryRuleResponse>(`/category-rules/${id}`, body, { params });
  return data;
}

export async function deleteCategoryRule(id: string): Promise<void> {
  await api.delete(`/category-rules/${id}`);
}
