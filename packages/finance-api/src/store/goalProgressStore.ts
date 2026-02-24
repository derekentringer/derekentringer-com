import type {
  GoalProgress,
  GoalProgressResponse,
  GoalProgressPoint,
  Goal,
  SavingsAccountSummary,
  DebtAccountSummary,
} from "@derekentringer/shared";
import { listGoals } from "./goalStore.js";
import { listIncomeSources } from "./incomeSourceStore.js";
import { listBills } from "./billStore.js";
import { getActiveBudgetsForMonth } from "./budgetStore.js";
import { computeNetWorthSummary } from "./dashboardStore.js";
import {
  frequencyToMonthlyMultiplier,
  detectIncomePatterns,
  listSavingsAccounts,
  listDebtAccounts,
  computeDebtPayoffStrategy,
  computeAccountProjections,
} from "./projectionsStore.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatMonth(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Parse "YYYY-MM-DD" as local time (avoids UTC midnight shifting to previous day). */
function parseLocalDate(dateStr: string): { year: number; month: number } {
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(5, 7)) - 1; // 0-indexed
  return { year, month };
}

/**
 * If the goal has a startDate, prepend interpolated historical months
 * so the chart can show a colored "actual" line from start to now.
 */
function prependHistory(
  projection: GoalProgressPoint[],
  goal: Goal,
  currentValue: number,
): GoalProgressPoint[] {
  if (!goal.startDate || projection.length === 0) return projection;

  const now = new Date();
  const { year: startYear, month: startMonth } = parseLocalDate(goal.startDate);
  const startAmount = goal.startAmount ?? 0;

  const monthsDiff =
    (now.getFullYear() - startYear) * 12 +
    (now.getMonth() - startMonth);

  if (monthsDiff <= 0) return projection;

  const target = projection[0].target;
  const historical: GoalProgressPoint[] = [];

  for (let i = 0; i < monthsDiff; i++) {
    const monthDate = new Date(startYear, startMonth + i, 1);
    const t = i / monthsDiff;
    const interpolated = startAmount + (currentValue - startAmount) * t;

    historical.push({
      month: formatMonth(monthDate),
      projected: round2(interpolated),
      actual: round2(interpolated),
      target,
    });
  }

  // Mark the current month (first projection point) with actual value
  // and ensure projected matches so there's no gap between history and projection
  projection[0].actual = currentValue;
  projection[0].projected = currentValue;

  return [...historical, ...projection];
}

// ─── Monthly Financial Summary ──────────────────────────────────────────────

interface MonthlyFinancialSummary {
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyDebtMinimums: number;
  monthlySavingsContributions: number;
  monthlySurplus: number;
  netWorth: number;
  savingsAccounts: SavingsAccountSummary[];
  debtAccounts: DebtAccountSummary[];
}

async function computeMonthlyFinancialSummary(): Promise<MonthlyFinancialSummary> {
  const now = new Date();
  const currentMonth = formatMonth(now);

  const [
    detectedIncome,
    manualIncome,
    activeBills,
    activeBudgets,
    debtAccounts,
    savingsAccounts,
    netWorthSummary,
  ] = await Promise.all([
    detectIncomePatterns(),
    listIncomeSources({ isActive: true }),
    listBills({ isActive: true }),
    getActiveBudgetsForMonth(currentMonth),
    listDebtAccounts(true),
    listSavingsAccounts(),
    computeNetWorthSummary(),
  ]);

  // Monthly income
  const detectedMonthly = detectedIncome.reduce(
    (s, p) => s + p.monthlyEquivalent,
    0,
  );
  const manualMonthly = manualIncome.reduce(
    (s, src) => s + src.amount * frequencyToMonthlyMultiplier(src.frequency),
    0,
  );
  const monthlyIncome = manualIncome.length > 0 ? manualMonthly : detectedMonthly;

  // Monthly expenses from bills + budgets
  const monthlyBillTotal = activeBills.reduce(
    (s, bill) => s + bill.amount * frequencyToMonthlyMultiplier(bill.frequency),
    0,
  );
  const monthlyBudgetTotal = activeBudgets.reduce(
    (s, budget) => s + budget.amount,
    0,
  );
  const monthlyExpenses = monthlyBillTotal + monthlyBudgetTotal;

  // Debt minimums
  const monthlyDebtMinimums = debtAccounts.reduce(
    (s, d) => s + d.minimumPayment,
    0,
  );

  // Savings contributions
  const monthlySavingsContributions = savingsAccounts.reduce(
    (s, a) => s + a.estimatedMonthlyContribution,
    0,
  );

  const monthlySurplus = monthlyIncome - monthlyExpenses;

  return {
    monthlyIncome: round2(monthlyIncome),
    monthlyExpenses: round2(monthlyExpenses),
    monthlyDebtMinimums: round2(monthlyDebtMinimums),
    monthlySavingsContributions: round2(monthlySavingsContributions),
    monthlySurplus: round2(monthlySurplus),
    netWorth: netWorthSummary.netWorth,
    savingsAccounts,
    debtAccounts,
  };
}

