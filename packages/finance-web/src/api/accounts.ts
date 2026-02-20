import type {
  CreateAccountRequest,
  UpdateAccountRequest,
  AccountListResponse,
  AccountResponse,
} from "@derekentringer/shared/finance";
import { apiFetch } from "./client.ts";

export async function fetchAccounts(): Promise<AccountListResponse> {
  const res = await apiFetch("/accounts");
  if (!res.ok) throw new Error("Failed to fetch accounts");
  return res.json();
}

export async function fetchAccount(id: string): Promise<AccountResponse> {
  const res = await apiFetch(`/accounts/${id}`);
  if (!res.ok) throw new Error("Failed to fetch account");
  return res.json();
}

export async function createAccount(
  data: CreateAccountRequest,
): Promise<AccountResponse> {
  const res = await apiFetch("/accounts", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Failed to create account");
  }
  return res.json();
}

export async function updateAccount(
  id: string,
  data: UpdateAccountRequest,
): Promise<AccountResponse> {
  const res = await apiFetch(`/accounts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Failed to update account");
  }
  return res.json();
}

export async function deleteAccount(id: string): Promise<void> {
  const res = await apiFetch(`/accounts/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete account");
}

export async function reorderAccounts(
  order: Array<{ id: string; sortOrder: number }>,
): Promise<void> {
  const res = await apiFetch("/accounts/reorder", {
    method: "PUT",
    body: JSON.stringify({ order }),
  });
  if (!res.ok) throw new Error("Failed to reorder accounts");
}
