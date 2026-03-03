import type {
  BudgetListResponse,
  BudgetResponse,
  MonthlyBudgetSummaryResponse,
  CreateBudgetRequest,
  UpdateBudgetRequest,
} from "@derekentringer/shared/finance";
import api from "@/services/api";

export async function fetchBudgets(): Promise<BudgetListResponse> {
  const { data } = await api.get<BudgetListResponse>("/budgets");
  return data;
}

export async function fetchBudgetSummary(
  month?: string,
): Promise<MonthlyBudgetSummaryResponse> {
  const params: Record<string, string> = {};
  if (month) params.month = month;
  const { data } = await api.get<MonthlyBudgetSummaryResponse>(
    "/budgets/summary",
    { params },
  );
  return data;
}

export async function createBudget(
  body: CreateBudgetRequest,
): Promise<BudgetResponse> {
  const { data } = await api.post<BudgetResponse>("/budgets", body);
  return data;
}

export async function updateBudget(
  id: string,
  body: UpdateBudgetRequest,
): Promise<BudgetResponse> {
  const { data } = await api.patch<BudgetResponse>(`/budgets/${id}`, body);
  return data;
}

export async function deleteBudget(
  id: string,
  pinToken: string,
): Promise<void> {
  await api.delete(`/budgets/${id}`, {
    headers: { "x-pin-token": pinToken },
  });
}