// ─── Per-Goal Progress ──────────────────────────────────────────────────────

function computeSavingsGoalProgress(
  goal: Goal,
  savingsAccounts: SavingsAccountSummary[],
  months: number,
): GoalProgress {
  const now = new Date();

  // Filter to linked accounts
  const linked = goal.accountIds && goal.accountIds.length > 0
    ? savingsAccounts.filter((a) => goal.accountIds!.includes(a.accountId))
    : [];

  // Monthly contribution: user override > sum of linked account estimates
  const monthlyContribution = goal.monthlyContribution != null && goal.monthlyContribution > 0
    ? goal.monthlyContribution
    : linked.reduce((s, a) => s + a.estimatedMonthlyContribution, 0);

  // Current amount: manual override > linked accounts > estimate from start
  let currentAmount: number;
  if (goal.currentAmount !== undefined) {
    currentAmount = goal.currentAmount;
  } else if (linked.length > 0) {
    currentAmount = linked.reduce((s, a) => s + a.currentBalance, 0);
  } else if (goal.startDate && goal.startAmount != null && monthlyContribution > 0) {
    const { year: sy, month: sm } = parseLocalDate(goal.startDate);
    const monthsElapsed = (now.getFullYear() - sy) * 12 + (now.getMonth() - sm);
    currentAmount = goal.startAmount + monthlyContribution * Math.max(monthsElapsed, 0);
  } else {
    currentAmount = goal.startAmount ?? 0;
  }

  // Projection: compound interest + contributions per account
  const projection: GoalProgressPoint[] = [];
  let projectedCompletionDate: string | null = null;

  if (linked.length > 0) {
    // Track per-account balances for compound interest
    // Use goal.monthlyContribution to override per-account contributions
    const useGoalContrib = goal.monthlyContribution != null && goal.monthlyContribution > 0;
    const linkedTotalContrib = linked.reduce((s, a) => s + a.estimatedMonthlyContribution, 0);
    const accountBalances = linked.map((a) => ({
      balance: a.currentBalance,
      monthlyRate: a.apy / 100 / 12,
      monthlyContrib: useGoalContrib
        ? (linkedTotalContrib > 0
          ? goal.monthlyContribution! * (a.estimatedMonthlyContribution / linkedTotalContrib)
          : goal.monthlyContribution! / linked.length)
        : a.estimatedMonthlyContribution,
    }));

    for (let i = 0; i < months; i++) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() + i, 1);

      if (i > 0) {
        for (const ab of accountBalances) {
          const interest = ab.balance * ab.monthlyRate;
          ab.balance += interest + ab.monthlyContrib;
        }
      }
      const totalProjected = accountBalances.reduce((s, ab) => s + ab.balance, 0);

      projection.push({
        month: formatMonth(monthDate),
        projected: round2(totalProjected),
        target: goal.targetAmount,
      });

      if (!projectedCompletionDate && totalProjected >= goal.targetAmount) {
        projectedCompletionDate = formatMonth(monthDate);
      }
    }
  } else {
    // No linked accounts — project linear growth using monthlyContribution
    let projected = currentAmount;
    for (let i = 0; i < months; i++) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      if (i > 0) projected += monthlyContribution;

      projection.push({
        month: formatMonth(monthDate),
        projected: round2(projected),
        target: goal.targetAmount,
      });

      if (!projectedCompletionDate && projected >= goal.targetAmount) {
        projectedCompletionDate = formatMonth(monthDate);
      }
    }
  }

  // On track: projected completion on or before target date
  const onTrack = goal.targetDate
    ? projectedCompletionDate != null && projectedCompletionDate <= goal.targetDate.substring(0, 7)
    : projectedCompletionDate != null;

  const percentComplete = goal.targetAmount > 0
    ? round2(Math.min((currentAmount / goal.targetAmount) * 100, 100))
    : 0;

  return {
    goalId: goal.id,
    goalName: goal.name,
    goalType: goal.type,
    targetAmount: goal.targetAmount,
    currentAmount: round2(currentAmount),
    percentComplete,
    monthlyContribution: round2(monthlyContribution),
    targetDate: goal.targetDate ?? null,
    projectedCompletionDate,
    onTrack,
    projection: prependHistory(projection, goal, currentAmount),
  };
}

