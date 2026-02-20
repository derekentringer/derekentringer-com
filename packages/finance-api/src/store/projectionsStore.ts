import type {
  DetectedIncomePattern,
  Frequency,
  NetIncomeProjectionResponse,
  SavingsProjectionResponse,
  SavingsProjectionPoint,
  SavingsAccountSummary,
  AccountProjectionLine,
  AccountProjectionPoint,
  AccountProjectionsResponse,
} from "@derekentringer/shared";
import { AccountType, classifyAccountType } from "@derekentringer/shared";
import { getPrisma } from "../lib/prisma.js";
import { decryptNumber, decryptField } from "../lib/encryption.js";
import {
  decryptAccount,
  decryptSavingsProfile,
  decryptInvestmentProfile,
  decryptLoanProfile,
} from "../lib/mappers.js";
import { listAccounts } from "./accountStore.js";
import { listIncomeSources } from "./incomeSourceStore.js";
import { listBills } from "./billStore.js";
import { getActiveBudgetsForMonth } from "./budgetStore.js";

// ─── Constants ──────────────────────────────────────────────────────────────

const INCOME_DETECTION_MIN_AMOUNT = 25;
const INCOME_DETECTION_MIN_OCCURRENCES = 3;
const INCOME_DETECTION_LOOKBACK_MONTHS = 6;
const EXPENSE_LOOKBACK_MONTHS = 3;

// Patterns that indicate self-transfers, not real income
const TRANSFER_PATTERN =
  /transfer|xfer|zelle|venmo|cashapp|paypal.*transfer|ach.*(?:from|to) (?:savings|checking)|internal/i;

// ─── Helpers ────────────────────────────────────────────────────────────────

function frequencyToMonthlyMultiplier(freq: Frequency): number {
  switch (freq) {
    case "weekly":
      return 52 / 12;
    case "biweekly":
      return 26 / 12;
    case "monthly":
      return 1;
    case "quarterly":
      return 1 / 3;
    case "yearly":
      return 1 / 12;
    default:
      return 1;
  }
}

function formatMonth(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function normalizeDescription(desc: string): string {
  return desc
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^A-Z0-9 ]/g, "");
}

/**
 * Count the number of distinct YYYY-MM months present in a set of dates.
 * Returns at least 1 to avoid division by zero.
 */
function countDistinctMonths(dates: Date[]): number {
  const months = new Set<string>();
  for (const d of dates) {
    months.add(`${d.getFullYear()}-${d.getMonth()}`);
  }
  return Math.max(1, months.size);
}

// ─── Income Detection ───────────────────────────────────────────────────────

export async function detectIncomePatterns(
  lookbackMonths = INCOME_DETECTION_LOOKBACK_MONTHS,
): Promise<DetectedIncomePattern[]> {
  const prisma = getPrisma();
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - lookbackMonths);

  const rows = await prisma.transaction.findMany({
    where: {
      date: { gte: cutoff },
    },
    orderBy: { date: "asc" },
  });

  // Decrypt and filter positive transactions above threshold, excluding transfers
  const transactions: Array<{
    description: string;
    amount: number;
    date: Date;
  }> = [];

  for (const row of rows) {
    const amount = decryptNumber(row.amount);
    if (amount <= INCOME_DETECTION_MIN_AMOUNT) continue;

    const description = decryptField(row.description);
    if (TRANSFER_PATTERN.test(description)) continue;

    transactions.push({ description, amount, date: row.date });
  }

  // Group by normalized description
  const groups = new Map<
    string,
    Array<{ amount: number; date: Date; description: string }>
  >();

  for (const t of transactions) {
    const key = normalizeDescription(t.description);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const patterns: DetectedIncomePattern[] = [];

  for (const [, txns] of groups) {
    if (txns.length < INCOME_DETECTION_MIN_OCCURRENCES) continue;

    // Sort by date
    txns.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Calculate average amount
    const totalAmount = txns.reduce((s, t) => s + t.amount, 0);
    const averageAmount = totalAmount / txns.length;

    // Detect frequency from average days between occurrences
    let totalDays = 0;
    for (let i = 1; i < txns.length; i++) {
      totalDays +=
        (txns[i].date.getTime() - txns[i - 1].date.getTime()) /
        (1000 * 60 * 60 * 24);
    }
    const avgDays = totalDays / (txns.length - 1);

    let frequency: Frequency;
    if (avgDays <= 10) frequency = "weekly";
    else if (avgDays <= 18) frequency = "biweekly";
    else if (avgDays <= 45) frequency = "monthly";
    else if (avgDays <= 100) frequency = "quarterly";
    else frequency = "yearly";

    const monthlyEquivalent =
      averageAmount * frequencyToMonthlyMultiplier(frequency);

    patterns.push({
      description: txns[0].description,
      averageAmount: Math.round(averageAmount * 100) / 100,
      frequency,
      monthlyEquivalent: Math.round(monthlyEquivalent * 100) / 100,
      occurrences: txns.length,
      lastSeen: txns[txns.length - 1].date.toISOString(),
    });
  }

  // Sort by monthlyEquivalent descending
  patterns.sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent);

  return patterns;
}

