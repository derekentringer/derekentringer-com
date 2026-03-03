import type {
  IncomeSourceListResponse,
  IncomeSourceResponse,
  CreateIncomeSourceRequest,
  UpdateIncomeSourceRequest,
  DetectedIncomePatternsResponse,
} from "@derekentringer/shared/finance";
import api from "@/services/api";

export async function fetchIncomeSources(
  active?: boolean,
): Promise<IncomeSourceListResponse> {
  const params: Record<string, string> = {};
  if (active !== undefined) params.active = String(active);
  const { data } = await api.get<IncomeSourceListResponse>("/income-sources", { params });
  return data;
}

export async function fetchDetectedIncome(): Promise<DetectedIncomePatternsResponse> {
  const { data } = await api.get<DetectedIncomePatternsResponse>("/income-sources/detected");
  return data;
}

export async function createIncomeSource(
  body: CreateIncomeSourceRequest,
): Promise<IncomeSourceResponse> {
  const { data } = await api.post<IncomeSourceResponse>("/income-sources", body);
  return data;
}

export async function updateIncomeSource(
  id: string,
  body: UpdateIncomeSourceRequest,
): Promise<IncomeSourceResponse> {
  const { data } = await api.patch<IncomeSourceResponse>(`/income-sources/${id}`, body);
  return data;
}

export async function deleteIncomeSource(id: string): Promise<void> {
  await api.delete(`/income-sources/${id}`);
}
