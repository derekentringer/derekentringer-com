import type {
  NetWorthSummary,
  NetWorthHistoryPoint,
  SpendingSummary,
  AccountBalanceHistoryResponse,
  DailySpendingPoint,
  IncomeSpendingPoint,
  DTIResponse,
  DTIComponent,
} from "@derekentringer/shared";
import { classifyAccountType, AccountType, TRANSFER_CATEGORY } from "@derekentringer/shared";
import { getPrisma } from "../lib/prisma.js";
import { decryptAccount, decryptLoanProfile, decryptCreditProfile } from "../lib/mappers.js";
import { decryptNumber } from "../lib/encryption.js";
import { listAccounts } from "./accountStore.js";
import { listBalances } from "./balanceStore.js";
import { listBills } from "./billStore.js";
import { listIncomeSources } from "./incomeSourceStore.js";
import { frequencyToMonthlyMultiplier, detectIncomePatterns } from "./projectionsStore.js";

// ─── Period key helpers ─────────────────────────────────────────────────────

function toMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function toDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toWeekKey(d: Date): string {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = 1
  copy.setDate(copy.getDate() + diff);
  return `${copy.getFullYear()}-${String(copy.getMonth() + 1).padStart(2, "0")}-${String(copy.getDate()).padStart(2, "0")}`;
}

function dateToKey(d: Date, granularity: "daily" | "weekly" | "monthly"): string {
  if (granularity === "daily") return toDayKey(d);
  return granularity === "monthly" ? toMonthKey(d) : toWeekKey(d);
}

