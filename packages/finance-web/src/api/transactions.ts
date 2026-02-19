import type {
  TransactionListResponse,
  TransactionResponse,
  UpdateTransactionRequest,
  CsvImportPreviewResponse,
  CsvImportConfirmRequest,
  CsvImportConfirmResponse,
} from "@derekentringer/shared/finance";
import { apiFetch } from "./client.ts";

export async function fetchTransactions(params?: {
  accountId?: string;
  startDate?: string;
  endDate?: string;
  category?: string;
  limit?: number;
  offset?: number;
}): Promise<TransactionListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.accountId) searchParams.set("accountId", params.accountId);
  if (params?.startDate) searchParams.set("startDate", params.startDate);
  if (params?.endDate) searchParams.set("endDate", params.endDate);
  if (params?.category) searchParams.set("category", params.category);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));

  const qs = searchParams.toString();
  const res = await apiFetch(`/transactions${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error("Failed to fetch transactions");
  return res.json();
}

export async function fetchTransaction(
  id: string,
): Promise<TransactionResponse> {
  const res = await apiFetch(`/transactions/${id}`);
  if (!res.ok) throw new Error("Failed to fetch transaction");
  return res.json();
}

export async function updateTransaction(
  id: string,
  data: UpdateTransactionRequest,
): Promise<TransactionResponse> {
  const res = await apiFetch(`/transactions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Failed to update transaction");
  }
  return res.json();
}

export async function uploadCsvPreview(
  accountId: string,
  file: File,
  pinToken: string,
  csvParserId?: string,
): Promise<CsvImportPreviewResponse> {
  const searchParams = new URLSearchParams({ accountId });
  if (csvParserId) searchParams.set("csvParserId", csvParserId);

  const formData = new FormData();
  formData.append("file", file);

  const res = await apiFetch(
    `/transactions/import/preview?${searchParams.toString()}`,
    {
      method: "POST",
      body: formData,
      headers: { "x-pin-token": pinToken },
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Failed to preview CSV import");
  }
  return res.json();
}

export async function confirmImport(
  data: CsvImportConfirmRequest,
  pinToken: string,
): Promise<CsvImportConfirmResponse> {
  const res = await apiFetch("/transactions/import/confirm", {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "x-pin-token": pinToken },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Failed to confirm import");
  }
  return res.json();
}

export async function deleteTransaction(
  id: string,
  pinToken: string,
): Promise<void> {
  const res = await apiFetch(`/transactions/${id}`, {
    method: "DELETE",
    headers: { "x-pin-token": pinToken },
  });
  if (!res.ok) throw new Error("Failed to delete transaction");
}
