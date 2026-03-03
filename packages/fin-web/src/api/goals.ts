import type {
  CreateGoalRequest,
  UpdateGoalRequest,
  GoalListResponse,
  GoalResponse,
  GoalProgressResponse,
  ReorderGoalsRequest,
} from "@derekentringer/shared/finance";
import { apiFetch } from "./client.ts";

export async function fetchGoals(
  active?: boolean,
): Promise<GoalListResponse> {
  const query = active !== undefined ? `?active=${active}` : "";
  const res = await apiFetch(`/goals${query}`);
  if (!res.ok) throw new Error("Failed to fetch goals");
  return res.json();
}

export async function fetchGoal(id: string): Promise<GoalResponse> {
  const res = await apiFetch(`/goals/${id}`);
  if (!res.ok) throw new Error("Failed to fetch goal");
  return res.json();
}

export async function createGoal(
  data: CreateGoalRequest,
): Promise<GoalResponse> {
  const res = await apiFetch("/goals", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Failed to create goal");
  }
  return res.json();
}

export async function updateGoal(
  id: string,
  data: UpdateGoalRequest,
): Promise<GoalResponse> {
  const res = await apiFetch(`/goals/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Failed to update goal");
  }
  return res.json();
}

export async function deleteGoal(id: string): Promise<void> {
  const res = await apiFetch(`/goals/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete goal");
}

export async function reorderGoals(
  data: ReorderGoalsRequest,
): Promise<void> {
  const res = await apiFetch("/goals/reorder", {
    method: "PUT",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to reorder goals");
}

export async function fetchGoalProgress(
  params?: { months?: number },
  signal?: AbortSignal,
): Promise<GoalProgressResponse> {
  const query = params?.months ? `?months=${params.months}` : "";
  const res = await apiFetch(`/goals/progress${query}`, { signal });
  if (!res.ok) throw new Error("Failed to fetch goal progress");
  return res.json();
}
