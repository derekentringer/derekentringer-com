import type {
  CreateBillRequest,
  UpdateBillRequest,
  BillListResponse,
  BillResponse,
  BillPayment,
  DashboardUpcomingBillsResponse,
} from "@derekentringer/shared/finance";
import { apiFetch } from "./client.ts";

export async function fetchBills(
  active?: boolean,
): Promise<BillListResponse> {
  const query = active !== undefined ? `?active=${active}` : "";
  const res = await apiFetch(`/bills${query}`);
  if (!res.ok) throw new Error("Failed to fetch bills");
  return res.json();
}

export async function fetchBill(id: string): Promise<BillResponse> {
  const res = await apiFetch(`/bills/${id}`);
  if (!res.ok) throw new Error("Failed to fetch bill");
  return res.json();
}

export async function fetchUpcomingBills(
  days?: number,
): Promise<DashboardUpcomingBillsResponse> {
  const query = days ? `?days=${days}` : "";
  const res = await apiFetch(`/bills/upcoming${query}`);
  if (!res.ok) throw new Error("Failed to fetch upcoming bills");
  return res.json();
}

export async function createBill(
  data: CreateBillRequest,
): Promise<BillResponse> {
  const res = await apiFetch("/bills", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Failed to create bill");
  }
  return res.json();
}

export async function updateBill(
  id: string,
  data: UpdateBillRequest,
): Promise<BillResponse> {
  const res = await apiFetch(`/bills/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Failed to update bill");
  }
  return res.json();
}

export async function deleteBill(id: string): Promise<void> {
  const res = await apiFetch(`/bills/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete bill");
}

export async function markBillPaid(
  id: string,
  dueDate: string,
  amount?: number,
): Promise<{ payment: BillPayment }> {
  const res = await apiFetch(`/bills/${id}/pay`, {
    method: "POST",
    body: JSON.stringify({ dueDate, amount }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Failed to mark bill as paid");
  }
  return res.json();
}

export async function unmarkBillPaid(
  id: string,
  dueDate: string,
): Promise<void> {
  const res = await apiFetch(
    `/bills/${id}/pay?dueDate=${encodeURIComponent(dueDate)}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error("Failed to unmark bill payment");
}