// ─── Net Income Projection ──────────────────────────────────────────────────

export async function computeNetIncomeProjection(params: {
  months: number;
  incomeAdjustmentPct: number;
  expenseAdjustmentPct: number;
}): Promise<NetIncomeProjectionResponse> {
  const { months, incomeAdjustmentPct, expenseAdjustmentPct } = params;

  const now = new Date();
  const currentMonth = formatMonth(now);

  const [detectedIncome, manualIncome, activeBills, activeBudgets] = await Promise.all([
    detectIncomePatterns(),
    listIncomeSources({ isActive: true }),
    listBills({ isActive: true }),
    getActiveBudgetsForMonth(currentMonth),
  ]);

  // Monthly income from detected patterns
  const detectedMonthly = detectedIncome.reduce(
    (s, p) => s + p.monthlyEquivalent,
    0,
  );

  // Monthly income from manual sources
  const manualMonthly = manualIncome.reduce(
    (s, src) =>
      s + src.amount * frequencyToMonthlyMultiplier(src.frequency),
    0,
  );

  // H1 fix: when manual sources exist, only use manual for projection
  // (detected becomes informational only). Otherwise use detected.
  const totalMonthlyIncome =
    manualIncome.length > 0 ? manualMonthly : detectedMonthly;

  // Monthly expenses from bills
  const monthlyBillTotal = activeBills.reduce(
    (s, bill) =>
      s + bill.amount * frequencyToMonthlyMultiplier(bill.frequency),
    0,
  );

  // Monthly expenses from budgets
  const monthlyBudgetTotal = activeBudgets.reduce(
    (s, budget) => s + budget.amount,
    0,
  );

  // Expenses = bills + budgets
  const monthlyExpenses = monthlyBillTotal + monthlyBudgetTotal;

  // Apply adjustments
  const adjustedIncome =
    totalMonthlyIncome * (1 + incomeAdjustmentPct / 100);
  const adjustedExpenses =
    monthlyExpenses * (1 + expenseAdjustmentPct / 100);

  // Project forward (cumulative)
  const projection = [];
  let cumulativeIncome = 0;
  let cumulativeExpenses = 0;
  for (let i = 0; i < months; i++) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
    cumulativeIncome += adjustedIncome;
    cumulativeExpenses += adjustedExpenses;
    const netIncome = cumulativeIncome - cumulativeExpenses;
    projection.push({
      month: formatMonth(monthDate),
      income: Math.round(cumulativeIncome * 100) / 100,
      expenses: Math.round(cumulativeExpenses * 100) / 100,
      netIncome: Math.round(netIncome * 100) / 100,
    });
  }

  return {
    detectedIncome,
    manualIncome,
    monthlyIncome: Math.round(totalMonthlyIncome * 100) / 100,
    monthlyExpenses: Math.round(monthlyExpenses * 100) / 100,
    monthlyBillTotal: Math.round(monthlyBillTotal * 100) / 100,
    monthlyBudgetTotal: Math.round(monthlyBudgetTotal * 100) / 100,
    projection,
  };
}

