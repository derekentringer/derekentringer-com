import type {
  NetWorthSummary,
  NetWorthHistoryPoint,
  SpendingSummary,
  AccountBalanceHistoryResponse,
} from "@derekentringer/shared";
import { classifyAccountType, AccountType } from "@derekentringer/shared";
import { getPrisma } from "../lib/prisma.js";
import { decryptAccount } from "../lib/mappers.js";
import { decryptNumber } from "../lib/encryption.js";

// ─── Period key helpers ─────────────────────────────────────────────────────

function toMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function toWeekKey(d: Date): string {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = 1
  copy.setDate(copy.getDate() + diff);
  return `${copy.getFullYear()}-${String(copy.getMonth() + 1).padStart(2, "0")}-${String(copy.getDate()).padStart(2, "0")}`;
}

function dateToKey(d: Date, granularity: "weekly" | "monthly"): string {
  return granularity === "monthly" ? toMonthKey(d) : toWeekKey(d);
}

function generatePeriodKeys(
  start: Date,
  end: Date,
  granularity: "weekly" | "monthly",
): string[] {
  const keys: string[] = [];
  if (granularity === "monthly") {
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= end) {
      keys.push(toMonthKey(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else {
    const cursor = new Date(start);
    const day = cursor.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    cursor.setDate(cursor.getDate() + diff);
    while (cursor <= end) {
      keys.push(
        `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`,
      );
      cursor.setDate(cursor.getDate() + 7);
    }
  }
  return keys;
}

// ─── Net Worth ──────────────────────────────────────────────────────────────

/**
 * Compute current net worth summary from active account balances.
 */
export async function computeNetWorthSummary(): Promise<NetWorthSummary> {
  const prisma = getPrisma();
  const rows = await prisma.account.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  // Compute per-account previous balance using the latest balance record
  // on or before the end of the previous month (carry-forward logic)
  const now = new Date();
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  const prevBalanceRows = await prisma.balance.findMany({
    where: {
      date: { lte: prevMonthEnd },
    },
    orderBy: { date: "desc" },
    select: { accountId: true, balance: true, date: true },
  });

  // Latest balance per account on or before end of previous month
  const prevBalanceMap = new Map<string, number>();
  for (const row of prevBalanceRows) {
    if (!prevBalanceMap.has(row.accountId)) {
      prevBalanceMap.set(row.accountId, decryptNumber(row.balance));
    }
  }

  const accounts = rows.map((row) => {
    const decrypted = decryptAccount(row);
    const classification = classifyAccountType(decrypted.type);
    const isRealEstate = decrypted.type === AccountType.RealEstate && decrypted.estimatedValue != null;
    // For Real Estate accounts, show equity (market value - amount owed)
    const balance = isRealEstate
      ? decrypted.estimatedValue! - decrypted.currentBalance
      : decrypted.currentBalance;

    const rawPrev = prevBalanceMap.get(decrypted.id);
    const previousBalance = rawPrev !== undefined
      ? isRealEstate ? decrypted.estimatedValue! - rawPrev : rawPrev
      : undefined;

    return {
      id: decrypted.id,
      name: decrypted.name,
      type: decrypted.type,
      balance,
      previousBalance,
      classification,
      isFavorite: decrypted.isFavorite,
    };
  });

  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const acct of accounts) {
    if (acct.classification === "asset") {
      totalAssets += acct.balance;
    } else if (acct.classification === "liability") {
      // Liabilities are stored as negative (credit cards) or positive (loans)
      // For net worth, we take absolute value as liability
      totalLiabilities += Math.abs(acct.balance);
    }
  }

  return {
    totalAssets: Math.round(totalAssets * 100) / 100,
    totalLiabilities: Math.round(totalLiabilities * 100) / 100,
    netWorth: Math.round((totalAssets - totalLiabilities) * 100) / 100,
    accounts,
  };
}

/**
 * Compute net worth history with configurable granularity and date range.
 * Strategy: latest balance per account per period, carry forward for gaps.
 */
export async function computeNetWorthHistory(
  granularity: "weekly" | "monthly" = "monthly",
  startDate?: Date,
): Promise<{ history: NetWorthHistoryPoint[]; accountHistory: Array<{ date: string; balances: Record<string, number> }> }> {
  const prisma = getPrisma();
  const now = new Date();

  // Fetch balance records (optionally filtered by startDate)
  const balanceRows = await prisma.balance.findMany({
    where: startDate ? { date: { gte: startDate } } : undefined,
    orderBy: { date: "desc" },
    select: { accountId: true, balance: true, date: true },
  });

  if (balanceRows.length === 0) return { history: [], accountHistory: [] };

  // If we have a startDate, also fetch the latest balance per account BEFORE
  // that date so carry-forward starts from a known value.
  const initialBalances = new Map<string, number>();
  if (startDate) {
    const preRows = await prisma.balance.findMany({
      where: { date: { lt: startDate } },
      orderBy: { date: "desc" },
      select: { accountId: true, balance: true },
    });
    for (const row of preRows) {
      if (!initialBalances.has(row.accountId)) {
        initialBalances.set(row.accountId, decryptNumber(row.balance));
      }
    }
  }

  // Fetch all active accounts to know their types and estimated values
  const accountRows = await prisma.account.findMany({
    where: { isActive: true },
    select: { id: true, type: true, estimatedValue: true },
  });

  const accountTypeMap = new Map<string, string>();
  const accountEstimatedValueMap = new Map<string, number>();
  for (const a of accountRows) {
    accountTypeMap.set(a.id, a.type);
    if (a.type === AccountType.RealEstate && a.estimatedValue) {
      accountEstimatedValueMap.set(a.id, decryptNumber(a.estimatedValue));
    }
  }

  // Deduplicate: latest balance per account per period
  // Since ordered by date DESC, first seen per account+period wins
  const periodBalances = new Map<string, Map<string, number>>();

  for (const row of balanceRows) {
    const periodKey = dateToKey(new Date(row.date), granularity);

    if (!periodBalances.has(periodKey)) {
      periodBalances.set(periodKey, new Map());
    }
    const periodMap = periodBalances.get(periodKey)!;

    if (!periodMap.has(row.accountId)) {
      periodMap.set(row.accountId, decryptNumber(row.balance));
    }
  }

  // Determine effective start from data if no startDate provided
  const effectiveStart = startDate ?? new Date(balanceRows[balanceRows.length - 1].date);

  // Generate period keys
  const periodKeys = generatePeriodKeys(effectiveStart, now, granularity);

  // Build history with carry-forward
  const lastKnownBalance = new Map<string, number>(initialBalances);
  const history: NetWorthHistoryPoint[] = [];
  const accountHistory: Array<{ date: string; balances: Record<string, number> }> = [];

  for (const periodKey of periodKeys) {
    const periodData = periodBalances.get(periodKey);

    if (periodData) {
      for (const [accountId, balance] of periodData) {
        lastKnownBalance.set(accountId, balance);
      }
    }

    let assets = 0;
    let liabilities = 0;
    const periodAccountBalances: Record<string, number> = {};

    for (const [accountId, balance] of lastKnownBalance) {
      const accountType = accountTypeMap.get(accountId);
      if (!accountType) continue;

      const classification = classifyAccountType(accountType as AccountType);
      if (classification === "asset") {
        const estimatedValue = accountEstimatedValueMap.get(accountId);
        if (accountType === AccountType.RealEstate && estimatedValue != null) {
          const equity = estimatedValue - balance;
          assets += equity;
          periodAccountBalances[accountId] = Math.round(equity * 100) / 100;
        } else {
          assets += balance;
          periodAccountBalances[accountId] = Math.round(balance * 100) / 100;
        }
      } else if (classification === "liability") {
        liabilities += Math.abs(balance);
        periodAccountBalances[accountId] = Math.round(Math.abs(balance) * 100) / 100;
      }
    }

    history.push({
      date: periodKey,
      assets: Math.round(assets * 100) / 100,
      liabilities: Math.round(liabilities * 100) / 100,
      netWorth: Math.round((assets - liabilities) * 100) / 100,
    });

    accountHistory.push({ date: periodKey, balances: periodAccountBalances });
  }

  return { history, accountHistory };
}

// ─── Spending ───────────────────────────────────────────────────────────────

/**
 * Compute spending summary for a given month.
 * Fetches transactions, decrypts amounts, groups negative amounts by category.
 */
export async function computeSpendingSummary(
  month: string,
): Promise<SpendingSummary> {
  const prisma = getPrisma();

  // Parse month string "YYYY-MM" into date range
  const [yearStr, monthStr] = month.split("-");
  const year = parseInt(yearStr, 10);
  const mon = parseInt(monthStr, 10) - 1; // 0-indexed
  const startDate = new Date(year, mon, 1);
  const endDate = new Date(year, mon + 1, 0, 23, 59, 59, 999);

  // Fetch transactions for the month (only need amount and category)
  const rows = await prisma.transaction.findMany({
    where: {
      date: { gte: startDate, lte: endDate },
    },
    select: {
      amount: true,
      category: true,
    },
  });

  // Aggregate spending by category (negative amounts = spending)
  const categoryTotals = new Map<string, number>();
  let total = 0;

  for (const row of rows) {
    const amount = decryptNumber(row.amount);
    // Only count negative amounts (expenses)
    if (amount < 0) {
      const absAmount = Math.abs(amount);
      const category = row.category || "Uncategorized";
      categoryTotals.set(
        category,
        (categoryTotals.get(category) ?? 0) + absAmount,
      );
      total += absAmount;
    }
  }

  // Sort by amount descending
  const sortedCategories = Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount]) => ({
      category,
      amount: Math.round(amount * 100) / 100,
      percentage: total > 0 ? Math.round((amount / total) * 10000) / 100 : 0,
    }));

  return {
    month,
    categories: sortedCategories,
    total: Math.round(total * 100) / 100,
  };
}

