import type { Bill, BillPayment, UpcomingBillInstance } from "@derekentringer/shared";
import { getPrisma } from "../lib/prisma.js";
import {
  decryptBill,
  decryptBillPayment,
  encryptBillForCreate,
  encryptBillForUpdate,
  encryptBillPaymentForCreate,
} from "../lib/mappers.js";

function isNotFoundError(e: unknown): boolean {
  return (
    e !== null &&
    typeof e === "object" &&
    "code" in e &&
    (e as { code: string }).code === "P2025"
  );
}

export async function createBill(data: {
  name: string;
  amount: number;
  frequency: string;
  dueDay: number;
  dueMonth?: number | null;
  dueWeekday?: number | null;
  category?: string | null;
  accountId?: string | null;
  notes?: string | null;
  isActive?: boolean;
}): Promise<Bill> {
  const prisma = getPrisma();
  const encrypted = encryptBillForCreate(data);
  const row = await prisma.bill.create({ data: encrypted });
  return decryptBill(row);
}

export async function getBill(id: string): Promise<Bill | null> {
  const prisma = getPrisma();
  const row = await prisma.bill.findUnique({ where: { id } });
  if (!row) return null;
  return decryptBill(row);
}

export async function listBills(filter?: {
  isActive?: boolean;
}): Promise<Bill[]> {
  const prisma = getPrisma();
  const where: Record<string, unknown> = {};
  if (filter?.isActive !== undefined) {
    where.isActive = filter.isActive;
  }
  const rows = await prisma.bill.findMany({ where });
  return rows.map(decryptBill);
}

export async function updateBill(
  id: string,
  data: {
    name?: string;
    amount?: number;
    frequency?: string;
    dueDay?: number;
    dueMonth?: number | null;
    dueWeekday?: number | null;
    category?: string | null;
    accountId?: string | null;
    notes?: string | null;
    isActive?: boolean;
  },
): Promise<Bill | null> {
  const prisma = getPrisma();
  const encrypted = encryptBillForUpdate(data);

  try {
    const row = await prisma.bill.update({
      where: { id },
      data: encrypted,
    });
    return decryptBill(row);
  } catch (e: unknown) {
    if (isNotFoundError(e)) return null;
    throw e;
  }
}

export async function deleteBill(id: string): Promise<boolean> {
  const prisma = getPrisma();
  try {
    await prisma.bill.delete({ where: { id } });
    return true;
  } catch (e: unknown) {
    if (isNotFoundError(e)) return false;
    throw e;
  }
}

/**
 * Mark a bill instance as paid using upsert on the compound key (billId, dueDate).
 * This handles the toggle scenario: paid→unpaid→paid without duplicate constraint errors.
 */
export async function markBillPaid(
  billId: string,
  dueDate: Date,
  amount: number,
): Promise<BillPayment> {
  const prisma = getPrisma();
  const encrypted = encryptBillPaymentForCreate({ billId, dueDate, amount });

  const row = await prisma.billPayment.upsert({
    where: {
      billId_dueDate: { billId, dueDate },
    },
    create: encrypted,
    update: {
      amount: encrypted.amount,
      paidDate: encrypted.paidDate,
    },
  });

  return decryptBillPayment(row);
}

/**
 * Remove the payment record for a bill instance (unmark as paid).
 */
export async function unmarkBillPaid(
  billId: string,
  dueDate: Date,
): Promise<boolean> {
  const prisma = getPrisma();
  try {
    await prisma.billPayment.delete({
      where: {
        billId_dueDate: { billId, dueDate },
      },
    });
    return true;
  } catch (e: unknown) {
    if (isNotFoundError(e)) return false;
    throw e;
  }
}

export async function getPaymentsInRange(
  startDate: Date,
  endDate: Date,
): Promise<BillPayment[]> {
  const prisma = getPrisma();
  const rows = await prisma.billPayment.findMany({
    where: {
      dueDate: { gte: startDate, lte: endDate },
    },
  });
  return rows.map(decryptBillPayment);
}

