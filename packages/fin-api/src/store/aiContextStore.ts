import { createHash } from "node:crypto";
import type { AiInsightScope } from "@derekentringer/shared";
import { computeNetWorthSummary, computeSpendingSummary, computeDTI } from "./dashboardStore.js";
import { computeGoalProgress } from "./goalProgressStore.js";
import { getActiveBudgetsForMonth } from "./budgetStore.js";
import { listAccounts } from "./accountStore.js";

export interface ScopedContext {
  scope: AiInsightScope;
  data: Record<string, unknown>;
  contentHash: string;
}

function hashData(data: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getPreviousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function buildDashboardContext(userId: string): Promise<ScopedContext> {
  const currentMonth = getCurrentMonth();
  const prevMonth = getPreviousMonth(currentMonth);

  const [netWorth, spending, prevSpending, dti, goalProgress] = await Promise.all([
    computeNetWorthSummary(userId),
    computeSpendingSummary(userId, currentMonth),
    computeSpendingSummary(userId, prevMonth),
    computeDTI(userId),
    computeGoalProgress(userId, { months: 12 }),
  ]);

  const data: Record<string, unknown> = {
    netWorth: {
      totalAssets: netWorth.totalAssets,
      totalLiabilities: netWorth.totalLiabilities,
      netWorth: netWorth.netWorth,
    },
    currentMonthSpending: {
      total: spending.total,
      topCategories: spending.categories.slice(0, 5).map((c) => ({
        category: c.category,
        amount: c.amount,
        percentage: c.percentage,
      })),
    },
    previousMonthSpending: {
      total: prevSpending.total,
      topCategories: prevSpending.categories.slice(0, 5).map((c) => ({
        category: c.category,
        amount: c.amount,
      })),
    },
    dti: { ratio: dti.ratio },
    goals: goalProgress.goals.map((g) => ({
      name: g.goalName,
      type: g.goalType,
      percentComplete: g.percentComplete,
      onTrack: g.onTrack,
      targetAmount: g.targetAmount,
      currentAmount: g.currentAmount,
    })),
    monthlySurplus: goalProgress.monthlySurplus,
  };

  return { scope: "dashboard", data, contentHash: hashData(data) };
}

export async function buildBudgetContext(userId: string): Promise<ScopedContext> {
  const currentMonth = getCurrentMonth();
  const prevMonth = getPreviousMonth(currentMonth);
  const twoMonthsAgo = getPreviousMonth(prevMonth);

  const [budgets, spending, prevSpending, olderSpending] = await Promise.all([
    getActiveBudgetsForMonth(userId, currentMonth),
    computeSpendingSummary(userId, currentMonth),
    computeSpendingSummary(userId, prevMonth),
    computeSpendingSummary(userId, twoMonthsAgo),
  ]);

  const data: Record<string, unknown> = {
    budgets: budgets.map((b) => ({
      category: b.category,
      amount: b.amount,
    })),
    currentSpending: spending.categories.map((c) => ({
      category: c.category,
      amount: c.amount,
    })),
    prevSpending: prevSpending.categories.map((c) => ({
      category: c.category,
      amount: c.amount,
    })),
    olderSpending: olderSpending.categories.map((c) => ({
      category: c.category,
      amount: c.amount,
    })),
    currentTotal: spending.total,
  };

  return { scope: "budget", data, contentHash: hashData(data) };
}

export async function buildGoalsContext(userId: string): Promise<ScopedContext> {
  const goalProgress = await computeGoalProgress(userId, { months: 60 });

  const data: Record<string, unknown> = {
    goals: goalProgress.goals.map((g) => ({
      name: g.goalName,
      type: g.goalType,
      targetAmount: g.targetAmount,
      currentAmount: g.currentAmount,
      percentComplete: g.percentComplete,
      onTrack: g.onTrack,
      targetDate: g.targetDate,
      projectedCompletionDate: g.projectedCompletionDate,
      monthlyContribution: g.monthlyContribution,
    })),
    monthlySurplus: goalProgress.monthlySurplus,
    monthlyIncome: goalProgress.monthlyIncome,
    monthlyExpenses: goalProgress.monthlyExpenses,
  };

  return { scope: "goals", data, contentHash: hashData(data) };
}

export async function buildAccountsContext(userId: string): Promise<ScopedContext> {
  const accounts = await listAccounts(userId, { isActive: true });

  const data: Record<string, unknown> = {
    accounts: accounts.map((a) => ({
      name: a.name,
      type: a.type,
      balance: a.currentBalance,
      interestRate: a.interestRate,
    })),
  };

  return { scope: "accounts", data, contentHash: hashData(data) };
}

export async function buildMonthlyDigestContext(userId: string, month: string): Promise<ScopedContext> {
  const prevMonth = getPreviousMonth(month);

  const [spending, prevSpending, netWorth, budgets, goalProgress] = await Promise.all([
    computeSpendingSummary(userId, month),
    computeSpendingSummary(userId, prevMonth),
    computeNetWorthSummary(userId),
    getActiveBudgetsForMonth(userId, month),
    computeGoalProgress(userId, { months: 12 }),
  ]);

  const spendingByCategory = new Map(spending.categories.map((c) => [c.category, c.amount]));
  const budgetAdherence = budgets.map((b) => ({
    category: b.category,
    budgeted: b.amount,
    actual: spendingByCategory.get(b.category) ?? 0,
  }));

  const data: Record<string, unknown> = {
    month,
    spending: spending.categories.slice(0, 10).map((c) => ({
      category: c.category,
      amount: c.amount,
      percentage: c.percentage,
    })),
    spendingTotal: spending.total,
    prevSpendingTotal: prevSpending.total,
    netWorth: {
      totalAssets: netWorth.totalAssets,
      totalLiabilities: netWorth.totalLiabilities,
      netWorth: netWorth.netWorth,
    },
    budgetAdherence,
    goals: goalProgress.goals.map((g) => ({
      name: g.goalName,
      percentComplete: g.percentComplete,
      onTrack: g.onTrack,
    })),
  };

  return { scope: "monthly-digest", data, contentHash: hashData(data) };
}

export async function buildQuarterlyDigestContext(userId: string, quarter: string): Promise<ScopedContext> {
  // quarter format: "YYYY-Q#" e.g. "2026-Q1"
  const [yearStr, qStr] = quarter.split("-Q");
  const year = parseInt(yearStr, 10);
  const q = parseInt(qStr, 10);
  const startMonth = (q - 1) * 3 + 1;

  const months = [
    `${year}-${String(startMonth).padStart(2, "0")}`,
    `${year}-${String(startMonth + 1).padStart(2, "0")}`,
    `${year}-${String(startMonth + 2).padStart(2, "0")}`,
  ];

  const [s1, s2, s3, netWorth, goalProgress] = await Promise.all([
    computeSpendingSummary(userId, months[0]),
    computeSpendingSummary(userId, months[1]),
    computeSpendingSummary(userId, months[2]),
    computeNetWorthSummary(userId),
    computeGoalProgress(userId, { months: 12 }),
  ]);

  const data: Record<string, unknown> = {
    quarter,
    monthlySpending: [
      { month: months[0], total: s1.total, categories: s1.categories.slice(0, 5) },
      { month: months[1], total: s2.total, categories: s2.categories.slice(0, 5) },
      { month: months[2], total: s3.total, categories: s3.categories.slice(0, 5) },
    ],
    netWorth: { netWorth: netWorth.netWorth },
    goals: goalProgress.goals.map((g) => ({
      name: g.goalName,
      percentComplete: g.percentComplete,
      onTrack: g.onTrack,
    })),
  };

  return { scope: "quarterly-digest", data, contentHash: hashData(data) };
}

export async function buildAlertsContext(userId: string): Promise<ScopedContext> {
  const currentMonth = getCurrentMonth();

  const [netWorth, spending, accounts, goalProgress] = await Promise.all([
    computeNetWorthSummary(userId),
    computeSpendingSummary(userId, currentMonth),
    listAccounts(userId, { isActive: true }),
    computeGoalProgress(userId, { months: 12 }),
  ]);

  const data: Record<string, unknown> = {
    netWorth: { netWorth: netWorth.netWorth },
    spending: {
      total: spending.total,
      topCategories: spending.categories.slice(0, 5),
    },
    accountBalances: accounts.map((a) => ({
      name: a.name,
      type: a.type,
      balance: a.currentBalance,
    })),
    goals: goalProgress.goals.map((g) => ({
      name: g.goalName,
      onTrack: g.onTrack,
      percentComplete: g.percentComplete,
    })),
  };

  return { scope: "alerts", data, contentHash: hashData(data) };
}

export async function buildContextForScope(
  userId: string,
  scope: AiInsightScope,
  options?: { month?: string; quarter?: string },
): Promise<ScopedContext> {
  switch (scope) {
    case "dashboard":
      return buildDashboardContext(userId);
    case "budget":
      return buildBudgetContext(userId);
    case "goals":
      return buildGoalsContext(userId);
    case "accounts":
      return buildAccountsContext(userId);
    case "spending":
      return buildDashboardContext(userId); // reuse dashboard context for spending page
    case "projections":
      return buildDashboardContext(userId);
    case "decision-tools":
      return buildDashboardContext(userId);
    case "monthly-digest":
      return buildMonthlyDigestContext(userId, options?.month ?? getCurrentMonth());
    case "quarterly-digest": {
      const now = new Date();
      const defaultQuarter = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;
      return buildQuarterlyDigestContext(userId, options?.quarter ?? defaultQuarter);
    }
    case "alerts":
      return buildAlertsContext(userId);
    default:
      return buildDashboardContext(userId);
  }
}