// ─── Account Balance Projections ─────────────────────────────────────────────

export async function computeAccountProjections(params: {
  months: number;
  incomeAdjustmentPct: number;
  expenseAdjustmentPct: number;
}): Promise<AccountProjectionsResponse> {
  const { months, incomeAdjustmentPct, expenseAdjustmentPct } = params;
  const prisma = getPrisma();
  const now = new Date();

  // Fetch all active accounts (already decrypted)
  const allAccounts = await listAccounts({ isActive: true });
  const EXCLUDED_NAMES = new Set(["Robinhood"]);
  const accounts = allAccounts.filter(
    (a) =>
      a.type !== AccountType.RealEstate &&
      !EXCLUDED_NAMES.has(a.name),
  );

  // Compute checking net cash flow (reuse income/expense logic)
  const currentMonth = formatMonth(now);
  const [detectedIncome, manualIncome, activeBills, activeBudgets] = await Promise.all([
    detectIncomePatterns(),
    listIncomeSources({ isActive: true }),
    listBills({ isActive: true }),
    getActiveBudgetsForMonth(currentMonth),
  ]);

  const detectedMonthly = detectedIncome.reduce(
    (s, p) => s + p.monthlyEquivalent,
    0,
  );
  const manualMonthly = manualIncome.reduce(
    (s, src) =>
      s + src.amount * frequencyToMonthlyMultiplier(src.frequency),
    0,
  );
  const totalMonthlyIncome =
    manualIncome.length > 0 ? manualMonthly : detectedMonthly;

  const monthlyBillTotal = activeBills.reduce(
    (s, bill) =>
      s + bill.amount * frequencyToMonthlyMultiplier(bill.frequency),
    0,
  );

  const monthlyBudgetTotal = activeBudgets.reduce(
    (s, budget) => s + budget.amount,
    0,
  );

  // Expenses = bills + budgets
  const monthlyExpenses = monthlyBillTotal + monthlyBudgetTotal;

  const adjustedIncome =
    totalMonthlyIncome * (1 + incomeAdjustmentPct / 100);
  const adjustedExpenses =
    monthlyExpenses * (1 + expenseAdjustmentPct / 100);
  const checkingNetCashFlow = adjustedIncome - adjustedExpenses;

  // Per-account projection
  const contribCutoff = new Date();
  contribCutoff.setMonth(contribCutoff.getMonth() - EXPENSE_LOOKBACK_MONTHS);

  const accountLines: AccountProjectionLine[] = await Promise.all(
    accounts.map(async (account) => {
      // Fetch latest balance with profile data + recent transactions in parallel
      const [latestBalance, txns] = await Promise.all([
        prisma.balance.findFirst({
          where: { accountId: account.id },
          orderBy: { date: "desc" },
          include: {
            savingsProfile: true,
            investmentProfile: true,
            loanProfile: true,
          },
        }),
        prisma.transaction.findMany({
          where: {
            accountId: account.id,
            date: { gte: contribCutoff },
          },
        }),
      ]);

      const currentBalance = account.currentBalance;
      const projection: AccountProjectionPoint[] = [];
      let balance = currentBalance;
      let monthlyChange = 0;

      switch (account.type) {
        case AccountType.Checking: {
          // Net cash flow from income - expenses
          monthlyChange = checkingNetCashFlow;
          for (let i = 0; i < months; i++) {
            const monthDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
            if (i > 0) balance += checkingNetCashFlow;
            projection.push({
              month: formatMonth(monthDate),
              balance: Math.round(balance * 100) / 100,
            });
          }
          break;
        }
        case AccountType.Savings:
        case AccountType.HighYieldSavings: {
          // Compound interest + monthly contribution
          let apy = 0;
          if (latestBalance?.savingsProfile) {
            const profile = decryptSavingsProfile(latestBalance.savingsProfile);
            apy = profile.apy ?? account.interestRate ?? 0;
          } else {
            apy = account.interestRate ?? 0;
          }
          const monthlyRate = apy / 100 / 12;

          // Estimate monthly contribution from positive transactions
          let positiveTotal = 0;
          const positiveDates: Date[] = [];
          for (const row of txns) {
            const amount = decryptNumber(row.amount);
            if (amount > 0) {
              positiveTotal += amount;
              positiveDates.push(row.date);
            }
          }
          const contribMonths = countDistinctMonths(positiveDates);
          const monthlyContribution = positiveTotal / contribMonths;
          monthlyChange = balance * monthlyRate + monthlyContribution;

          for (let i = 0; i < months; i++) {
            const monthDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
            if (i > 0) {
              const interest = balance * monthlyRate;
              balance += interest + monthlyContribution;
            }
            projection.push({
              month: formatMonth(monthDate),
              balance: Math.round(balance * 100) / 100,
            });
          }
          break;
        }
        case AccountType.Investment: {
          // Compound return + monthly contribution
          let ror = 0;
          if (latestBalance?.investmentProfile) {
            const profile = decryptInvestmentProfile(latestBalance.investmentProfile);
            ror = profile.rateOfReturn ?? 0;
          }
          const monthlyRoR = ror / 100 / 12;

          // Estimate monthly contribution from positive transactions
          let positiveTotal = 0;
          const positiveDates: Date[] = [];
          for (const row of txns) {
            const amount = decryptNumber(row.amount);
            if (amount > 0) {
              positiveTotal += amount;
              positiveDates.push(row.date);
            }
          }
          const contribMonths = countDistinctMonths(positiveDates);
          const monthlyContribution = positiveTotal / contribMonths;
          monthlyChange = balance * monthlyRoR + monthlyContribution;

          for (let i = 0; i < months; i++) {
            const monthDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
            if (i > 0) {
              const growth = balance * monthlyRoR;
              balance += growth + monthlyContribution;
            }
            projection.push({
              month: formatMonth(monthDate),
              balance: Math.round(balance * 100) / 100,
            });
          }
          break;
        }
        case AccountType.Credit: {
          // Average monthly net change from last 3mo transactions
          let netTotal = 0;
          const txnDates: Date[] = [];
          for (const row of txns) {
            const amount = decryptNumber(row.amount);
            netTotal += amount;
            txnDates.push(row.date);
          }
          const txnMonths = countDistinctMonths(txnDates);
          const monthlyNetChange = netTotal / txnMonths;
          monthlyChange = monthlyNetChange;

          for (let i = 0; i < months; i++) {
            const monthDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
            if (i > 0) {
              balance += monthlyNetChange;
              if (balance < 0) balance = 0; // credit balance can't go negative (fully paid off)
            }
            projection.push({
              month: formatMonth(monthDate),
              balance: Math.round(balance * 100) / 100,
            });
          }
          break;
        }
        case AccountType.Loan: {
          // Amortization: interest accrues, principal portion reduces balance
          let loanRate = account.interestRate ?? 0;
          let monthlyPayment = 0;
          if (latestBalance?.loanProfile) {
            const profile = decryptLoanProfile(latestBalance.loanProfile);
            if (profile.interestRate !== undefined) loanRate = profile.interestRate;
            if (profile.monthlyPayment !== undefined) monthlyPayment = profile.monthlyPayment;
          }
          const monthlyLoanRate = loanRate / 100 / 12;
          monthlyChange = monthlyPayment > 0 ? -monthlyPayment : 0;

          for (let i = 0; i < months; i++) {
            const monthDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
            if (i > 0 && balance > 0 && monthlyPayment > 0) {
              const interest = balance * monthlyLoanRate;
              const principal = Math.min(monthlyPayment - interest, balance);
              balance -= principal;
              if (balance < 0) balance = 0;
            }
            projection.push({
              month: formatMonth(monthDate),
              balance: Math.round(balance * 100) / 100,
            });
          }
          break;
        }
        default: {
          // Other — flat
          monthlyChange = 0;
          for (let i = 0; i < months; i++) {
            const monthDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
            projection.push({
              month: formatMonth(monthDate),
              balance: Math.round(currentBalance * 100) / 100,
            });
          }
          break;
        }
      }

      return {
        accountId: account.id,
        accountName: account.name,
        accountType: account.type,
        currentBalance,
        monthlyChange: Math.round(monthlyChange * 100) / 100,
        isFavorite: account.isFavorite,
        projection,
      } satisfies AccountProjectionLine;
    }),
  );

  // Compute overall line: sum balances (liabilities subtracted)
  const overall: AccountProjectionPoint[] = [];
  for (let i = 0; i < months; i++) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
    let total = 0;
    for (const line of accountLines) {
      const bal = line.projection[i]?.balance ?? 0;
      const classification = classifyAccountType(line.accountType);
      if (classification === "liability") {
        total -= bal;
      } else {
        total += bal;
      }
    }
    overall.push({
      month: formatMonth(monthDate),
      balance: Math.round(total * 100) / 100,
    });
  }

  return { accounts: accountLines, overall };
}

