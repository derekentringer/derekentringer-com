import type {
  CreateBudgetRequest,
  UpdateBudgetRequest,
  BudgetListResponse,
  BudgetResponse,
  MonthlyBudgetSummaryResponse,
} from "@derekentringer/shared/finance";
import { apiFetch } from "./client.ts";

export async function fetchBudgets(): Promise<BudgetListResponse> {
  const res = await apiFetch("/budgets");
  if (!res.ok) throw new Error("Failed to fetch budgets");
  return res.json();
}

export async function fetchBudgetSummary(
  month?: string,
): Promise<MonthlyBudgetSummaryResponse> {
  const query = month ? `?month=${month}` : "";
  const res = await apiFetch(`/budgets/summary${query}`);
  if (!res.ok) throw new Error("Failed to fetch budget summary");
  return res.json();
}

export async function createBudget(
  data: CreateBudgetRequest,
): Promise<BudgetResponse> {
  const res = await apiFetch("/budgets", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Failed to create budget");
  }
  return res.json();
}

export async function updateBudget(
  id: string,
  data: UpdateBudgetRequest,
): Promise<BudgetResponse> {
  const res = await apiFetch(`/budgets/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Failed to update budget");
  }
  return res.json();
}

export async function deleteBudget(id: string): Promise<void> {
  const res = await apiFetch(`/budgets/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete budget");
}
