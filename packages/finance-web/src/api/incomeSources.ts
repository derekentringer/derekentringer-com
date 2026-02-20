import type {
  CreateIncomeSourceRequest,
  UpdateIncomeSourceRequest,
  IncomeSourceListResponse,
  IncomeSourceResponse,
  DetectedIncomePatternsResponse,
} from "@derekentringer/shared/finance";
import { apiFetch } from "./client.ts";

export async function fetchDetectedIncome(): Promise<DetectedIncomePatternsResponse> {
  const res = await apiFetch("/income-sources/detected");
  if (!res.ok) throw new Error("Failed to fetch detected income");
  return res.json();
}

export async function fetchIncomeSources(
  active?: boolean,
): Promise<IncomeSourceListResponse> {
  const query = active !== undefined ? `?active=${active}` : "";
  const res = await apiFetch(`/income-sources${query}`);
  if (!res.ok) throw new Error("Failed to fetch income sources");
  return res.json();
}

export async function createIncomeSource(
  data: CreateIncomeSourceRequest,
): Promise<IncomeSourceResponse> {
  const res = await apiFetch("/income-sources", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Failed to create income source");
  }
  return res.json();
}

export async function updateIncomeSource(
  id: string,
  data: UpdateIncomeSourceRequest,
): Promise<IncomeSourceResponse> {
  const res = await apiFetch(`/income-sources/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Failed to update income source");
  }
  return res.json();
}

export async function deleteIncomeSource(id: string): Promise<void> {
  const res = await apiFetch(`/income-sources/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete income source");
}
