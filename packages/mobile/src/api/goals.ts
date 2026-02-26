import type {
  GoalProgressResponse,
  GoalListResponse,
  GoalResponse,
  CreateGoalRequest,
  UpdateGoalRequest,
  ReorderGoalsRequest,
} from "@derekentringer/shared/finance";
import api from "@/services/api";

export async function fetchGoalProgress(
  months?: number,
): Promise<GoalProgressResponse> {
  const params: Record<string, string> = {};
  if (months) params.months = String(months);
  const { data } = await api.get<GoalProgressResponse>("/goals/progress", { params });
  return data;
}

export async function fetchGoals(
  active?: boolean,
): Promise<GoalListResponse> {
  const params: Record<string, string> = {};
  if (active !== undefined) params.active = String(active);
  const { data } = await api.get<GoalListResponse>("/goals", { params });
  return data;
}

export async function fetchGoal(id: string): Promise<GoalResponse> {
  const { data } = await api.get<GoalResponse>(`/goals/${id}`);
  return data;
}

export async function createGoal(
  body: CreateGoalRequest,
): Promise<GoalResponse> {
  const { data } = await api.post<GoalResponse>("/goals", body);
  return data;
}

export async function updateGoal(
  id: string,
  body: UpdateGoalRequest,
): Promise<GoalResponse> {
  const { data } = await api.patch<GoalResponse>(`/goals/${id}`, body);
  return data;
}

export async function deleteGoal(id: string): Promise<void> {
  await api.delete(`/goals/${id}`);
}

export async function reorderGoals(
  body: ReorderGoalsRequest,
): Promise<void> {
  await api.put("/goals/reorder", body);
}