function computeDebtPayoffGoalProgress(
  goal: Goal,
  debtAccounts: DebtAccountSummary[],
  months: number,
): GoalProgress {
  const now = new Date();

  // Filter to linked accounts
  const linked = goal.accountIds && goal.accountIds.length > 0
    ? debtAccounts.filter((a) => goal.accountIds!.includes(a.accountId))
    : [];

  const totalRemainingBalance = linked.reduce((s, a) => s + a.currentBalance, 0);

  // Effective target = original debt amount for progress tracking
  // Prefer startAmount (original debt) over targetAmount (often auto-set to current balance)
  const effectiveTarget = goal.startAmount != null && goal.startAmount > 0
    ? goal.startAmount
    : goal.targetAmount > 0
      ? goal.targetAmount
      : totalRemainingBalance;

  // Current amount paid off: target minus remaining balance
  const currentAmount = goal.currentAmount !== undefined
    ? goal.currentAmount
    : Math.max(effectiveTarget - totalRemainingBalance, 0);

  // Monthly contribution: minimums + extraPayment
  const minimums = linked.reduce((s, a) => s + a.minimumPayment, 0);
  const extraPayment = goal.extraPayment ?? 0;
  const monthlyContribution = minimums + extraPayment;

  // Projection: use debt payoff strategy for linked accounts
  const projection: GoalProgressPoint[] = [];
  let projectedCompletionDate: string | null = null;

  if (linked.length > 0) {
    // With extra payment (projected payoff)
    const strategy = computeDebtPayoffStrategy(
      linked,
      extraPayment,
      "avalanche",
      undefined,
      months,
    );

    // Minimum payments only (baseline)
    const minimumOnlyStrategy = computeDebtPayoffStrategy(
      linked,
      0,
      "avalanche",
      undefined,
      months,
    );

    if (strategy.debtFreeDate) {
      projectedCompletionDate = strategy.debtFreeDate;
    }

    // Build a lookup for minimum-only schedule
    const minOnlyMap = new Map<string, number>();
    for (const pt of minimumOnlyStrategy.aggregateSchedule) {
      minOnlyMap.set(pt.month, pt.totalBalance);
    }

    // Build projection from aggregate schedule — show remaining balance decreasing toward $0
    for (let i = 0; i < months; i++) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthStr = formatMonth(monthDate);

      const aggPoint = strategy.aggregateSchedule.find((p) => p.month === monthStr);
      const remainingBalance = aggPoint ? aggPoint.totalBalance : 0;
      const minOnlyBalance = minOnlyMap.get(monthStr) ?? 0;

      projection.push({
        month: monthStr,
        projected: round2(Math.max(remainingBalance, 0)),
        minimumOnly: round2(Math.max(minOnlyBalance, 0)),
        target: 0,
      });
    }

    // Fill remaining months if strategy ended early (debt paid off)
    if (projection.length < months) {
      for (let i = projection.length; i < months; i++) {
        const monthDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
        projection.push({
          month: formatMonth(monthDate),
          projected: 0,
          minimumOnly: 0,
          target: 0,
        });
      }
    }
  } else {
    // No linked accounts — flat line at remaining balance
    for (let i = 0; i < months; i++) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      projection.push({
        month: formatMonth(monthDate),
        projected: round2(totalRemainingBalance),
        minimumOnly: round2(totalRemainingBalance),
        target: 0,
      });
    }
  }

  const onTrack = goal.targetDate
    ? projectedCompletionDate != null && projectedCompletionDate <= goal.targetDate.substring(0, 7)
    : projectedCompletionDate != null;

  const percentComplete = effectiveTarget > 0
    ? round2(Math.min((currentAmount / effectiveTarget) * 100, 100))
    : 0;

  return {
    goalId: goal.id,
    goalName: goal.name,
    goalType: goal.type,
    targetAmount: effectiveTarget,
    currentAmount: round2(currentAmount),
    percentComplete,
    monthlyContribution: round2(monthlyContribution),
    targetDate: goal.targetDate ?? null,
    projectedCompletionDate,
    onTrack,
    projection: prependHistory(projection, goal, totalRemainingBalance),
  };
}

