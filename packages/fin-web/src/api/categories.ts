import type {
  CreateCategoryRequest,
  UpdateCategoryRequest,
  CategoryListResponse,
  CategoryResponse,
} from "@derekentringer/shared/finance";
import { apiFetch } from "./client.ts";

export async function fetchCategories(): Promise<CategoryListResponse> {
  const res = await apiFetch("/categories");
  if (!res.ok) throw new Error("Failed to fetch categories");
  return res.json();
}

export async function createCategory(
  data: CreateCategoryRequest,
): Promise<CategoryResponse> {
  const res = await apiFetch("/categories", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Failed to create category");
  }
  return res.json();
}

export async function updateCategory(
  id: string,
  data: UpdateCategoryRequest,
): Promise<CategoryResponse> {
  const res = await apiFetch(`/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Failed to update category");
  }
  return res.json();
}

export async function deleteCategory(id: string): Promise<void> {
  const res = await apiFetch(`/categories/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Failed to delete category");
  }
}
