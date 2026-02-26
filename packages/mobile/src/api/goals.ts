import type { GoalProgressResponse } from "@derekentringer/shared/finance";
import api from "@/services/api";

export async function fetchGoalProgress(
  months?: number,
): Promise<GoalProgressResponse> {
  const params: Record<string, string> = {};
  if (months) params.months = String(months);
  const { data } = await api.get<GoalProgressResponse>("/goals/progress", { params });
  return data;
}