// ─── Savings Projection ─────────────────────────────────────────────────────

export async function computeSavingsProjection(params: {
  accountId: string;
  months: number;
  contributionOverride?: number;
  apyOverride?: number;
}): Promise<SavingsProjectionResponse | null> {
  const { accountId, months, contributionOverride, apyOverride } = params;
  const prisma = getPrisma();

  // Fetch the account
  const accountRow = await prisma.account.findUnique({
    where: { id: accountId },
  });
  if (!accountRow) return null;

  const account = decryptAccount(accountRow);
  if (
    account.type !== AccountType.Savings &&
    account.type !== AccountType.HighYieldSavings
  ) {
    return null;
  }

  // Get APY
  let apy = 0;
  if (apyOverride !== undefined) {
    apy = apyOverride;
  } else {
    // Look for latest SavingsProfile
    const latestBalance = await prisma.balance.findFirst({
      where: { accountId },
      orderBy: { date: "desc" },
      include: { savingsProfile: true },
    });
    if (latestBalance?.savingsProfile) {
      const profile = decryptSavingsProfile(latestBalance.savingsProfile);
      if (profile.apy !== undefined) {
        apy = profile.apy;
      } else if (account.interestRate !== undefined) {
        apy = account.interestRate;
      }
    } else if (account.interestRate !== undefined) {
      apy = account.interestRate;
    }
  }

  // Get monthly contribution
  let monthlyContribution = 0;
  if (contributionOverride !== undefined) {
    monthlyContribution = contributionOverride;
  } else {
    const contribCutoff = new Date();
    contribCutoff.setMonth(contribCutoff.getMonth() - EXPENSE_LOOKBACK_MONTHS);

    const txns = await prisma.transaction.findMany({
      where: {
        accountId,
        date: { gte: contribCutoff },
      },
    });

    let positiveTotal = 0;
    const positiveDates: Date[] = [];
    for (const row of txns) {
      const amount = decryptNumber(row.amount);
      if (amount > 0) {
        positiveTotal += amount;
        positiveDates.push(row.date);
      }
    }
    const contribMonths = countDistinctMonths(positiveDates);
    monthlyContribution = positiveTotal / contribMonths;
  }

  const currentBalance = account.currentBalance;
  const monthlyRate = apy / 100 / 12;

  // Compound monthly
  let balance = currentBalance;
  let cumulativeInterest = 0;
  let cumulativeContributions = 0;
  const projection: SavingsProjectionPoint[] = [];
  const now = new Date();

  for (let i = 0; i < months; i++) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const interest = balance * monthlyRate;
    balance += interest + monthlyContribution;
    cumulativeInterest += interest;
    cumulativeContributions += monthlyContribution;

    projection.push({
      month: formatMonth(monthDate),
      balance: Math.round(balance * 100) / 100,
      principal:
        Math.round(
          (currentBalance + cumulativeContributions) * 100,
        ) / 100,
      interest: Math.round(cumulativeInterest * 100) / 100,
    });
  }

  // Generate dynamic milestones (>= so exact matches are not skipped)
  let targets: number[];
  if (currentBalance < 1000) {
    targets = [1000, 5000, 10000];
  } else if (currentBalance < 10000) {
    targets = [10000, 25000, 50000];
  } else if (currentBalance < 100000) {
    targets = [25000, 50000, 100000];
  } else {
    targets = [250000, 500000, 1000000];
  }

  const milestones = targets
    .filter((t) => t >= currentBalance)
    .map((targetAmount) => {
      const point = projection.find((p) => p.balance >= targetAmount);
      return {
        targetAmount,
        targetDate: point ? point.month : null,
      };
    });

  const accountSummary: SavingsAccountSummary = {
    accountId: account.id,
    accountName: account.name,
    accountType: account.type,
    currentBalance,
    apy,
    isFavorite: account.isFavorite,
    estimatedMonthlyContribution:
      Math.round(monthlyContribution * 100) / 100,
  };

  return {
    account: accountSummary,
    projection,
    milestones,
  };
}

