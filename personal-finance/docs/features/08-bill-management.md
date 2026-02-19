# 08 — Bill Management

**Status:** Complete
**Phase:** 4 — Dashboard & Tracking
**Priority:** High

## Summary

Track recurring bills with configurable frequencies, due date generation, and payment status tracking. Bills surface on the dashboard as an upcoming bills widget and have a dedicated management page with filtering, sorting, and pay/unpay actions.

## What Was Implemented

### Shared Package (`packages/shared/`)

- `BillFrequency` — `"monthly" | "quarterly" | "yearly" | "weekly" | "biweekly"`
- `BILL_FREQUENCIES` — array of all frequency values
- `BILL_FREQUENCY_LABELS` — display labels for each frequency
- `Bill` — id, name, amount, frequency, dueDay, dueMonth?, dueWeekday?, category?, accountId?, notes?, isActive, createdAt, updatedAt
- `CreateBillRequest` — all Bill fields except id/timestamps
- `UpdateBillRequest` — all Bill fields optional (partial update)
- `BillListResponse` — bills array
- `BillResponse` — single bill
- `BillPayment` — id, billId, dueDate, paidDate, amount
- `UpcomingBillInstance` — billId, billName, amount, dueDate, isPaid, isOverdue, category?, paymentId?

### Finance API (`packages/finance-api/`)

#### Bill Store (`src/store/billStore.ts`)

CRUD operations:
- `createBill(data)` — encrypts amount and stores bill
- `getBill(id)` — get single bill with decryption
- `listBills({ isActive? })` — list bills with optional active filter, sorted by name ASC
- `updateBill(id, data)` — partial update with encryption
- `deleteBill(id)` — delete bill (cascades to bill_payments)

Payment tracking:
- `markBillPaid(billId, dueDate, amount)` — upsert on (billId, dueDate); creates or updates payment record
- `unmarkBillPaid(billId, dueDate)` — deletes payment record for a specific due date
- `getPaymentsInRange(startDate, endDate)` — fetch all payments in a date range

Due date generation:
- `generateDueDates(bill, startDate, endDate)` — generates all due dates for a bill within a range based on frequency:
  - **Monthly**: dueDay each month (clamped to last day of month for short months)
  - **Quarterly**: dueDay in Jan, Apr, Jul, Oct
  - **Yearly**: dueDay in specific dueMonth each year
  - **Weekly**: every 7 days on dueWeekday (0=Sun through 6=Sat)
  - **Biweekly**: every 14 days on dueWeekday
- `clampDay(year, month, day)` — helper for month-end edge cases (e.g., day 31 in a 30-day month)

Instance computation:
- `computeUpcomingInstances(bills, payments, startDate, endDate, today)` — generates due date instances for all bills; cross-references with payments to determine isPaid/isOverdue status

#### API Routes (`src/routes/bills.ts`)

All routes require JWT authentication.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/bills` | List bills (optional `?active=true\|false` filter) |
| GET | `/bills/upcoming?days=30` | Computed upcoming bill instances with payment status |
| GET | `/bills/:id` | Get single bill |
| POST | `/bills` | Create bill (validates frequency-specific fields) |
| PATCH | `/bills/:id` | Update bill (validates frequency fields if changed) |
| DELETE | `/bills/:id` | Delete bill (cascades payments) |
| POST | `/bills/:id/pay` | Mark bill instance as paid (body: dueDate, optional amount) |
| DELETE | `/bills/:id/pay?dueDate=YYYY-MM-DD` | Unmark bill as paid |

Validation:
- Amount must be > 0
- dueDay required (1-31 for monthly/quarterly/yearly)
- dueMonth required for yearly frequency (1-12)
- dueWeekday required for weekly/biweekly frequency (0-6)
- Upcoming endpoint: days parameter capped at 365; includes 7 days back for recent overdue

#### App Registration (`src/app.ts`)

- Registered bill routes at `/bills`

### Prisma Schema Changes

```prisma
model Bill {
  id         String        @id @default(cuid())
  name       String
  amount     String                              // encrypted
  frequency  String                              // monthly|quarterly|yearly|weekly|biweekly
  dueDay     Int
  dueMonth   Int?                                // 1-12, required for yearly
  dueWeekday Int?                                // 0-6 (Sun-Sat), required for weekly/biweekly
  category   String?
  accountId  String?
  notes      String?
  isActive   Boolean       @default(true)
  createdAt  DateTime      @default(now())
  updatedAt  DateTime      @updatedAt
  account    Account?      @relation(fields: [accountId], references: [id], onDelete: SetNull)
  payments   BillPayment[]

  @@index([isActive])
  @@map("bills")
}

