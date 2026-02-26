import type {
  AccountListResponse,
  AccountResponse,
  CreateAccountRequest,
  UpdateAccountRequest,
} from "@derekentringer/shared/finance";
import api from "@/services/api";

export async function fetchAccounts(params?: {
  type?: string;
  active?: boolean;
}): Promise<AccountListResponse> {
  const queryParams: Record<string, string> = {};
  if (params?.type) queryParams.type = params.type;
  if (params?.active !== undefined) queryParams.active = String(params.active);
  const { data } = await api.get<AccountListResponse>("/accounts", {
    params: queryParams,
  });
  return data;
}

export async function fetchAccount(id: string): Promise<AccountResponse> {
  const { data } = await api.get<AccountResponse>(`/accounts/${id}`);
  return data;
}

export async function createAccount(
  body: CreateAccountRequest,
): Promise<AccountResponse> {
  const { data } = await api.post<AccountResponse>("/accounts", body);
  return data;
}

export async function updateAccount(
  id: string,
  body: UpdateAccountRequest,
): Promise<AccountResponse> {
  const { data } = await api.patch<AccountResponse>(`/accounts/${id}`, body);
  return data;
}

export async function deleteAccount(
  id: string,
  pinToken: string,
): Promise<void> {
  await api.delete(`/accounts/${id}`, {
    headers: { "x-pin-token": pinToken },
  });
}

export async function reorderAccounts(
  order: Array<{ id: string; sortOrder: number }>,
): Promise<void> {
  await api.put("/accounts/reorder", { order });
}
