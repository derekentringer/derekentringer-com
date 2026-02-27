import type {
  CategoryListResponse,
  CategoryResponse,
  CreateCategoryRequest,
  UpdateCategoryRequest,
} from "@derekentringer/shared/finance";
import api from "@/services/api";

export async function fetchCategories(): Promise<CategoryListResponse> {
  const { data } = await api.get<CategoryListResponse>("/categories");
  return data;
}

export async function createCategory(
  body: CreateCategoryRequest,
): Promise<CategoryResponse> {
  const { data } = await api.post<CategoryResponse>("/categories", body);
  return data;
}

export async function updateCategory(
  id: string,
  body: UpdateCategoryRequest,
): Promise<CategoryResponse> {
  const { data } = await api.patch<CategoryResponse>(`/categories/${id}`, body);
  return data;
}

export async function deleteCategory(id: string): Promise<void> {
  await api.delete(`/categories/${id}`);
}