async function computeNetWorthGoalProgress(
  goal: Goal,
  summary: MonthlyFinancialSummary,
  months: number,
): Promise<GoalProgress> {
  const now = new Date();
  const currentAmount = summary.netWorth;
  const monthlyContribution = summary.monthlySurplus;

  // Use account projections for net worth trajectory
  const projection: GoalProgressPoint[] = [];
  let projectedCompletionDate: string | null = null;

  try {
    const accountProjections = await computeAccountProjections({
      months,
      incomeAdjustmentPct: 0,
      expenseAdjustmentPct: 0,
    });

    for (const point of accountProjections.overall) {
      projection.push({
        month: point.month,
        projected: round2(point.balance),
        target: goal.targetAmount,
      });

      if (!projectedCompletionDate && point.balance >= goal.targetAmount) {
        projectedCompletionDate = point.month;
      }
    }
  } catch {
    // Fallback: linear projection
    let projected = currentAmount;
    for (let i = 0; i < months; i++) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      if (i > 0) projected += monthlyContribution;
      projection.push({
        month: formatMonth(monthDate),
        projected: round2(projected),
        target: goal.targetAmount,
      });
      if (!projectedCompletionDate && projected >= goal.targetAmount) {
        projectedCompletionDate = formatMonth(monthDate);
      }
    }
  }

  const onTrack = goal.targetDate
    ? projectedCompletionDate != null && projectedCompletionDate <= goal.targetDate.substring(0, 7)
    : projectedCompletionDate != null;

  const percentComplete = goal.targetAmount > 0
    ? round2(Math.min((currentAmount / goal.targetAmount) * 100, 100))
    : 0;

  return {
    goalId: goal.id,
    goalName: goal.name,
    goalType: goal.type,
    targetAmount: goal.targetAmount,
    currentAmount: round2(currentAmount),
    percentComplete,
    monthlyContribution: round2(monthlyContribution),
    targetDate: goal.targetDate ?? null,
    projectedCompletionDate,
    onTrack,
    projection: prependHistory(projection, goal, currentAmount),
  };
}

function computeCustomGoalProgress(
  goal: Goal,
  months: number,
): GoalProgress {
  const now = new Date();
  const monthlyContribution = goal.monthlyContribution != null && goal.monthlyContribution > 0
    ? goal.monthlyContribution
    : 0;

  let currentAmount: number;
  if (goal.currentAmount != null) {
    currentAmount = goal.currentAmount;
  } else if (goal.startDate && goal.startAmount != null && monthlyContribution > 0) {
    const { year: sy, month: sm } = parseLocalDate(goal.startDate);
    const monthsElapsed = (now.getFullYear() - sy) * 12 + (now.getMonth() - sm);
    currentAmount = goal.startAmount + monthlyContribution * Math.max(monthsElapsed, 0);
  } else {
    currentAmount = goal.startAmount ?? 0;
  }

  const projection: GoalProgressPoint[] = [];
  let projectedCompletionDate: string | null = null;
  let projected = currentAmount;

  for (let i = 0; i < months; i++) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
    if (i > 0) projected += monthlyContribution;

    projection.push({
      month: formatMonth(monthDate),
      projected: round2(projected),
      target: goal.targetAmount,
    });

    if (!projectedCompletionDate && projected >= goal.targetAmount) {
      projectedCompletionDate = formatMonth(monthDate);
    }
  }

  const percentComplete = goal.targetAmount > 0
    ? round2(Math.min((currentAmount / goal.targetAmount) * 100, 100))
    : 0;

  const onTrack = goal.targetDate
    ? projectedCompletionDate != null && projectedCompletionDate <= goal.targetDate.substring(0, 7)
    : projectedCompletionDate != null;

  return {
    goalId: goal.id,
    goalName: goal.name,
    goalType: goal.type,
    targetAmount: goal.targetAmount,
    currentAmount: round2(currentAmount),
    percentComplete,
    monthlyContribution: round2(monthlyContribution),
    targetDate: goal.targetDate ?? null,
    projectedCompletionDate,
    onTrack,
    projection: prependHistory(projection, goal, currentAmount),
  };
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export async function computeGoalProgress(params: {
  months: number;
}): Promise<GoalProgressResponse> {
  const { months } = params;

  const [goals, summary] = await Promise.all([
    listGoals({ isActive: true }),
    computeMonthlyFinancialSummary(),
  ]);

  const goalProgressList: GoalProgress[] = [];

  for (const goal of goals) {
    let progress: GoalProgress;

    switch (goal.type) {
      case "savings":
        progress = computeSavingsGoalProgress(goal, summary.savingsAccounts, months);
        break;
      case "debt_payoff":
        progress = computeDebtPayoffGoalProgress(goal, summary.debtAccounts, months);
        break;
      case "net_worth":
        progress = await computeNetWorthGoalProgress(goal, summary, months);
        break;
      case "custom":
      default:
        progress = computeCustomGoalProgress(goal, months);
        break;
    }

    goalProgressList.push(progress);
  }

  return {
    goals: goalProgressList,
    monthlySurplus: summary.monthlySurplus,
    monthlyIncome: summary.monthlyIncome,
    monthlyExpenses: summary.monthlyExpenses,
    monthlyDebtPayments: summary.monthlyDebtMinimums,
  };
}
