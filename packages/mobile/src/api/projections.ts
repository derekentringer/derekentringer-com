import type {
  NetIncomeProjectionResponse,
  AccountProjectionsResponse,
  SavingsAccountSummary,
  SavingsProjectionResponse,
  DebtAccountSummary,
  DebtPayoffResponse,
} from "@derekentringer/shared/finance";
import api from "@/services/api";

export async function fetchNetIncomeProjection(params: {
  months?: number;
}): Promise<NetIncomeProjectionResponse> {
  const queryParams: Record<string, string> = {};
  if (params.months !== undefined) queryParams.months = String(params.months);
  const { data } = await api.get<NetIncomeProjectionResponse>(
    "/projections/net-income",
    { params: queryParams },
  );
  return data;
}

export async function fetchAccountProjections(params: {
  months?: number;
}): Promise<AccountProjectionsResponse> {
  const queryParams: Record<string, string> = {};
  if (params.months !== undefined) queryParams.months = String(params.months);
  const { data } = await api.get<AccountProjectionsResponse>(
    "/projections/account-balances",
    { params: queryParams },
  );
  return data;
}

export async function fetchSavingsAccounts(): Promise<{
  accounts: SavingsAccountSummary[];
}> {
  const { data } = await api.get<{ accounts: SavingsAccountSummary[] }>(
    "/projections/savings/accounts",
  );
  return data;
}

export async function fetchSavingsProjection(
  accountId: string,
  params: { months?: number; contribution?: number; apy?: number },
): Promise<SavingsProjectionResponse> {
  const queryParams: Record<string, string> = {};
  if (params.months !== undefined) queryParams.months = String(params.months);
  if (params.contribution !== undefined)
    queryParams.contribution = String(params.contribution);
  if (params.apy !== undefined) queryParams.apy = String(params.apy);
  const { data } = await api.get<SavingsProjectionResponse>(
    `/projections/savings/${accountId}`,
    { params: queryParams },
  );
  return data;
}

export async function fetchDebtAccounts(params: {
  includeMortgages?: boolean;
}): Promise<{ accounts: DebtAccountSummary[] }> {
  const queryParams: Record<string, string> = {};
  if (params.includeMortgages) queryParams.includeMortgages = "true";
  const { data } = await api.get<{ accounts: DebtAccountSummary[] }>(
    "/projections/debt-payoff/accounts",
    { params: queryParams },
  );
  return data;
}

export async function fetchDebtPayoff(params: {
  extraPayment?: number;
  includeMortgages?: boolean;
  accountIds?: string[];
  maxMonths?: number;
}): Promise<DebtPayoffResponse> {
  const queryParams: Record<string, string> = {};
  if (params.extraPayment !== undefined)
    queryParams.extraPayment = String(params.extraPayment);
  if (params.includeMortgages) queryParams.includeMortgages = "true";
  if (params.accountIds?.length)
    queryParams.accountIds = params.accountIds.join(",");
  if (params.maxMonths !== undefined)
    queryParams.maxMonths = String(params.maxMonths);
  const { data } = await api.get<DebtPayoffResponse>(
    "/projections/debt-payoff",
    { params: queryParams },
  );
  return data;
}