// ─── Savings Account List ───────────────────────────────────────────────────

export async function listSavingsAccounts(): Promise<SavingsAccountSummary[]> {
  const prisma = getPrisma();

  const accountRows = await prisma.account.findMany({
    where: {
      isActive: true,
      type: { in: ["savings", "high_yield_savings"] },
    },
  });

  // H2 fix: parallelize per-account queries instead of sequential N+1
  const results = await Promise.all(
    accountRows.map(async (row) => {
      const account = decryptAccount(row);

      // Get latest balance with savingsProfile + recent transactions in parallel
      const contribCutoff = new Date();
      contribCutoff.setMonth(
        contribCutoff.getMonth() - EXPENSE_LOOKBACK_MONTHS,
      );

      const [latestBalance, txns] = await Promise.all([
        prisma.balance.findFirst({
          where: { accountId: account.id },
          orderBy: { date: "desc" },
          include: { savingsProfile: true },
        }),
        prisma.transaction.findMany({
          where: {
            accountId: account.id,
            date: { gte: contribCutoff },
          },
        }),
      ]);

      // Resolve APY
      let apy = 0;
      if (latestBalance?.savingsProfile) {
        const profile = decryptSavingsProfile(latestBalance.savingsProfile);
        if (profile.apy !== undefined) {
          apy = profile.apy;
        } else if (account.interestRate !== undefined) {
          apy = account.interestRate;
        }
      } else if (account.interestRate !== undefined) {
        apy = account.interestRate;
      }

      // Estimate monthly contribution
      let positiveTotal = 0;
      const positiveDates: Date[] = [];
      for (const txn of txns) {
        const amount = decryptNumber(txn.amount);
        if (amount > 0) {
          positiveTotal += amount;
          positiveDates.push(txn.date);
        }
      }
      const contribMonths = countDistinctMonths(positiveDates);
      const estimatedMonthlyContribution = positiveTotal / contribMonths;

      return {
        accountId: account.id,
        accountName: account.name,
        accountType: account.type,
        currentBalance: account.currentBalance,
        apy,
        isFavorite: account.isFavorite,
        estimatedMonthlyContribution:
          Math.round(estimatedMonthlyContribution * 100) / 100,
      } satisfies SavingsAccountSummary;
    }),
  );

  return results;
}