// --- Due date generation ---

/** Clamp day to the last day of the given month (e.g., Feb 30 → Feb 28) */
function clampDay(year: number, month: number, day: number): number {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return Math.min(day, lastDay);
}

/**
 * Generate due dates for a bill within a date range.
 * Frequency-specific logic using dueDay/dueMonth/dueWeekday fields.
 */
export function generateDueDates(
  bill: Bill,
  startDate: Date,
  endDate: Date,
): Date[] {
  const dates: Date[] = [];
  const freq = bill.frequency;

  if (freq === "monthly") {
    // Generate one date per month
    const start = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const end = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);
    const cursor = new Date(start);
    while (cursor <= end) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth();
      const d = clampDay(y, m, bill.dueDay);
      const due = new Date(y, m, d);
      if (due >= startDate && due <= endDate) {
        dates.push(due);
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else if (freq === "quarterly") {
    // Every 3 months from the dueDay
    const start = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const end = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);
    const cursor = new Date(start);
    while (cursor <= end) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth();
      // Quarterly: months 0,3,6,9 (Jan,Apr,Jul,Oct)
      if (m % 3 === 0) {
        const d = clampDay(y, m, bill.dueDay);
        const due = new Date(y, m, d);
        if (due >= startDate && due <= endDate) {
          dates.push(due);
        }
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else if (freq === "yearly") {
    // Specific month and day each year
    const month = (bill.dueMonth ?? 1) - 1; // Convert 1-based to 0-based
    for (
      let year = startDate.getFullYear();
      year <= endDate.getFullYear();
      year++
    ) {
      const d = clampDay(year, month, bill.dueDay);
      const due = new Date(year, month, d);
      if (due >= startDate && due <= endDate) {
        dates.push(due);
      }
    }
  } else if (freq === "weekly" || freq === "biweekly") {
    // Weekly/biweekly on specific weekday
    const targetDay = bill.dueWeekday ?? 0;
    const cursor = new Date(startDate);
    // Move cursor to the first occurrence of the target weekday
    const currentDay = cursor.getDay();
    const daysUntil = (targetDay - currentDay + 7) % 7;
    cursor.setDate(cursor.getDate() + daysUntil);

    const increment = freq === "biweekly" ? 14 : 7;
    while (cursor <= endDate) {
      if (cursor >= startDate) {
        dates.push(new Date(cursor));
      }
      cursor.setDate(cursor.getDate() + increment);
    }
  }

  return dates;
}

/**
 * Compute upcoming bill instances with payment status.
 * Cross-references generated due dates with existing payments.
 */
export function computeUpcomingInstances(
  bills: Bill[],
  payments: BillPayment[],
  startDate: Date,
  endDate: Date,
  today: Date,
): UpcomingBillInstance[] {
  // Index payments by "billId:dueDateISO" for O(1) lookup
  const paymentMap = new Map<string, BillPayment>();
  for (const p of payments) {
    const key = `${p.billId}:${new Date(p.dueDate).toISOString().split("T")[0]}`;
    paymentMap.set(key, p);
  }

  const instances: UpcomingBillInstance[] = [];

  for (const bill of bills) {
    if (!bill.isActive) continue;

    const dueDates = generateDueDates(bill, startDate, endDate);
    for (const dueDate of dueDates) {
      const dueDateStr = dueDate.toISOString().split("T")[0];
      const key = `${bill.id}:${dueDateStr}`;
      const payment = paymentMap.get(key);
      const isPaid = !!payment;
      const isOverdue = !isPaid && dueDate < today;

      instances.push({
        billId: bill.id,
        billName: bill.name,
        amount: bill.amount,
        dueDate: dueDateStr,
        isPaid,
        isOverdue,
        category: bill.category,
        paymentId: payment?.id,
      });
    }
  }

  // Sort by due date ascending
  instances.sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
  );

  return instances;
}
