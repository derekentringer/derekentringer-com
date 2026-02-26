import type { CategoryListResponse } from "@derekentringer/shared/finance";
import api from "@/services/api";

export async function fetchCategories(): Promise<CategoryListResponse> {
  const { data } = await api.get<CategoryListResponse>("/categories");
  return data;
}
