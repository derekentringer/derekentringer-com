import type {
  BillDueConfig,
  CreditPaymentDueConfig,
  LoanPaymentDueConfig,
  NotificationConfig,
} from "@derekentringer/shared";
import {
  NotificationType,
  DEFAULT_NOTIFICATION_CONFIGS,
} from "@derekentringer/shared";
import { listBills, getPaymentsInRange, generateDueDates } from "../store/billStore.js";
import { listNotificationPreferences, checkDedupeKeyExists } from "../store/notificationStore.js";
import { getPrisma } from "../lib/prisma.js";
import { decryptBalance } from "../lib/mappers.js";

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

  for (const account of creditAccounts) {
    // Get the latest balance with credit profile
    const latestBalance = await prisma.balance.findFirst({
      where: { accountId: account.id },
      orderBy: { date: "desc" },
      include: { creditProfile: true },
    });

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
      const decryptedName = (await prisma.account.findUnique({
        where: { id: account.id },
        select: { name: true },
      }))?.name;

      // We need to use the decrypted account name from a proper source
      // For the notification, we'll use the account data we have
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

  for (const account of loanAccounts) {
    // Get the latest balance with loan profile
    const latestBalance = await prisma.balance.findFirst({
      where: { accountId: account.id },
      orderBy: { date: "desc" },
      include: { loanProfile: true },
    });

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
 * Evaluate all enabled notification types.
 * Returns pending notifications filtered by enabled preferences and deduplication.
 */
export async function evaluateAllNotifications(): Promise<PendingNotification[]> {
  const preferences = await listNotificationPreferences();
  const prefMap = new Map(preferences.map((p) => [p.type, p]));

  const allPending: PendingNotification[] = [];

  // Phase 1 evaluators
  const evaluators: Array<{
    type: NotificationType;
    fn: (config: NotificationConfig | null) => Promise<PendingNotification[]>;
  }> = [
    { type: NotificationType.BillDue, fn: evaluateBillDue },
    { type: NotificationType.CreditPaymentDue, fn: evaluateCreditPaymentDue },
    { type: NotificationType.LoanPaymentDue, fn: evaluateLoanPaymentDue },
  ];

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

  // Deduplicate: filter out notifications whose dedupeKey already exists in the log
  const deduped: PendingNotification[] = [];
  for (const notification of allPending) {
    const exists = await checkDedupeKeyExists(notification.dedupeKey);
    if (!exists) {
      deduped.push(notification);
    }
  }

  return deduped;
}
