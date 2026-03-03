import type {
  BillDueConfig,
  CreditPaymentDueConfig,
  LoanPaymentDueConfig,
  HighCreditUtilizationConfig,
  BudgetOverspendConfig,
  LargeTransactionConfig,
  StatementReminderConfig,
  MilestonesConfig,
  NotificationConfig,
} from "@derekentringer/shared";
import {
  NotificationType,
  DEFAULT_NOTIFICATION_CONFIGS,
} from "@derekentringer/shared";
import { listBills, getPaymentsInRange, generateDueDates } from "../store/billStore.js";
import { listNotificationPreferences, checkDedupeKeysExist } from "../store/notificationStore.js";
import { getActiveBudgetsForMonth } from "../store/budgetStore.js";
import { computeSpendingSummary, computeNetWorthSummary } from "../store/dashboardStore.js";
import { getPrisma } from "../lib/prisma.js";
import { decryptBalance, decryptAccount } from "../lib/mappers.js";
import { decryptNumber } from "../lib/encryption.js";
import { evaluateAiAlerts } from "./aiAlertEvaluator.js";

export interface PendingNotification {
  type: NotificationType;
  title: string;
  body: string;
  dedupeKey: string;
  metadata?: Record<string, unknown>;
  route?: string;
}

function getConfig<T extends NotificationConfig>(
  config: NotificationConfig | null,
  type: NotificationType,
): T {
  return (config ?? DEFAULT_NOTIFICATION_CONFIGS[type]) as T;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

/**
 * Evaluate Bill Due notifications.
 * Reuses existing generateDueDates() from billStore.
 */
async function evaluateBillDue(
  config: NotificationConfig | null,
): Promise<PendingNotification[]> {
  const { reminderDaysBefore } = getConfig<BillDueConfig>(config, NotificationType.BillDue);
  const notifications: PendingNotification[] = [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + reminderDaysBefore);

  const bills = await listBills({ isActive: true });
  const payments = await getPaymentsInRange(today, endDate);

  // Index payments by "billId:dueDateISO"
  const paidSet = new Set<string>();
  for (const p of payments) {
    const key = `${p.billId}:${new Date(p.dueDate).toISOString().split("T")[0]}`;
    paidSet.add(key);
  }

  for (const bill of bills) {
    const dueDates = generateDueDates(bill, today, endDate);
    for (const dueDate of dueDates) {
      const dueDateStr = toDateStr(dueDate);
      const key = `${bill.id}:${dueDateStr}`;
      if (paidSet.has(key)) continue;

      const dedupeKey = `bill_due:${bill.id}:${dueDateStr}`;
      notifications.push({
        type: NotificationType.BillDue,
        title: `${bill.name} due ${formatDate(dueDate)}`,
        body: `$${bill.amount.toFixed(2)} payment due on ${formatDate(dueDate)}`,
        dedupeKey,
        metadata: { billId: bill.id, dueDate: dueDateStr, amount: bill.amount },
        route: "/bills",
      });
    }
  }

  return notifications;
}

/**
 * Evaluate Credit Payment Due notifications.
 * Reads paymentDueDate from the latest balance's credit profile.
 */
async function evaluateCreditPaymentDue(
  config: NotificationConfig | null,
): Promise<PendingNotification[]> {
  const { reminderDaysBefore } = getConfig<CreditPaymentDueConfig>(
    config,
    NotificationType.CreditPaymentDue,
  );
  const notifications: PendingNotification[] = [];

  const prisma = getPrisma();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get all active credit accounts
  const creditAccounts = await prisma.account.findMany({
    where: { type: "credit", isActive: true },
    select: { id: true, name: true },
  });

  // Batch-fetch latest balance per account to avoid N+1 queries
  const creditAccountIds = creditAccounts.map((a) => a.id);
  const allCreditBalances = creditAccountIds.length > 0
    ? await prisma.balance.findMany({
        where: { accountId: { in: creditAccountIds } },
        orderBy: { date: "desc" },
        include: { creditProfile: true },
      })
    : [];
  const latestCreditBalanceByAccount = new Map<string, typeof allCreditBalances[0]>();
  for (const b of allCreditBalances) {
    if (!latestCreditBalanceByAccount.has(b.accountId)) {
      latestCreditBalanceByAccount.set(b.accountId, b);
    }
  }

  for (const account of creditAccounts) {
    const latestBalance = latestCreditBalanceByAccount.get(account.id);

    if (!latestBalance?.creditProfile?.paymentDueDate) continue;

    const decrypted = decryptBalance({
      ...latestBalance,
      creditProfile: latestBalance.creditProfile,
    });

    const dueDateStr = decrypted.creditProfile?.paymentDueDate;
    if (!dueDateStr) continue;

    const dueDate = new Date(dueDateStr + "T00:00:00");
    if (isNaN(dueDate.getTime())) continue;

    const diffDays = Math.ceil(
      (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diffDays >= 0 && diffDays <= reminderDaysBefore) {
      const dedupeKey = `credit_payment_due:${account.id}:${toDateStr(dueDate)}`;
      notifications.push({
        type: NotificationType.CreditPaymentDue,
        title: `Credit payment due ${formatDate(dueDate)}`,
        body: `Payment due on ${formatDate(dueDate)} for your credit account`,
        dedupeKey,
        metadata: { accountId: account.id, dueDate: toDateStr(dueDate) },
        route: "/accounts",
      });
    }
  }

  return notifications;
}

/**
 * Evaluate Loan Payment Due notifications.
 * Reads nextPaymentDate from the latest balance's loan profile.
 */
async function evaluateLoanPaymentDue(
  config: NotificationConfig | null,
): Promise<PendingNotification[]> {
  const { reminderDaysBefore } = getConfig<LoanPaymentDueConfig>(
    config,
    NotificationType.LoanPaymentDue,
  );
  const notifications: PendingNotification[] = [];

  const prisma = getPrisma();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get all active loan accounts
  const loanAccounts = await prisma.account.findMany({
    where: { type: "loan", isActive: true },
    select: { id: true, name: true },
  });

  // Batch-fetch latest balance per account to avoid N+1 queries
  const loanAccountIds = loanAccounts.map((a) => a.id);
  const allLoanBalances = loanAccountIds.length > 0
    ? await prisma.balance.findMany({
        where: { accountId: { in: loanAccountIds } },
        orderBy: { date: "desc" },
        include: { loanProfile: true },
      })
    : [];
  const latestLoanBalanceByAccount = new Map<string, typeof allLoanBalances[0]>();
  for (const b of allLoanBalances) {
    if (!latestLoanBalanceByAccount.has(b.accountId)) {
      latestLoanBalanceByAccount.set(b.accountId, b);
    }
  }

  for (const account of loanAccounts) {
    const latestBalance = latestLoanBalanceByAccount.get(account.id);

    if (!latestBalance?.loanProfile?.nextPaymentDate) continue;

    const decrypted = decryptBalance({
      ...latestBalance,
      loanProfile: latestBalance.loanProfile,
    });

    const dueDateStr = decrypted.loanProfile?.nextPaymentDate;
    if (!dueDateStr) continue;

    const dueDate = new Date(dueDateStr + "T00:00:00");
    if (isNaN(dueDate.getTime())) continue;

    const diffDays = Math.ceil(
      (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diffDays >= 0 && diffDays <= reminderDaysBefore) {
      const dedupeKey = `loan_payment_due:${account.id}:${toDateStr(dueDate)}`;
      notifications.push({
        type: NotificationType.LoanPaymentDue,
        title: `Loan payment due ${formatDate(dueDate)}`,
        body: `Loan payment due on ${formatDate(dueDate)}`,
        dedupeKey,
        metadata: { accountId: account.id, dueDate: toDateStr(dueDate) },
        route: "/accounts",
      });
    }
  }

  return notifications;
}

/**
 * Evaluate High Credit Utilization notifications.
 * Fires when credit balance / credit limit exceeds configured thresholds.
 */
async function evaluateHighCreditUtilization(
  config: NotificationConfig | null,
): Promise<PendingNotification[]> {
  const { thresholds } = getConfig<HighCreditUtilizationConfig>(
    config,
    NotificationType.HighCreditUtilization,
  );
  const notifications: PendingNotification[] = [];

  const prisma = getPrisma();
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Sorted descending so we check the highest threshold first
  const sortedThresholds = [...thresholds].sort((a, b) => b - a);

  const creditAccounts = await prisma.account.findMany({
    where: { type: "credit", isActive: true },
    select: { id: true, name: true },
  });

  // Batch-fetch latest balance per account to avoid N+1 queries
  const utilCreditIds = creditAccounts.map((a) => a.id);
  const allUtilBalances = utilCreditIds.length > 0
    ? await prisma.balance.findMany({
        where: { accountId: { in: utilCreditIds } },
        orderBy: { date: "desc" },
        include: { creditProfile: true },
      })
    : [];
  const latestUtilBalanceByAccount = new Map<string, typeof allUtilBalances[0]>();
  for (const b of allUtilBalances) {
    if (!latestUtilBalanceByAccount.has(b.accountId)) {
      latestUtilBalanceByAccount.set(b.accountId, b);
    }
  }

  for (const account of creditAccounts) {
    const latestBalance = latestUtilBalanceByAccount.get(account.id);

    if (!latestBalance?.creditProfile) continue;

    const decrypted = decryptBalance({
      ...latestBalance,
      creditProfile: latestBalance.creditProfile,
    });

    const creditLimit = decrypted.creditProfile?.creditLimit;
    const availableCredit = decrypted.creditProfile?.availableCredit;
    if (creditLimit == null || availableCredit == null || creditLimit <= 0) continue;

    const utilization = ((creditLimit - availableCredit) / creditLimit) * 100;

    // Fire at the highest exceeded threshold
    for (const threshold of sortedThresholds) {
      if (utilization >= threshold) {
        const dedupeKey = `high_credit_util:${account.id}:${threshold}:${monthKey}`;
        notifications.push({
          type: NotificationType.HighCreditUtilization,
          title: `Credit utilization at ${Math.round(utilization)}%`,
          body: `Your credit account is at ${Math.round(utilization)}% utilization (threshold: ${threshold}%)`,
          dedupeKey,
          metadata: { accountId: account.id, utilization: Math.round(utilization), threshold },
          route: "/accounts/credit",
        });
        break; // Only fire for the highest exceeded threshold
      }
    }
  }

  return notifications;
}

/**
 * Evaluate Budget Overspend notifications.
 * Fires when monthly category spending hits warning or exceeded thresholds.
 */
async function evaluateBudgetOverspend(
  config: NotificationConfig | null,
): Promise<PendingNotification[]> {
  const { warnAtPercent, alertAtPercent } = getConfig<BudgetOverspendConfig>(
    config,
    NotificationType.BudgetOverspend,
  );
  const notifications: PendingNotification[] = [];

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const budgets = await getActiveBudgetsForMonth(monthKey);
  if (budgets.length === 0) return notifications;

  const spending = await computeSpendingSummary(monthKey);

  // Index spending by category
  const spendingByCategory = new Map(
    spending.categories.map((c) => [c.category, c.amount]),
  );

  for (const budget of budgets) {
    const actual = spendingByCategory.get(budget.category) ?? 0;
    if (budget.amount <= 0) continue;

    const percent = (actual / budget.amount) * 100;

    let level: "exceeded" | "warning" | null = null;
    if (percent >= alertAtPercent) {
      level = "exceeded";
    } else if (percent >= warnAtPercent) {
      level = "warning";
    }

    if (!level) continue;

    const dedupeKey = `budget_overspend:${budget.category}:${level}:${monthKey}`;
    notifications.push({
      type: NotificationType.BudgetOverspend,
      title: level === "exceeded"
        ? `${budget.category} budget exceeded`
        : `${budget.category} budget warning`,
      body: level === "exceeded"
        ? `${budget.category} spending ($${actual.toFixed(2)}) has exceeded the $${budget.amount.toFixed(2)} budget`
        : `${budget.category} spending ($${actual.toFixed(2)}) is at ${Math.round(percent)}% of the $${budget.amount.toFixed(2)} budget`,
      dedupeKey,
      metadata: { category: budget.category, actual, budgeted: budget.amount, percent: Math.round(percent), level },
      route: "/budgets",
    });
  }

  return notifications;
}

/**
 * Evaluate Large Transaction notifications.
 * Scheduler-based: checks transactions from the last 7 days against a dollar threshold.
 */
async function evaluateLargeTransaction(
  config: NotificationConfig | null,
): Promise<PendingNotification[]> {
  const { threshold } = getConfig<LargeTransactionConfig>(
    config,
    NotificationType.LargeTransaction,
  );
  const notifications: PendingNotification[] = [];

  const prisma = getPrisma();
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const recentTransactions = await prisma.transaction.findMany({
    where: {
      date: { gte: sevenDaysAgo },
    },
    select: {
      id: true,
      amount: true,
      description: true,
      category: true,
      date: true,
    },
  });

  for (const txn of recentTransactions) {
    const amount = decryptNumber(txn.amount);
    if (Math.abs(amount) >= threshold) {
      const dedupeKey = `large_txn:${txn.id}`;
      notifications.push({
        type: NotificationType.LargeTransaction,
        title: `Large transaction: $${Math.abs(amount).toFixed(2)}`,
        body: `A transaction of $${Math.abs(amount).toFixed(2)} was recorded on ${formatDate(txn.date)}`,
        dedupeKey,
        metadata: { transactionId: txn.id, amount, category: txn.category },
        route: "/transactions",
      });
    }
  }

  return notifications;
}

/**
 * Evaluate Statement Reminder notifications.
 * Fires a reminder before the next statement close date.
 * Uses creditProfile.periodEnd as the statement close date for credit accounts,
 * or falls back to a configurable day of the month.
 */
async function evaluateStatementReminder(
  config: NotificationConfig | null,
): Promise<PendingNotification[]> {
  const { reminderDaysBefore, fallbackDayOfMonth } = getConfig<StatementReminderConfig>(
    config,
    NotificationType.StatementReminder,
  );
  const notifications: PendingNotification[] = [];

  const prisma = getPrisma();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get all active accounts (credit, loan, savings, investment — anything with statements)
  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    select: { id: true, name: true, type: true },
  });

  // Batch-fetch latest balance per account to avoid N+1 queries
  const allAccountIds = accounts.map((a) => a.id);
  const allStmtBalances = allAccountIds.length > 0
    ? await prisma.balance.findMany({
        where: { accountId: { in: allAccountIds } },
        orderBy: { date: "desc" },
        include: { creditProfile: true, loanProfile: true },
      })
    : [];
  const latestStmtBalanceByAccount = new Map<string, typeof allStmtBalances[0]>();
  for (const b of allStmtBalances) {
    if (!latestStmtBalanceByAccount.has(b.accountId)) {
      latestStmtBalanceByAccount.set(b.accountId, b);
    }
  }

  for (const account of accounts) {
    let statementCloseDate: Date | null = null;

    // Try to get the statement close date from the latest balance profile
    const latestBalance = latestStmtBalanceByAccount.get(account.id);

    if (latestBalance) {
      const decrypted = decryptBalance({
        ...latestBalance,
        creditProfile: latestBalance.creditProfile,
        loanProfile: latestBalance.loanProfile,
      });

      // Use periodEnd from the most recent statement to predict next close date
      const periodEnd = decrypted.creditProfile?.periodEnd ?? decrypted.loanProfile?.periodEnd;
      if (periodEnd) {
        const lastClose = new Date(periodEnd + "T00:00:00");
        if (!isNaN(lastClose.getTime())) {
          // Estimate next statement close: ~1 month after last periodEnd
          const nextClose = new Date(lastClose);
          nextClose.setMonth(nextClose.getMonth() + 1);
          // If the estimated next close is in the past, push forward another month
          if (nextClose < today) {
            nextClose.setMonth(nextClose.getMonth() + 1);
          }
          statementCloseDate = nextClose;
        }
      }
    }

    // Fallback: use configurable day of current/next month
    if (!statementCloseDate) {
      const fallback = new Date(today.getFullYear(), today.getMonth(), fallbackDayOfMonth);
      if (fallback < today) {
        fallback.setMonth(fallback.getMonth() + 1);
      }
      statementCloseDate = fallback;
    }

    const diffDays = Math.ceil(
      (statementCloseDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diffDays >= 0 && diffDays <= reminderDaysBefore) {
      const monthKey = `${statementCloseDate.getFullYear()}-${String(statementCloseDate.getMonth() + 1).padStart(2, "0")}`;
      const dedupeKey = `statement_reminder:${account.id}:${monthKey}`;
      notifications.push({
        type: NotificationType.StatementReminder,
        title: `Statement closing ${formatDate(statementCloseDate)}`,
        body: `Upload your latest statement data before ${formatDate(statementCloseDate)}`,
        dedupeKey,
        metadata: { accountId: account.id, closeDate: toDateStr(statementCloseDate) },
        route: "/accounts",
      });
    }
  }

  return notifications;
}

/**
 * Evaluate Milestone notifications.
 * Fires when net worth crosses configured thresholds or loan payoff reaches milestones.
 */
async function evaluateMilestones(
  config: NotificationConfig | null,
): Promise<PendingNotification[]> {
  const { netWorthMilestones, loanPayoffPercentMilestones } = getConfig<MilestonesConfig>(
    config,
    NotificationType.Milestones,
  );
  const notifications: PendingNotification[] = [];

  // --- Net worth milestones ---
  const nwSummary = await computeNetWorthSummary();
  const currentNetWorth = nwSummary.netWorth;

  // Sort ascending and fire the highest crossed milestone
  const sortedNwMilestones = [...netWorthMilestones].sort((a, b) => a - b);
  for (let i = sortedNwMilestones.length - 1; i >= 0; i--) {
    const milestone = sortedNwMilestones[i];
    if (currentNetWorth >= milestone) {
      const dedupeKey = `milestone_nw:${milestone}`;
      notifications.push({
        type: NotificationType.Milestones,
        title: `Net worth milestone: $${milestone.toLocaleString()}`,
        body: `Your net worth has reached $${currentNetWorth.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}!`,
        dedupeKey,
        metadata: { milestone, currentNetWorth },
        route: "/dashboard",
      });
      break; // Only fire the highest crossed milestone
    }
  }

  // --- Loan payoff milestones ---
  const prisma = getPrisma();
  const loanAccounts = await prisma.account.findMany({
    where: { type: "loan", isActive: true },
  });

  const sortedPayoffMilestones = [...loanPayoffPercentMilestones].sort((a, b) => a - b);

  for (const row of loanAccounts) {
    const account = decryptAccount(row);
    if (!account.originalBalance || account.originalBalance <= 0) continue;

    const currentBalance = Math.abs(account.currentBalance);
    const paidOff = account.originalBalance - currentBalance;
    const payoffPercent = (paidOff / account.originalBalance) * 100;

    // Fire the highest crossed milestone for each loan
    for (let i = sortedPayoffMilestones.length - 1; i >= 0; i--) {
      const milestone = sortedPayoffMilestones[i];
      if (payoffPercent >= milestone) {
        const dedupeKey = `milestone_payoff:${account.id}:${milestone}`;
        notifications.push({
          type: NotificationType.Milestones,
          title: milestone >= 100
            ? `${account.name} paid off!`
            : `${account.name}: ${milestone}% paid off`,
          body: milestone >= 100
            ? `Congratulations! Your ${account.name} loan is fully paid off!`
            : `Your ${account.name} loan is ${Math.round(payoffPercent)}% paid off ($${paidOff.toFixed(2)} of $${account.originalBalance.toFixed(2)})`,
          dedupeKey,
          metadata: { accountId: account.id, milestone, payoffPercent: Math.round(payoffPercent) },
          route: "/accounts",
        });
        break;
      }
    }
  }

  return notifications;
}

/**
 * Evaluate all enabled notification types.
 * Returns pending notifications filtered by enabled preferences and deduplication.
 */
export async function evaluateAllNotifications(): Promise<PendingNotification[]> {
  const preferences = await listNotificationPreferences();
  const prefMap = new Map(preferences.map((p) => [p.type, p]));

  const allPending: PendingNotification[] = [];

  const evaluators: Array<{
    type: NotificationType;
    fn: (config: NotificationConfig | null) => Promise<PendingNotification[]>;
  }> = [
    // Phase 1
    { type: NotificationType.BillDue, fn: evaluateBillDue },
    { type: NotificationType.CreditPaymentDue, fn: evaluateCreditPaymentDue },
    { type: NotificationType.LoanPaymentDue, fn: evaluateLoanPaymentDue },
    // Phase 2
    { type: NotificationType.HighCreditUtilization, fn: evaluateHighCreditUtilization },
    { type: NotificationType.BudgetOverspend, fn: evaluateBudgetOverspend },
    { type: NotificationType.LargeTransaction, fn: evaluateLargeTransaction },
    // Phase 3
    { type: NotificationType.StatementReminder, fn: evaluateStatementReminder },
    { type: NotificationType.Milestones, fn: evaluateMilestones },
  ];

  // AI alerts (runs independently, catches own errors)
  try {
    const aiAlerts = await evaluateAiAlerts();
    allPending.push(...aiAlerts);
  } catch {
    // AI alerts are non-critical — skip silently
  }

  for (const { type, fn } of evaluators) {
    const pref = prefMap.get(type);
    if (!pref?.enabled) continue;

    try {
      const pending = await fn(pref.config);
      allPending.push(...pending);
    } catch {
      // Log silently and continue with other evaluators
    }
  }

  // Deduplicate: batch-check all dedupeKeys in a single query
  const allDedupeKeys = allPending.map((n) => n.dedupeKey);
  const existingKeys = await checkDedupeKeysExist(allDedupeKeys);
  const deduped = allPending.filter((n) => !existingKeys.has(n.dedupeKey));

  return deduped;
}
