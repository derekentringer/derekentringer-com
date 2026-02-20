# 09 — Net Income Projections

**Status:** Complete
**Phase:** 5 — Projections & Planning
**Priority:** Medium

## Summary

Project future net income based on income sources (manual or auto-detected from transactions), recurring bills, and budget allocations. Includes per-account balance projections for all account types (checking, savings, investment, credit, loan) with account-type-specific logic. Projections page features KPI summary cards, stacked area charts for assets and liabilities, and per-account projection charts for favorited accounts.

## What Was Implemented

### Shared Package (`packages/shared/`)

- `IncomeSourceFrequency` — alias for `Frequency` (`"weekly" | "biweekly" | "monthly" | "quarterly" | "yearly"`)
- `INCOME_SOURCE_FREQUENCIES` — array of all frequency values
- `INCOME_SOURCE_FREQUENCY_LABELS` — display labels for each frequency
- `IncomeSource` — id, name, amount, frequency, isActive, notes?, createdAt, updatedAt
- `CreateIncomeSourceRequest` / `UpdateIncomeSourceRequest` — CRUD request types
- `IncomeSourceListResponse` / `IncomeSourceResponse` — API response types
- `DetectedIncomePattern` — description, averageAmount, frequency, monthlyEquivalent, occurrences, lastSeen
- `DetectedIncomePatternsResponse` — patterns array
- `NetIncomeProjectionPoint` — month, income, expenses, netIncome
- `NetIncomeProjectionResponse` — detectedIncome, manualIncome, monthlyIncome, monthlyExpenses, monthlyBillTotal, monthlyBudgetTotal, projection
- `AccountProjectionPoint` — month, balance
- `AccountProjectionLine` — accountId, accountName, accountType, currentBalance, monthlyChange, isFavorite, projection
- `AccountProjectionsResponse` — accounts array, overall line

### Finance API (`packages/finance-api/`)

#### Income Source Store (`src/store/incomeSourceStore.ts`)

CRUD operations for income sources with encrypted amount storage:
- `createIncomeSource(data)` — encrypts amount, stores income source
- `getIncomeSource(id)` — single source with decryption
- `listIncomeSources({ isActive? })` — list with optional active filter
- `updateIncomeSource(id, data)` — partial update with encryption
- `deleteIncomeSource(id)` — delete income source

#### Income Detection (`src/store/projectionsStore.ts`)

- `detectIncomePatterns(lookbackMonths?)` — scans last 6 months of transactions for recurring positive amounts above $25, excluding transfers (Zelle, Venmo, internal transfers)
- Groups by normalized description, requires 3+ occurrences
- Detects frequency from average days between occurrences (weekly/biweekly/monthly/quarterly/yearly)
- Calculates monthly equivalent for each pattern

#### Net Income Projection (`src/store/projectionsStore.ts`)

`computeNetIncomeProjection({ months, incomeAdjustmentPct, expenseAdjustmentPct })`:
- **Income**: Uses manual income sources if any exist; otherwise falls back to auto-detected patterns
- **Expenses**: Sum of active bills (frequency-normalized to monthly) + active budgets for the current month
- **Adjustments**: Applies percentage adjustments to both income and expenses
- **Projection**: Cumulative income vs. cumulative expenses over N months

#### Account Balance Projections (`src/store/projectionsStore.ts`)

`computeAccountProjections({ months, incomeAdjustmentPct, expenseAdjustmentPct })`:
- Per-account projection with account-type-specific logic:
  - **Checking**: Net cash flow (income − expenses from bills + budgets)
  - **Savings/HYS**: Compound interest (APY from latest SavingsProfile or account.interestRate) + estimated monthly contribution from positive transactions
  - **Investment**: Compound return (rate of return from latest InvestmentProfile) + estimated monthly contribution
  - **Credit**: Average monthly net change from recent transactions (floors at 0 — fully paid off)
  - **Loan**: Amortization — interest accrues, monthly payment reduces principal (from latest LoanProfile)
  - **Other**: Flat balance (no projection logic)
- Excludes real estate accounts and Robinhood (no meaningful monthly change)
- Overall line: sum of all account balances with liabilities subtracted

#### API Routes (`src/routes/incomeSources.ts`)

All routes require JWT authentication.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/income-sources` | List income sources (optional `?active=true\|false` filter) |
| GET | `/income-sources/detected` | Auto-detected income patterns from transaction history |
| GET | `/income-sources/:id` | Get single income source |
| POST | `/income-sources` | Create income source |
| PATCH | `/income-sources/:id` | Update income source |
| DELETE | `/income-sources/:id` | Delete income source |

#### Projections Routes (`src/routes/projections.ts`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/projections/net-income` | Net income projection with income/expense breakdown |
| GET | `/projections/accounts` | Per-account balance projections |
| GET | `/projections/savings/accounts` | List savings/HYS accounts with summaries |
| GET | `/projections/savings/:accountId` | Per-account savings projection with milestones |

### Finance Web (`packages/finance-web/`)

#### Projections Page — Net Income Tab (`src/components/projections/NetIncomeTab.tsx`)

Three KPI cards:
- **Overall Balance** — sum of all account balances (liabilities subtracted), with per-account breakdown
- **Monthly Income** — total monthly income with source breakdown (manual or detected)
- **Monthly Expenses** — total monthly expenses with Bills and Budgets breakdown

Two area charts with independent time range selectors (6M/12M/24M):
- **Assets** chart — all asset accounts + Overall line (gradient fills, strokeWidth 1.5)
- **Liabilities** chart — all liability accounts (gradient fills, strokeWidth 1.5)

Per-account projection charts for favorited non-savings accounts (via `AccountProjectionCard` component, gradient fill, strokeWidth 1.5).

#### Account Projection Card (`src/components/projections/AccountProjectionCard.tsx`)

Reusable card for per-account balance projections:
- Area chart with 6M/12M/24M time range selector
- Trend badge showing monthly change amount and percentage
- Used by NetIncomeTab for favorited non-savings accounts

#### Income Source Management — Settings Page

Income source CRUD moved from Projections page to Settings page under an "Income Sources" tab:
- List view with name, amount, frequency, and active status
- Create/edit form with auto-detected income suggestions (patterns not already added as manual sources)
- Delete with confirmation dialog

#### Income Source Form (`src/components/IncomeSourceForm.tsx`)

- Detects income patterns and shows suggestions as clickable badges (filtered to exclude already-existing sources)
- Clicking a suggestion pre-fills name, amount, and frequency
- Fields: name, amount, frequency, active, notes

## Expense Calculation

Monthly expenses are calculated as **Bills + Budgets** (not historical average spending):
- **Bills**: Active bills normalized to monthly frequency using `frequencyToMonthlyMultiplier()`
- **Budgets**: Active budgets for the current month from `getActiveBudgetsForMonth()`
- This gives the user full control over projected expenses via Bills and Budgets management

## Dependencies

- [07 — Budgeting & Expense Tracking](07-budgeting-expense-tracking.md) — budget totals feed into expense projections
- [08 — Bill Management](08-bill-management.md) — bill totals feed into expense projections

## Resolved Open Questions

- **Tax withholding**: Users enter net (take-home) salary amounts; no gross/tax calculation
- **Inflation**: Not accounted for in projections
- **Scenario modeling**: Deferred — income/expense adjustment percentage sliders planned but not yet exposed in UI (backend supports them)
- **Historical spending vs. bills**: Expenses use Bills + Budgets only; historical average spending was removed to give users explicit control