// ─── Account Balance History ────────────────────────────────────────────────

/**
 * Compute balance history for a single account with configurable granularity.
 * Reconstructs historical balances from transactions: starts at currentBalance
 * and works backwards, subtracting each period's net transactions.
 */
export async function computeAccountBalanceHistory(
  accountId: string,
  granularity: "weekly" | "monthly" = "weekly",
  startDate?: Date,
): Promise<AccountBalanceHistoryResponse | null> {
  const prisma = getPrisma();

  // Fetch and decrypt the account
  const accountRow = await prisma.account.findUnique({
    where: { id: accountId },
  });
  if (!accountRow) return null;

  const account = decryptAccount(accountRow);

  const now = new Date();

  // Fetch transactions (optionally filtered by startDate)
  const txRows = await prisma.transaction.findMany({
    where: {
      accountId,
      ...(startDate ? { date: { gte: startDate } } : {}),
    },
    select: { amount: true, date: true },
  });

  // Aggregate net transaction amount per period
  const periodNet = new Map<string, number>();
  let earliestTxDate: Date | null = null;

  for (const row of txRows) {
    const txDate = new Date(row.date);
    const periodKey = dateToKey(txDate, granularity);
    periodNet.set(periodKey, (periodNet.get(periodKey) ?? 0) + decryptNumber(row.amount));
    if (!earliestTxDate || txDate < earliestTxDate) earliestTxDate = txDate;
  }

  // Determine effective start
  const effectiveStart = startDate ?? earliestTxDate ?? now;

  // Generate period keys
  const periodKeys = generatePeriodKeys(effectiveStart, now, granularity);

  if (periodKeys.length === 0) {
    return {
      accountId: account.id,
      accountName: account.name,
      currentBalance: account.currentBalance,
      history: [{ date: dateToKey(now, granularity), balance: Math.round(account.currentBalance * 100) / 100 }],
    };
  }

  // Work backwards from currentBalance
  const balances = new Array<number>(periodKeys.length);
  balances[periodKeys.length - 1] = account.currentBalance;

  for (let i = periodKeys.length - 2; i >= 0; i--) {
    const nextPeriodNet = periodNet.get(periodKeys[i + 1]) ?? 0;
    balances[i] = balances[i + 1] - nextPeriodNet;
  }

  const history = periodKeys.map((date, i) => ({
    date,
    balance: Math.round(balances[i] * 100) / 100,
  }));

  return {
    accountId: account.id,
    accountName: account.name,
    currentBalance: account.currentBalance,
    history,
  };
}
