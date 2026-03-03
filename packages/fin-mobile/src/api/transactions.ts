import type {
  TransactionListResponse,
  TransactionResponse,
  UpdateTransactionRequest,
  BulkUpdateCategoryResponse,
} from "@derekentringer/shared/finance";
import api from "@/services/api";

export async function fetchTransactions(params?: {
  accountId?: string;
  startDate?: string;
  endDate?: string;
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<TransactionListResponse> {
  const queryParams: Record<string, string> = {};
  if (params?.accountId) queryParams.accountId = params.accountId;
  if (params?.startDate) queryParams.startDate = params.startDate;
  if (params?.endDate) queryParams.endDate = params.endDate;
  if (params?.category) queryParams.category = params.category;
  if (params?.search) queryParams.search = params.search;
  if (params?.limit !== undefined) queryParams.limit = String(params.limit);
  if (params?.offset !== undefined) queryParams.offset = String(params.offset);
  const { data } = await api.get<TransactionListResponse>("/transactions", {
    params: queryParams,
  });
  return data;
}

export async function fetchTransaction(
  id: string,
): Promise<TransactionResponse> {
  const { data } = await api.get<TransactionResponse>(`/transactions/${id}`);
  return data;
}

export async function updateTransaction(
  id: string,
  body: UpdateTransactionRequest,
): Promise<TransactionResponse> {
  const { data } = await api.patch<TransactionResponse>(
    `/transactions/${id}`,
    body,
  );
  return data;
}

export async function deleteTransaction(
  id: string,
  pinToken: string,
): Promise<void> {
  await api.delete(`/transactions/${id}`, {
    headers: { "x-pin-token": pinToken },
  });
}

export async function bulkUpdateCategory(
  ids: string[],
  category: string | null,
): Promise<BulkUpdateCategoryResponse> {
  const { data } = await api.patch<BulkUpdateCategoryResponse>(
    "/transactions/bulk-category",
    { ids, category },
  );
  return data;
}