function generatePeriodKeys(
  start: Date,
  end: Date,
  granularity: "daily" | "weekly" | "monthly",
): string[] {
  const keys: string[] = [];
  if (granularity === "daily") {
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    while (cursor <= end) {
      keys.push(toDayKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (granularity === "monthly") {
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
  granularity: "daily" | "weekly" | "monthly" = "monthly",
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
  // Exclude "Transfer" category to avoid double-counting (e.g. credit card payments from checking)
  const categoryTotals = new Map<string, number>();
  let total = 0;

  for (const row of rows) {
    const category = row.category || "Uncategorized";
    if (category === TRANSFER_CATEGORY) continue;
    const amount = decryptNumber(row.amount);
    // Only count negative amounts (expenses)
    if (amount < 0) {
      const absAmount = Math.abs(amount);
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

/**
 * Compute daily spending totals for a date range.
 * Returns absolute values of negative transactions grouped by day.
 */
export async function computeDailySpending(
  startDate: Date,
  endDate: Date,
): Promise<DailySpendingPoint[]> {
  const prisma = getPrisma();

  const rows = await prisma.transaction.findMany({
    where: {
      date: { gte: startDate, lte: endDate },
    },
    select: { amount: true, date: true, category: true },
  });

  const dayTotals = new Map<string, number>();

  for (const row of rows) {
    if ((row.category || "Uncategorized") === TRANSFER_CATEGORY) continue;
    const amount = decryptNumber(row.amount);
    if (amount < 0) {
      const key = toDayKey(new Date(row.date));
      dayTotals.set(key, (dayTotals.get(key) ?? 0) + Math.abs(amount));
    }
  }

  // Generate all day keys in range and fill gaps with 0
  const keys = generatePeriodKeys(startDate, endDate, "daily");
  return keys.map((date) => ({
    date,
    amount: Math.round((dayTotals.get(date) ?? 0) * 100) / 100,
  }));
}

// ─── Income vs Spending ─────────────────────────────────────────────────────

/**
 * Compute income and spending totals grouped by week or month.
 * Excludes "Transfer" category to avoid double-counting.
 *
 * When excludedAccountIds is provided, transactions from those accounts
 * are excluded from both income and spending totals.
 */
export async function computeIncomeSpending(
  granularity: "weekly" | "monthly",
  startDate?: Date,
  excludedAccountIds?: Set<string>,
): Promise<IncomeSpendingPoint[]> {
  const prisma = getPrisma();
  const now = new Date();

  const needAccountId = !!excludedAccountIds && excludedAccountIds.size > 0;
  const rows = await prisma.transaction.findMany({
    where: startDate ? { date: { gte: startDate } } : undefined,
    select: {
      amount: true,
      date: true,
      category: true,
      ...(needAccountId ? { accountId: true } : {}),
    },
  });

  const incomeMap = new Map<string, number>();
  const spendingMap = new Map<string, number>();

  for (const row of rows) {
    if ((row.category || "Uncategorized") === TRANSFER_CATEGORY) continue;
    if (needAccountId && excludedAccountIds!.has((row as { accountId: string }).accountId)) continue;
    const amount = decryptNumber(row.amount);
    const key = dateToKey(new Date(row.date), granularity);
    if (amount >= 0) {
      incomeMap.set(key, (incomeMap.get(key) ?? 0) + amount);
    } else {
      spendingMap.set(key, (spendingMap.get(key) ?? 0) + Math.abs(amount));
    }
  }

  const effectiveStart = startDate ?? (rows.length > 0
    ? rows.reduce((min, r) => (r.date < min ? r.date : min), rows[0].date)
    : now);
  const start = effectiveStart instanceof Date ? effectiveStart : new Date(effectiveStart);

  const keys = generatePeriodKeys(start, now, granularity);

  return keys.map((date) => ({
    date,
    income: Math.round((incomeMap.get(date) ?? 0) * 100) / 100,
    spending: Math.round((spendingMap.get(date) ?? 0) * 100) / 100,
  }));
}

// ─── Account Balance History ────────────────────────────────────────────────

/**
 * Compute balance history for a single account with configurable granularity.
 *
 * For transaction-driven accounts (checking, savings, credit, loan):
 *   Reconstructs historical balances from transactions — starts at currentBalance
 *   and works backwards, subtracting each period's net transactions.
 *
 * For snapshot-driven accounts (investment, real estate):
 *   Uses actual balance entries from statement imports, since balance changes
 *   are driven by market movements rather than individual transactions.
 */
export async function computeAccountBalanceHistory(
  accountId: string,
  granularity: "daily" | "weekly" | "monthly" = "weekly",
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

  // Snapshot-driven accounts: use balance entries directly
  const snapshotTypes: string[] = [AccountType.Investment, AccountType.RealEstate, AccountType.Loan];
  if (snapshotTypes.includes(account.type)) {
    const balances = await listBalances(accountId);
    // balances are sorted desc by date; reverse for chronological order
    const sorted = [...balances].reverse();

    // Filter by startDate if provided
    const filtered = startDate
      ? sorted.filter((b) => new Date(b.date) >= startDate)
      : sorted;

    if (filtered.length === 0) {
      return {
        accountId: account.id,
        accountName: account.name,
        currentBalance: account.currentBalance,
        history: [{ date: dateToKey(now, granularity), balance: Math.round(account.currentBalance * 100) / 100 }],
      };
    }

    // Aggregate balances by period (use latest balance per period)
    const byPeriod = new Map<string, number>();
    for (const bal of filtered) {
      const key = dateToKey(new Date(bal.date), granularity);
      byPeriod.set(key, bal.balance); // last write wins (latest date in period)
    }

    const history = [...byPeriod.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, balance]) => ({ date, balance: Math.round(balance * 100) / 100 }));

    return {
      accountId: account.id,
      accountName: account.name,
      currentBalance: account.currentBalance,
      history,
    };
  }

  // Transaction-driven accounts: reconstruct from transactions
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
  const balanceArr = new Array<number>(periodKeys.length);
  balanceArr[periodKeys.length - 1] = account.currentBalance;

  for (let i = periodKeys.length - 2; i >= 0; i--) {
    const nextPeriodNet = periodNet.get(periodKeys[i + 1]) ?? 0;
    balanceArr[i] = balanceArr[i + 1] - nextPeriodNet;
  }

  const history = periodKeys.map((date, i) => ({
    date,
    balance: Math.round(balanceArr[i] * 100) / 100,
  }));

  return {
    accountId: account.id,
    accountName: account.name,
    currentBalance: account.currentBalance,
    history,
  };
}

// ─── DTI (Debt-to-Income) Ratio ─────────────────────────────────────────────

export async function computeDTI(): Promise<DTIResponse> {
  const prisma = getPrisma();
  const debtComponents: DTIComponent[] = [];
  const incomeComponents: DTIComponent[] = [];

  // 1. Monthly debt payments from accounts with loan profiles (Loan + RealEstate,
  //    since mortgages are tracked on RealEstate accounts for correct equity display).
  const allAccounts = await listAccounts({ isActive: true });
  const debtBearingAccounts = allAccounts.filter(
    (a) => a.type === AccountType.Loan || a.type === AccountType.RealEstate,
  );

  // Track which loan accounts already contributed via their profile,
  // so we can avoid double-counting if a bill also targets the same account.
  const loanAccountIdsWithPayment = new Set<string>();

  let loanPaymentsTotal = 0;
  await Promise.all(
    debtBearingAccounts.map(async (account) => {
      const latestBalance = await prisma.balance.findFirst({
        where: { accountId: account.id },
        orderBy: { date: "desc" },
        include: { loanProfile: true },
      });
      if (latestBalance?.loanProfile) {
        const profile = decryptLoanProfile(latestBalance.loanProfile);
        if (profile.monthlyPayment) {
          const adjusted = profile.monthlyPayment * (account.dtiPercentage / 100);
          const amount = Math.round(adjusted * 100) / 100;
          loanPaymentsTotal += adjusted;
          debtComponents.push({ name: account.name, amount, type: "loan", ...(account.dtiPercentage !== 100 && { dtiPercentage: account.dtiPercentage }) });
          loanAccountIdsWithPayment.add(account.id);
        }
      }
    }),
  );

  // 2. Minimum payments from credit card profiles
  const creditAccounts = allAccounts.filter((a) => a.type === AccountType.Credit);
  let creditPaymentsTotal = 0;
  await Promise.all(
    creditAccounts.map(async (account) => {
      const latestBalance = await prisma.balance.findFirst({
        where: { accountId: account.id },
        orderBy: { date: "desc" },
        include: { creditProfile: true },
      });
      if (latestBalance?.creditProfile) {
        const profile = decryptCreditProfile(latestBalance.creditProfile);
        if (profile.minimumPayment) {
          const adjusted = profile.minimumPayment * (account.dtiPercentage / 100);
          const amount = Math.round(adjusted * 100) / 100;
          creditPaymentsTotal += adjusted;
          debtComponents.push({ name: account.name, amount, type: "credit", ...(account.dtiPercentage !== 100 && { dtiPercentage: account.dtiPercentage }) });
        }
      }
    }),
  );

  // 3. Bills that represent debt obligations, frequency-normalized.
  //    Include bills linked to a debt-bearing account (Credit/Loan/RealEstate).
  //    Skip bills whose accountId matches an account that already
  //    contributed a monthlyPayment above (avoid double-counting).
  const allBills = await listBills({ isActive: true });

  const debtAccountIds = new Set(
    allAccounts
      .filter((a) =>
        a.type === AccountType.Loan ||
        a.type === AccountType.RealEstate,
      )
      .map((a) => a.id),
  );

  // Build lookup for DTI percentage by account ID
  const accountDtiPctMap = new Map<string, number>();
  for (const a of allAccounts) {
    accountDtiPctMap.set(a.id, a.dtiPercentage);
  }

  let billDebtTotal = 0;
  for (const bill of allBills) {
    // Skip bills already captured via loan profile monthlyPayment
    if (bill.accountId && loanAccountIdsWithPayment.has(bill.accountId)) continue;

    if (bill.accountId && debtAccountIds.has(bill.accountId)) {
      const monthly = bill.amount * frequencyToMonthlyMultiplier(bill.frequency);
      const dtiPct = accountDtiPctMap.get(bill.accountId) ?? 100;
      const adjusted = monthly * (dtiPct / 100);
      billDebtTotal += adjusted;
      debtComponents.push({
        name: bill.name,
        amount: Math.round(adjusted * 100) / 100,
        type: "bill",
        ...(dtiPct !== 100 && { dtiPercentage: dtiPct }),
      });
    }
  }

  const monthlyDebtPayments = Math.round((loanPaymentsTotal + creditPaymentsTotal + billDebtTotal) * 100) / 100;

  // 3. Gross monthly income (same logic as projections: manual sources preferred)
  const [manualIncome, detectedIncome] = await Promise.all([
    listIncomeSources({ isActive: true }),
    detectIncomePatterns(),
  ]);

  if (manualIncome.length > 0) {
    for (const src of manualIncome) {
      const monthly = src.amount * frequencyToMonthlyMultiplier(src.frequency);
      incomeComponents.push({
        name: src.name,
        amount: Math.round(monthly * 100) / 100,
        type: "manual",
      });
    }
  } else {
    for (const pattern of detectedIncome) {
      incomeComponents.push({
        name: pattern.description,
        amount: Math.round(pattern.monthlyEquivalent * 100) / 100,
        type: "detected",
      });
    }
  }

  const grossMonthlyIncome = Math.round(
    incomeComponents.reduce((s, c) => s + c.amount, 0) * 100,
  ) / 100;

  // 4. Compute ratio
  const ratio = grossMonthlyIncome > 0
    ? Math.round((monthlyDebtPayments / grossMonthlyIncome) * 1000) / 10
    : 0;

  // Sort components by amount descending
  debtComponents.sort((a, b) => b.amount - a.amount);
  incomeComponents.sort((a, b) => b.amount - a.amount);

  return { ratio, monthlyDebtPayments, grossMonthlyIncome, debtComponents, incomeComponents };
}
