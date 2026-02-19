# 06 — Net Worth Tracking

**Status:** Complete
**Phase:** 4 — Dashboard & Tracking
**Priority:** High

## Summary

Dashboard with net worth calculation, 12-month historical trend chart, KPI cards with month-over-month trend indicators, spending breakdown by category, and upcoming bills widget. Assets minus liabilities = net worth, with per-account trend tracking and Real Estate equity handling.

## What Was Implemented

### Shared Package (`packages/shared/`)

- Account classification constants:
  - `ASSET_ACCOUNT_TYPES`: Checking, Savings, HighYieldSavings, Investment, RealEstate
  - `LIABILITY_ACCOUNT_TYPES`: Credit, Loan
  - `classifyAccountType(type)` — returns `"asset" | "liability" | "other"`
- Dashboard types:
  - `NetWorthSummary` — totalAssets, totalLiabilities, netWorth, accounts array (with id, name, type, balance, previousBalance, classification)
  - `NetWorthHistoryPoint` — month (YYYY-MM), assets, liabilities, netWorth
  - `NetWorthResponse` — summary + history
  - `SpendingSummary` — month, categories (category, amount, percentage), total
  - `DashboardUpcomingBillsResponse` — bills (UpcomingBillInstance[]), totalDue, overdueCount

### Finance API (`packages/finance-api/`)

#### Dashboard Store (`src/store/dashboardStore.ts`)

- `computeNetWorthSummary()` — aggregates active account balances into net worth; classifies each account as asset or liability; computes per-account `previousBalance` using carry-forward logic (latest Balance record on or before end of previous month); Real Estate accounts use equity (estimatedValue - currentBalance)
- `computeNetWorthHistory(months)` — computes rolling N-month history from Balance records; groups latest balance per account per month; carry-forward fills gaps for months without records; aggregates by asset/liability classification
- `computeSpendingSummary(month)` — fetches transactions for a given month; aggregates negative amounts (expenses) by category; returns sorted list with percentage of total

#### API Routes (`src/routes/dashboard.ts`)

All routes require JWT authentication.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard/net-worth` | Current net worth summary + 12-month history |
| GET | `/dashboard/spending?month=YYYY-MM` | Spending by category (defaults to current month) |
| GET | `/dashboard/upcoming-bills?days=30` | Upcoming bills widget data (max 365 days) |

#### App Registration (`src/app.ts`)

- Registered dashboard routes at `/dashboard`

### Prisma Schema Changes

Account model extended with:
- `estimatedValue String?` — encrypted market value for Real Estate accounts

Migration: `20260219050000_add_estimated_value`

### Finance Web (`packages/finance-web/`)

#### API Client (`src/api/dashboard.ts`)

- `fetchNetWorth()` — GET /dashboard/net-worth
- `fetchSpendingSummary(month?)` — GET /dashboard/spending
- `fetchUpcomingBills(days?)` — GET /dashboard/upcoming-bills

#### Dashboard Page (`src/pages/DashboardPage.tsx`)

Three-section layout with independent loading/error/retry states:

1. **KPI Cards Row** (3-column grid):
   - Net Worth — value + month-over-month trend from history
   - Monthly Spending — value + trend vs previous month (inverted: spending down = green)
   - Bills Due — value + overdue count indicator
2. **Net Worth Chart** — full-width area chart (assets, liabilities, netWorth)
3. **Bottom Row** — Spending pie chart + Upcoming Bills list (2-column on desktop, stacked on mobile)

- Computes `netWorthTrend` from history array (last two months)
- Fetches previous month spending for `spendingTrend` comparison
- Empty state with "Go to Accounts" link when no accounts exist
- Skeleton loaders for all sections during loading

#### Dashboard Components (`src/components/dashboard/`)

**KpiCard.tsx:**
- Title, large bold value, optional trend badge
- Trend directions: `"up"` (green), `"down"` (red), `"neutral"` (gray with → arrow)
- Optional label text (e.g., "vs last month")

**NetWorthCard.tsx:**
- Recharts AreaChart with 3 series (assets, liabilities, netWorth)
- Custom tooltip with formatted currency values
- Assets and Liabilities sections below chart in 2-column grid (top 5 each)
- Section-level trend badges with "vs last month" label
- Per-account trend badges (smaller, no label) showing individual month-over-month change
- Neutral tickers shown for accounts with no change or no historical data
- Alternating row highlighting (`bg-white/[0.03]`) for readability
- Real Estate accounts display equity (estimatedValue - balance)
- Liabilities trend inverted: decrease = green (up), increase = red (down)

**SpendingCard.tsx:**
- Donut pie chart (hidden on small screens) with category legend
- Top 7 categories shown; remainder aggregated as "Other"
- Total spending (bold, white) with optional month-over-month trend badge
- Alternating row highlighting on category list

**UpcomingBillsCard.tsx:**
- Lists up to 8 upcoming bills with due date badges
- Status indicators: overdue (red), paid (green), upcoming (default)
- Alternating row highlighting on bill list

#### Chart Theme (`src/lib/chartTheme.ts`)

- `CHART_COLORS` — assets (green), liabilities (red), netWorth (blue), grid, text
- `CATEGORY_COLORS` — 13-color palette for pie chart categories
- `formatCurrency(num)` — compact USD format (no cents, for chart axes)
- `formatCurrencyFull(num)` — full USD format with cents
- `getCategoryColor(index)` — returns color by index for pie chart slices

### UI/UX Improvements

Applied across the entire finance-web app as part of Phase 4 polish:

**Navigation (`src/components/Sidebar.tsx`):**
- Active page uses hover-style background (`bg-accent`) with bold text instead of blue highlight

**Consistent Styling:**
- All card titles use `text-foreground` (white) across the app
- Page headings use `text-xl text-foreground` style (removed `font-thin`)
- KPI card values use `font-bold`
- Applied to: DashboardPage, AccountsPage, TransactionsPage, BudgetsPage, BillsPage, SettingsPage, ReportsPage, NotFoundPage, LoginPage, PinGate

**Table Sorting:**
- Added sortable column headers to AccountsPage (name, type, institution, balance, status)
- Added sortable column headers to SettingsPage Categories (name, type) and Category Rules (pattern, matchType, category, priority)
- Three-click sort cycle: ascending → descending → reset
- `SortableTableHead<T>` generic component with ArrowUp/ArrowDown/ArrowUpDown icons

**Table Header Rows:**
- `hover:bg-transparent` applied to header rows on TransactionsPage, SettingsPage, AccountsPage

## Dependencies

- [03 — Account Management](03-account-management.md) — needs accounts with balances
- [02 — Database & Encryption](02-database-and-encryption.md) — needs balance history schema
- [08 — Bill Management](08-bill-management.md) — upcoming bills widget on dashboard

## Resolved Open Questions

- **Snapshot frequency**: Balances captured on CSV import and PDF statement import; no scheduled cron job
- **Investment accounts**: Show current balance (market value) as reported by institution
- **Accounts added mid-history**: Carry-forward logic fills gaps; accounts without prior Balance records show neutral trend tickers
- **Chart library**: Recharts (React-only; Victory deferred to mobile phase)
- **Time range**: Fixed 12-month rolling window; no user-selectable range (kept simple)
- **Trend indicators**: Month-over-month percentage change with three states (up/down/neutral); inverted for liabilities and spending
