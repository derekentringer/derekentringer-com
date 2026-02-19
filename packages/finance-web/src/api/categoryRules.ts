import type {
  CreateCategoryRuleRequest,
  UpdateCategoryRuleRequest,
  CategoryRuleListResponse,
  CategoryRuleResponse,
} from "@derekentringer/shared/finance";
import { apiFetch } from "./client.ts";

export async function fetchCategoryRules(): Promise<CategoryRuleListResponse> {
  const res = await apiFetch("/category-rules");
  if (!res.ok) throw new Error("Failed to fetch category rules");
  return res.json();
}

export async function createCategoryRule(
  data: CreateCategoryRuleRequest,
  options?: { apply?: boolean },
): Promise<CategoryRuleResponse> {
  const qs = options?.apply ? "?apply=true" : "";
  const res = await apiFetch(`/category-rules${qs}`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Failed to create category rule");
  }
  return res.json();
}

export async function updateCategoryRule(
  id: string,
  data: UpdateCategoryRuleRequest,
  options?: { apply?: boolean },
): Promise<CategoryRuleResponse> {
  const qs = options?.apply ? "?apply=true" : "";
  const res = await apiFetch(`/category-rules/${id}${qs}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Failed to update category rule");
  }
  return res.json();
}

export async function deleteCategoryRule(id: string): Promise<void> {
  const res = await apiFetch(`/category-rules/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete category rule");
}
