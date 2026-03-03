import type {
  HoldingListResponse,
  HoldingResponse,
  CreateHoldingRequest,
  UpdateHoldingRequest,
  ReorderHoldingsRequest,
  QuoteResponse,
} from "@derekentringer/shared/finance";
import api from "@/services/api";

export async function fetchHoldings(
  accountId: string,
): Promise<HoldingListResponse> {
  const { data } = await api.get<HoldingListResponse>("/holdings", {
    params: { accountId },
  });
  return data;
}

export async function fetchHolding(id: string): Promise<HoldingResponse> {
  const { data } = await api.get<HoldingResponse>(`/holdings/${id}`);
  return data;
}

export async function createHolding(
  body: CreateHoldingRequest,
): Promise<HoldingResponse> {
  const { data } = await api.post<HoldingResponse>("/holdings", body);
  return data;
}

export async function updateHolding(
  id: string,
  body: UpdateHoldingRequest,
): Promise<HoldingResponse> {
  const { data } = await api.patch<HoldingResponse>(`/holdings/${id}`, body);
  return data;
}

export async function deleteHolding(id: string): Promise<void> {
  await api.delete(`/holdings/${id}`);
}

export async function reorderHoldings(
  body: ReorderHoldingsRequest,
): Promise<void> {
  await api.put("/holdings/reorder", body);
}

export async function fetchQuote(ticker: string): Promise<QuoteResponse> {
  const { data } = await api.get<QuoteResponse>(`/holdings/quote/${ticker}`);
  return data;
}
