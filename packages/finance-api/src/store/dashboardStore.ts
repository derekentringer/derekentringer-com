import type {
  NetWorthSummary,
  NetWorthHistoryPoint,
  SpendingSummary,
} from "@derekentringer/shared";
import { classifyAccountType, AccountType } from "@derekentringer/shared";
import { getPrisma } from "../lib/prisma.js";
import { decryptAccount } from "../lib/mappers.js";
import { decryptNumber } from "../lib/encryption.js";

/**
 * Compute current net worth summary from active account balances.
 */
export async function computeNetWorthSummary(): Promise<NetWorthSummary> {
  const prisma = getPrisma();
  const rows = await prisma.account.findMany({
    where: { isActive: true },
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
 * Compute net worth history for the past N months.
 * Strategy: latest balance per account per month, carry forward for gaps.
 */
export async function computeNetWorthHistory(
  months: number = 12,
): Promise<NetWorthHistoryPoint[]> {
  const prisma = getPrisma();

  // Calculate start date (N months ago, first day of month)
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

  // Fetch all balance records from startDate onward
  const balanceRows = await prisma.balance.findMany({
    where: {
      date: { gte: startDate },
    },
    orderBy: { date: "desc" },
    select: {
      accountId: true,
      balance: true,
      date: true,
    },
  });

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

  // Deduplicate: latest balance per account per month
  // Since ordered by date DESC, first seen per account+month wins
  const monthlyBalances = new Map<string, Map<string, number>>(); // month -> accountId -> balance

  for (const row of balanceRows) {
    const date = new Date(row.date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    if (!monthlyBalances.has(monthKey)) {
      monthlyBalances.set(monthKey, new Map());
    }
    const monthMap = monthlyBalances.get(monthKey)!;

    // Only keep first (latest date) per account per month
    if (!monthMap.has(row.accountId)) {
      monthMap.set(row.accountId, decryptNumber(row.balance));
    }
  }

  // Generate month keys for the range
  const monthKeys: string[] = [];
  const cursor = new Date(startDate);
  while (cursor <= now) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    monthKeys.push(key);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  // Build history with carry-forward
  const lastKnownBalance = new Map<string, number>(); // accountId -> last known balance
  const history: NetWorthHistoryPoint[] = [];

  for (const monthKey of monthKeys) {
    const monthData = monthlyBalances.get(monthKey);

    // Update last known balances with this month's data
    if (monthData) {
      for (const [accountId, balance] of monthData) {
        lastKnownBalance.set(accountId, balance);
      }
    }

    // Aggregate by classification
    let assets = 0;
    let liabilities = 0;

    for (const [accountId, balance] of lastKnownBalance) {
      const accountType = accountTypeMap.get(accountId);
      if (!accountType) continue;

      const classification = classifyAccountType(accountType as AccountType);
      if (classification === "asset") {
        // For Real Estate, use equity (estimatedValue - amountOwed)
        const estimatedValue = accountEstimatedValueMap.get(accountId);
        if (accountType === AccountType.RealEstate && estimatedValue != null) {
          assets += estimatedValue - balance;
        } else {
          assets += balance;
        }
      } else if (classification === "liability") {
        liabilities += Math.abs(balance);
      }
    }

    history.push({
      month: monthKey,
      assets: Math.round(assets * 100) / 100,
      liabilities: Math.round(liabilities * 100) / 100,
      netWorth: Math.round((assets - liabilities) * 100) / 100,
    });
  }

  return history;
}

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
