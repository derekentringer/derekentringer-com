import type {
  NetIncomeProjectionResponse,
  AccountProjectionsResponse,
  SavingsAccountSummary,
  SavingsProjectionResponse,
} from "@derekentringer/shared/finance";
import { apiFetch } from "./client.ts";

export async function fetchNetIncomeProjection(
  params: { months?: number; incomeAdj?: number; expenseAdj?: number },
  signal?: AbortSignal,
): Promise<NetIncomeProjectionResponse> {
  const query = new URLSearchParams();
  if (params.months !== undefined) query.set("months", String(params.months));
  if (params.incomeAdj !== undefined) query.set("incomeAdj", String(params.incomeAdj));
  if (params.expenseAdj !== undefined) query.set("expenseAdj", String(params.expenseAdj));
  const qs = query.toString();
  const res = await apiFetch(`/projections/net-income${qs ? `?${qs}` : ""}`, { signal });
  if (!res.ok) throw new Error("Failed to fetch net income projection");
  return res.json();
}

export async function fetchAccountProjections(
  params: { months?: number; incomeAdj?: number; expenseAdj?: number },
  signal?: AbortSignal,
): Promise<AccountProjectionsResponse> {
  const query = new URLSearchParams();
  if (params.months !== undefined) query.set("months", String(params.months));
  if (params.incomeAdj !== undefined) query.set("incomeAdj", String(params.incomeAdj));
  if (params.expenseAdj !== undefined) query.set("expenseAdj", String(params.expenseAdj));
  const qs = query.toString();
  const res = await apiFetch(`/projections/account-balances${qs ? `?${qs}` : ""}`, { signal });
  if (!res.ok) throw new Error("Failed to fetch account projections");
  return res.json();
}

export async function fetchSavingsAccounts(): Promise<{ accounts: SavingsAccountSummary[] }> {
  const res = await apiFetch("/projections/savings/accounts");
  if (!res.ok) throw new Error("Failed to fetch savings accounts");
  return res.json();
}

export async function fetchSavingsProjection(
  accountId: string,
  params: { months?: number; contribution?: number; apy?: number },
  signal?: AbortSignal,
): Promise<SavingsProjectionResponse> {
  const query = new URLSearchParams();
  if (params.months !== undefined) query.set("months", String(params.months));
  if (params.contribution !== undefined) query.set("contribution", String(params.contribution));
  if (params.apy !== undefined) query.set("apy", String(params.apy));
  const qs = query.toString();
  const res = await apiFetch(`/projections/savings/${accountId}${qs ? `?${qs}` : ""}`, { signal });
  if (!res.ok) throw new Error("Failed to fetch savings projection");
  return res.json();
}
