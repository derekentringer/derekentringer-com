import type {
  CreateHoldingRequest,
  UpdateHoldingRequest,
  HoldingListResponse,
  HoldingResponse,
  ReorderHoldingsRequest,
  QuoteResponse,
} from "@derekentringer/shared/finance";
import { apiFetch } from "./client.ts";

export async function fetchHoldings(
  accountId: string,
): Promise<HoldingListResponse> {
  const res = await apiFetch(`/holdings?accountId=${accountId}`);
  if (!res.ok) throw new Error("Failed to fetch holdings");
  return res.json();
}

export async function fetchHolding(id: string): Promise<HoldingResponse> {
  const res = await apiFetch(`/holdings/${id}`);
  if (!res.ok) throw new Error("Failed to fetch holding");
  return res.json();
}

export async function createHolding(
  data: CreateHoldingRequest,
): Promise<HoldingResponse> {
  const res = await apiFetch("/holdings", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Failed to create holding");
  }
  return res.json();
}

export async function updateHolding(
  id: string,
  data: UpdateHoldingRequest,
): Promise<HoldingResponse> {
  const res = await apiFetch(`/holdings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Failed to update holding");
  }
  return res.json();
}

export async function deleteHolding(id: string): Promise<void> {
  const res = await apiFetch(`/holdings/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete holding");
}

export async function reorderHoldings(
  data: ReorderHoldingsRequest,
): Promise<void> {
  const res = await apiFetch("/holdings/reorder", {
    method: "PUT",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to reorder holdings");
}

export async function fetchQuote(ticker: string): Promise<QuoteResponse> {
  const res = await apiFetch(`/holdings/quote/${encodeURIComponent(ticker)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Failed to fetch quote");
  }
  return res.json();
}