model BillPayment {
  id       String   @id @default(cuid())
  billId   String
  dueDate  DateTime
  paidDate DateTime @default(now())
  amount   String                                // encrypted
  bill     Bill     @relation(fields: [billId], references: [id], onDelete: Cascade)

  @@unique([billId, dueDate])
  @@index([billId])
  @@index([dueDate])
  @@map("bill_payments")
}
```

Bill amounts and payment amounts are encrypted with AES-256-GCM. Frequency, due day/month/weekday, and category are stored as plaintext for querying.

Account relation uses `onDelete: SetNull` — deleting an account sets the bill's accountId to null rather than deleting the bill.

BillPayment uses `onDelete: Cascade` — deleting a bill removes all its payment records.

Migration: `20260219040000_add_budgets_bills_bill_payments`

### Finance Web (`packages/finance-web/`)

#### API Client (`src/api/bills.ts`)

- `fetchBills(active?)` — GET /bills
- `fetchBill(id)` — GET /bills/:id
- `fetchUpcomingBills(days?)` — GET /bills/upcoming
- `createBill(data)` — POST /bills
- `updateBill(id, data)` — PATCH /bills/:id
- `deleteBill(id)` — DELETE /bills/:id
- `markBillPaid(id, dueDate, amount?)` — POST /bills/:id/pay
- `unmarkBillPaid(id, dueDate)` — DELETE /bills/:id/pay

#### Bills Page (`src/pages/BillsPage.tsx`)

Filter tabs: All | Upcoming | Paid | Overdue

Sortable table with columns:
- Name (alphabetical)
- Amount (numeric)
- Frequency (alphabetical)
- Next Due (date-based)

Actions per bill:
- "Mark Paid" / "Unmark" toggle button (for active bills with upcoming instances)
- "Edit" button (opens BillForm dialog)
- "Delete" button (confirmation dialog warning about payment history deletion)

Status badges:
- Overdue (red/destructive)
- Paid (green/success)
- Active (green/success)
- Inactive (gray/muted)

#### Bill Form (`src/components/BillForm.tsx`)

Modal dialog for create/edit with conditional fields:

Core fields:
- **Name** (required text)
- **Amount** (required, positive number)
- **Frequency** (select: monthly, quarterly, yearly, weekly, biweekly)
- **Active** (checkbox, default true)

Conditional fields based on frequency:
- **Monthly/Quarterly**: Day of month (1-31)
- **Yearly**: Month selector (January-December) + Day of month (1-31)
- **Weekly/Biweekly**: Day of week (Sunday-Saturday)

Optional fields:
- **Category** (select from categories API)
- **Account** (select from accounts API)
- **Notes** (text area)

Preview: Shows next 3 computed due dates based on current form values (e.g., "Next dates: Jan 15, Feb 15, Mar 15")

#### Dashboard Integration

- UpcomingBillsCard component on dashboard shows up to 8 bills in the next 30 days
- Bills Due KPI card shows total amount due with overdue count indicator
- See [06 — Net Worth Tracking](06-net-worth-tracking.md) for dashboard details

## Dependencies

- [03 — Account Management](03-account-management.md) — bills can optionally be linked to an account
- [05 — Category Rule Engine](05-category-rule-engine.md) — bills can have a category from the categories list

## Resolved Open Questions

- **Auto-detection from transactions**: Not implemented; bills are manually created (auto-matching deferred)
- **Notifications**: Dashboard-only — overdue badge on Bills Due KPI card and red status on bills table; no email/push
- **Variable-amount bills**: Bills store a fixed amount; user can override amount when marking as paid
- **Bill payment matching**: Manual mark-as-paid/unmark workflow; no automatic transaction matching
- **Frequency support**: 5 frequencies (monthly, quarterly, yearly, weekly, biweekly); one-time bills not supported
