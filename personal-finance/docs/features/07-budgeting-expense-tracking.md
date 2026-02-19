# 07 — Budgeting & Expense Tracking

**Status:** Complete
**Phase:** 4 — Dashboard & Tracking
**Priority:** High

## Summary

Monthly budget management with per-category targets, actual spending comparison from categorized transactions, and progress visualization. Budgets use an effectiveFrom date so they persist until changed, and a "Copy Last Month" feature allows quick setup for new months.

## What Was Implemented

### Shared Package (`packages/shared/`)

- `Budget` — id, category, amount, effectiveFrom (YYYY-MM), notes, createdAt, updatedAt
- `CreateBudgetRequest` — category, amount, effectiveFrom, notes (optional)
- `UpdateBudgetRequest` — amount (optional), notes (optional, nullable)
- `BudgetListResponse` — budgets array
- `BudgetResponse` — single budget
- `CategoryBudgetSummary` — category, budgeted, actual, remaining, effectiveFrom
- `MonthlyBudgetSummaryResponse` — month, categories[], totalBudgeted, totalActual, totalRemaining

### Finance API (`packages/finance-api/`)

#### Budget Store (`src/store/budgetStore.ts`)

- `createBudget(data)` — encrypts amount and stores budget; validates unique (category, effectiveFrom) pair
- `listBudgets()` — returns all budgets sorted by category ASC, then effectiveFrom DESC
- `updateBudget(id, { amount?, notes? })` — updates budget fields with encryption
- `deleteBudget(id)` — deletes budget by ID
- `getActiveBudgetsForMonth(targetMonth)` — returns active budgets for a given month; "active" means effectiveFrom <= targetMonth; picks the latest effectiveFrom per category

Budget summary computation:
- Fetches active budgets for the requested month
- Queries transactions in the month's date range
- Aggregates negative transaction amounts (expenses) by category
- Compares actual spending against budgeted amounts per category
- Returns per-category summary with budgeted, actual, remaining, and totals

#### API Routes (`src/routes/budgets.ts`)

All routes require JWT authentication.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/budgets` | List all budget records |
| GET | `/budgets/summary?month=YYYY-MM` | Budget vs actual summary for a month (defaults to current) |
| POST | `/budgets` | Create budget (validates amount >= 0, month format) |
| PATCH | `/budgets/:id` | Update budget (amount, notes); 404 if not found, 409 if duplicate |
| DELETE | `/budgets/:id` | Delete budget; 204 on success, 404 if not found |

Validation:
- Amount must be >= 0
- Month must match YYYY-MM format
- Duplicate (category, effectiveFrom) returns 409 Conflict

#### App Registration (`src/app.ts`)

- Registered budget routes at `/budgets`

### Prisma Schema Changes

```prisma
model Budget {
  id            String   @id @default(cuid())
  category      String
  amount        String                          // encrypted
  effectiveFrom String                          // YYYY-MM format
  notes         String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([category, effectiveFrom])
  @@index([category, effectiveFrom])
  @@map("budgets")
}
```

Budget amounts are encrypted with AES-256-GCM. Category and effectiveFrom are stored as plaintext for indexing and querying.

Migration: `20260219040000_add_budgets_bills_bill_payments`

### Finance Web (`packages/finance-web/`)

#### API Client (`src/api/budgets.ts`)

- `fetchBudgets()` — GET /budgets
- `fetchBudgetSummary(month?)` — GET /budgets/summary
- `createBudget(data)` — POST /budgets
- `updateBudget(id, data)` — PATCH /budgets/:id
- `deleteBudget(id)` — DELETE /budgets/:id

#### Budgets Page (`src/pages/BudgetsPage.tsx`)

Two-section layout:

1. **Budget Summary Table** — sortable columns with month navigation:
   - Category (with "Active since YYYY-MM" badge)
   - Budgeted amount
   - Actual spending (computed from transactions)
   - Remaining (budgeted - actual)
   - Progress bar (green when under budget, red when over)
   - Edit/Delete action buttons per row
   - Total row at bottom

2. **Budget vs Actual Chart** — horizontal bar chart (shown when data exists)

Actions:
- Month navigation (prev/next arrows)
- "Copy Last Month" button — copies all budgets from the previous month to the current month
- "Set Budget" button — opens budget form dialog

Sorting:
- Sortable by: category, budgeted, actual, remaining
- Three-click cycle: ascending → descending → reset

#### Budget Form (`src/components/BudgetForm.tsx`)

Modal dialog for create/edit:
- **Category** (select dropdown from categories API; disabled on edit)
- **Amount** (number input, min 0)
- **Effective From** (month picker; hidden on edit since category+month is the unique key)
- **Notes** (optional text area)

## Dependencies

- [04 — CSV Import System](04-csv-import-system.md) — needs transaction data for actual spending
- [05 — Category Rule Engine](05-category-rule-engine.md) — needs categorized transactions for per-category comparison

## Resolved Open Questions

- **Budget periods**: Monthly only; no bi-weekly or custom periods
- **Carry over**: Budgets persist via effectiveFrom — they remain active until a new budget is created for the same category with a later effectiveFrom; no unused amount carry-over
- **Refunds**: Refunds are positive transactions and are excluded from spending totals (only negative amounts counted)
- **Income tracking**: Not included in budgets; income is a separate concern (deferred to Phase 5 Net Income Projections)
- **Over-budget alerts**: Visual only — progress bar turns red and remaining shows negative amount; no push/email notifications
