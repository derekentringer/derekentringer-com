import type {
  NetIncomeProjectionResponse,
  AccountProjectionsResponse,
  SavingsAccountSummary,
  SavingsProjectionResponse,
  DebtAccountSummary,
  DebtPayoffResponse,
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

export async function fetchDebtAccounts(
  params: { includeMortgages?: boolean },
): Promise<{ accounts: DebtAccountSummary[] }> {
  const query = new URLSearchParams();
  if (params.includeMortgages) query.set("includeMortgages", "true");
  const qs = query.toString();
  const res = await apiFetch(`/projections/debt-payoff/accounts${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error("Failed to fetch debt accounts");
  return res.json();
}

export async function fetchDebtPayoff(
  params: {
    extraPayment?: number;
    includeMortgages?: boolean;
    accountIds?: string[];
    customOrder?: string[];
    maxMonths?: number;
  },
  signal?: AbortSignal,
): Promise<DebtPayoffResponse> {
  const query = new URLSearchParams();
  if (params.extraPayment !== undefined) query.set("extraPayment", String(params.extraPayment));
  if (params.includeMortgages) query.set("includeMortgages", "true");
  if (params.accountIds && params.accountIds.length > 0) query.set("accountIds", params.accountIds.join(","));
  if (params.customOrder && params.customOrder.length > 0) query.set("customOrder", params.customOrder.join(","));
  if (params.maxMonths !== undefined) query.set("maxMonths", String(params.maxMonths));
  const qs = query.toString();
  const res = await apiFetch(`/projections/debt-payoff${qs ? `?${qs}` : ""}`, { signal });
  if (!res.ok) throw new Error("Failed to fetch debt payoff projection");
  return res.json();
}
