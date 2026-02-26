import type {
  BillListResponse,
  BillResponse,
  BillPayment,
  DashboardUpcomingBillsResponse,
  CreateBillRequest,
  UpdateBillRequest,
} from "@derekentringer/shared/finance";
import api from "@/services/api";

export async function fetchBills(
  active?: boolean,
): Promise<BillListResponse> {
  const params: Record<string, string> = {};
  if (active !== undefined) params.active = String(active);
  const { data } = await api.get<BillListResponse>("/bills", { params });
  return data;
}

export async function fetchBill(id: string): Promise<BillResponse> {
  const { data } = await api.get<BillResponse>(`/bills/${id}`);
  return data;
}

export async function fetchUpcomingBills(
  days?: number,
): Promise<DashboardUpcomingBillsResponse> {
  const params: Record<string, string> = {};
  if (days) params.days = String(days);
  const { data } = await api.get<DashboardUpcomingBillsResponse>(
    "/bills/upcoming",
    { params },
  );
  return data;
}

export async function createBill(
  body: CreateBillRequest,
): Promise<BillResponse> {
  const { data } = await api.post<BillResponse>("/bills", body);
  return data;
}

export async function updateBill(
  id: string,
  body: UpdateBillRequest,
): Promise<BillResponse> {
  const { data } = await api.patch<BillResponse>(`/bills/${id}`, body);
  return data;
}

export async function deleteBill(
  id: string,
  pinToken: string,
): Promise<void> {
  await api.delete(`/bills/${id}`, {
    headers: { "x-pin-token": pinToken },
  });
}

export async function markBillPaid(
  id: string,
  dueDate: string,
  amount?: number,
): Promise<{ payment: BillPayment }> {
  const { data } = await api.post<{ payment: BillPayment }>(
    `/bills/${id}/pay`,
    { dueDate, amount },
  );
  return data;
}

export async function unmarkBillPaid(
  id: string,
  dueDate: string,
): Promise<void> {
  await api.delete(`/bills/${id}/pay`, {
    params: { dueDate },
  });
}
