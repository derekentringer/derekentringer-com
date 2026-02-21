# 06 — Net Worth Tracking

**Status:** Complete
**Phase:** 4 — Dashboard & Tracking
**Priority:** High

## Summary

Dashboard with net worth calculation, historical trend chart with view toggle (Overview/Assets/Liabilities), KPI cards with inline sparkline charts (Net Worth shows 30-day daily trend, Monthly Spending shows MTD cumulative trend), spending breakdown by category, upcoming bills widget, and per-account balance history chart. All chart cards feature configurable time range (1M, 3M, 6M, 12M, YTD, All) and granularity (daily/weekly/monthly) controls. Assets minus liabilities = net worth, with per-account trend tracking and Real Estate equity handling. Consistent chart styling across the app: strokeWidth 1.5, gradient fill fading from top to bottom.

## What Was Implemented

### Shared Package (`packages/shared/`)

- Account classification constants:
  - `ASSET_ACCOUNT_TYPES`: Checking, Savings, HighYieldSavings, Investment, RealEstate
  - `LIABILITY_ACCOUNT_TYPES`: Credit, Loan
  - `classifyAccountType(type)` — returns `"asset" | "liability" | "other"`
- Chart control types:
  - `ChartTimeRange` — `"1m" | "3m" | "6m" | "12m" | "ytd" | "all"`
  - `ChartGranularity` — `"daily" | "weekly" | "monthly"`
- Daily spending types:
  - `DailySpendingPoint` — date (YYYY-MM-DD), amount (absolute value of daily spending)
  - `DailySpendingResponse` — points (DailySpendingPoint[])
- Dashboard types:
  - `NetWorthSummary` — totalAssets, totalLiabilities, netWorth, accounts array (with id, name, type, balance, previousBalance, classification)
  - `NetWorthHistoryPoint` — date (YYYY-MM or YYYY-MM-DD), assets, liabilities, netWorth
  - `NetWorthResponse` — summary + history + accountHistory (per-account balances keyed by account ID, same time periods as history; Real Estate accounts store equity)
  - `SpendingSummary` — month, categories (category, amount, percentage), total
  - `DashboardUpcomingBillsResponse` — bills (UpcomingBillInstance[]), totalDue, overdueCount
  - `AccountBalanceHistoryPoint` — date (YYYY-MM or YYYY-MM-DD), balance
  - `AccountBalanceHistoryResponse` — accountId, accountName, currentBalance, history

### Finance API (`packages/finance-api/`)

#### Dashboard Store (`src/store/dashboardStore.ts`)

Period key helpers:
- `toMonthKey(d)` — returns YYYY-MM
- `toWeekKey(d)` — returns YYYY-MM-DD (Monday of the ISO week)
- `toDayKey(d)` — returns YYYY-MM-DD
- `dateToKey(d, granularity)` — dispatches to day, week, or month key
- `generatePeriodKeys(start, end, granularity)` — generates array of period keys for a date range (supports daily/weekly/monthly)

Core functions:
- `computeNetWorthSummary()` — aggregates active account balances into net worth; classifies each account as asset or liability; computes per-account `previousBalance` using carry-forward logic (latest Balance record on or before end of previous month); Real Estate accounts use equity (estimatedValue - currentBalance)
- `computeNetWorthHistory(granularity, startDate?)` — computes history from Balance records with configurable granularity (daily/weekly/monthly) and date range; fetches pre-startDate balances for carry-forward initialization; groups latest balance per account per period; carry-forward fills gaps; aggregates by asset/liability classification; returns `{ history, accountHistory }` — history is the aggregated net worth points, accountHistory contains per-account balances keyed by account ID for each period (Real Estate as equity, liabilities as absolute values); returns empty arrays when no balance data exists
- `computeSpendingSummary(month)` — fetches transactions for a given month; aggregates negative amounts (expenses) by category; returns sorted list with percentage of total
- `computeDailySpending(startDate, endDate)` — fetches transactions in date range; groups negative amounts (expenses) by day; returns array of `DailySpendingPoint` with absolute values; fills gaps with zero-amount days
- `computeAccountBalanceHistory(accountId, granularity, startDate?)` — reconstructs historical balances from transactions by working backwards from currentBalance; aggregates net transaction amounts per period (day, week, or month); supports any date range including all-time; for "all" range, determines earliest date from transaction data

#### API Routes (`src/routes/dashboard.ts`)

All routes require JWT authentication.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard/net-worth?range=all&granularity=monthly` | Current net worth summary + history (range: 1m/3m/6m/12m/ytd/all; granularity: daily/weekly/monthly) |
| GET | `/dashboard/spending?month=YYYY-MM` | Spending by category (defaults to current month) |
| GET | `/dashboard/spending-daily?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` | Daily spending totals for sparkline data |
| GET | `/dashboard/account-history?accountId=xxx&range=all&granularity=weekly` | Single account balance history (range: 1m/3m/6m/12m/ytd/all; granularity: daily/weekly/monthly) |
| GET | `/dashboard/upcoming-bills?days=30` | Upcoming bills widget data (max 365 days) |

Route helpers:
- `computeStartDate(range)` — converts range string to Date or undefined (for "all")
- `CUID_PATTERN` — validates accountId format
- Range validated against `["1m", "3m", "6m", "12m", "ytd", "all"]`; defaults to "all"
- Granularity validated against `["daily", "weekly", "monthly"]`; defaults to "monthly" for net-worth, "weekly" for account-history

#### App Registration (`src/app.ts`)

- Registered dashboard routes at `/dashboard`

### Prisma Schema Changes

Account model extended with:
- `estimatedValue String?` — encrypted market value for Real Estate accounts

Migration: `20260219050000_add_estimated_value`

### Finance Web (`packages/finance-web/`)

#### API Client (`src/api/dashboard.ts`)

- `fetchNetWorth(range?, granularity?)` — GET /dashboard/net-worth with optional range/granularity params
- `fetchSpendingSummary(month?)` — GET /dashboard/spending
- `fetchDailySpending(startDate, endDate)` — GET /dashboard/spending-daily with YYYY-MM-DD date range
- `fetchUpcomingBills(days?)` — GET /dashboard/upcoming-bills
- `fetchAccountBalanceHistory(accountId, range?, granularity?)` — GET /dashboard/account-history with optional range/granularity params

#### Dashboard Page (`src/pages/DashboardPage.tsx`)

Three-section layout with independent loading/error/retry states:

1. **KPI Cards Row** (3-column grid):
   - Net Worth — value + inline sparkline chart showing 30-day daily net worth trend with percentage change
   - Monthly Spending — value + inline sparkline chart showing MTD cumulative spending trend with percentage change
   - Bills Due — value + overdue count indicator (text-based trend, no sparkline)
2. **Net Worth Chart** — full-width area chart with per-card time range/granularity controls
3. **Checking Balance Chart** — full-width area chart (self-managed data fetching) with per-card time range/granularity controls; renders when a checking account exists
4. **Bottom Row** — Spending pie chart + Upcoming Bills list (2-column on desktop, stacked on mobile)

- Fetches daily net worth data (`fetchNetWorth("1m", "daily")`) for sparkline; computes percentage change from first to last data point
- Fetches daily spending data (`fetchDailySpending(startOfMonth, today)`) for sparkline; computes cumulative spending trend
- Derives `checkingAccountId` from net worth summary; passes to self-managing CheckingBalanceCard
- Empty state with "Go to Accounts" link when no accounts exist
- Skeleton loaders for all sections during loading

#### Dashboard Components (`src/components/dashboard/`)

**TimeRangeSelector.tsx:**
- Reusable pill-style toggle component with two button groups
- Granularity toggle: W (weekly) / M (monthly) — bordered pill group
- Range pills: 1M / 3M / 6M / 12M / YTD / All — bordered pill group
- Active pill uses `bg-foreground/15 text-foreground`; inactive uses `text-muted-foreground` with hover effect
- Used by both NetWorthCard and CheckingBalanceCard independently

**KpiCard.tsx:**
- Title, large bold value, optional trend badge or sparkline
- Two display modes:
  - **Sparkline mode** (`sparkline` prop): value on the left, vertical divider, then inline SVG sparkline chart + "↗ +X.X%" percentage + label (e.g., "30-Day", "MTD") on the right; sparkline color matches trend direction; `invertColor` flag for spending (increase = red)
  - **Text trend mode** (`trend` prop): traditional trend badge with up/down/neutral arrows; `invertColor` flag swaps green/red; used by Bills Due card
- When neither prop is provided, displays value only

**Sparkline.tsx** (`src/components/ui/sparkline.tsx`):
- Lightweight pure-SVG sparkline component (no Recharts dependency)
- Props: `data: number[]`, `color: string`, `width?` (default 80), `height?` (default 32)
- Renders `<polyline>` scaled to fit data with gradient fill under the line
- No axes, labels, or grid — minimal inline chart

**NetWorthCard.tsx:**
- View toggle: Overview / Assets / Liabilities — pill-style buttons matching TimeRangeSelector styling, positioned to the left of the time range controls
  - **Overview** (default): Recharts AreaChart with 3 series (assets, liabilities, netWorth)
  - **Assets**: One area per asset account, colored from `CATEGORY_COLORS` palette
  - **Liabilities**: One area per liability account (absolute values), colored from `CATEGORY_COLORS` palette
- Internal state for `range` (default: "12m"), `granularity` (default: "weekly"), and `view` (default: "overview")
- `accountHistory` state updated alongside `history` on refetch — provides per-account balances for Assets/Liabilities views
- TimeRangeSelector in card header (right-aligned)
- Re-fetches history from API when range/granularity changes (skips initial render to avoid double-fetch)
- Loading opacity transition on chart area during re-fetch
- Custom tooltip with full date including year (e.g., "February 2026" or "February 17, 2026")
- Axis labels: compact format ("Feb '26" monthly, "Feb 17" weekly) with `interval="equidistantPreserveStart"`
- Assets and Liabilities sections below chart in 2-column grid (top 5 each); account names in white (`text-foreground`), asset values in green (`text-success`), liability values in red (`text-destructive`)
- Overall assets/liabilities trends computed from summary data (`totalAssets`/`totalLiabilities` vs sum of `previousBalance` values) for consistent month-over-month comparison with per-account trends
- Per-account trend badges use `invertColor` for liabilities (increase = red, decrease = green; arrow direction always factual)
- `trendColorClass()` helper centralizes color logic for all trend badges
- Alternating row highlighting (`bg-white/[0.03]`) for readability
- Real Estate accounts display equity (estimatedValue - balance)

**CheckingBalanceCard.tsx:**
- Single-line AreaChart with `CHART_COLORS.balance` (amber `#f59e0b`)
- Self-managed data: accepts only `accountId` prop; fetches its own data via `fetchAccountBalanceHistory`
- Internal state for `range` (default: "all") and `granularity` (default: "weekly")
- TimeRangeSelector in card header (right-aligned, next to account name and trend badge)
- Re-fetches automatically when range or granularity changes
- Custom tooltip with full date including year
- Trend badge adapts label: "vs last week" (weekly) or "vs last month" (monthly)
- Built-in skeleton loader and error/retry states
- Loading opacity transition during re-fetch

**SpendingCard.tsx:**
- Donut pie chart (hidden on small screens) with category legend
- Top 7 categories shown; remainder aggregated as "Other"
- Total spending (bold, white) with optional month-over-month trend badge (uses `invertColor` — spending increase = red, decrease = green)
- Alternating row highlighting on category list

**UpcomingBillsCard.tsx:**
- Lists up to 8 upcoming bills with due date badges
- Status indicators: overdue (red), paid (green), upcoming (default)
- Alternating row highlighting on bill list

#### Chart Theme (`src/lib/chartTheme.ts`)

- `CHART_COLORS` — assets (green), liabilities (red), netWorth (blue), balance (amber), grid, text
- `CATEGORY_COLORS` — 13-color palette for pie chart categories and per-account chart lines
- `formatCurrency(num)` — compact USD format (no cents, for chart axes)
- `formatCurrencyFull(num)` — full USD format with cents
- `getCategoryColor(index)` — returns color by index for pie chart slices and per-account lines

#### Chart Styling Conventions

All area charts across the app follow consistent styling:
- **strokeWidth**: 1.5 on all `<Area>` components
- **Gradient fill**: SVG `<linearGradient>` fading from `stopOpacity={0.15}` at top to `stopOpacity={0}` at bottom; `fillOpacity={1}` on the area so the gradient controls opacity entirely
- **Exception**: Savings projection stacked area chart uses `fillOpacity={0.6}` (no gradient) since the stacked areas need solid fills to show composition

### UI/UX Improvements

Applied across the entire finance-web app as part of Phase 4 polish:

**Navigation (`src/components/Sidebar.tsx`):**
- Active page uses hover-style background (`bg-accent`) with bold text instead of blue highlight

**Consistent Styling:**
- All card titles use `text-foreground` (white) across the app
- Page headings use `text-xl text-foreground` style (removed `font-thin`)
- KPI card values use `font-bold`
- Applied to: DashboardPage, AccountsPage, TransactionsPage, BudgetsPage, BillsPage, SettingsPage, ReportsPage, NotFoundPage, LoginPage, PinGate

**Responsive Design (mobile-first patterns applied across all pages):**
- **Card padding** (`card.tsx`): CardHeader, CardContent, CardFooter use `px-4 sm:px-6 py-4 sm:py-6` — tighter on mobile, standard on desktop
- **Chart card headers** (`NetWorthCard.tsx`, `AccountBalanceCard.tsx`): `flex-col sm:flex-row` stacking with `gap-2` — title stacks above controls on small screens, inline on desktop; titles use `text-lg sm:text-xl`; control containers use `flex-wrap`
- **Page titles** (all pages): `text-xl sm:text-2xl md:text-3xl` — scales across 3 breakpoints
- **Page header buttons** (`AccountsPage.tsx`, `BudgetsPage.tsx`): `flex-col sm:flex-row` — buttons stack vertically on mobile, inline on desktop
- **Filter controls** (`TransactionsPage.tsx`): Fixed widths replaced with `w-full sm:w-[180px]` pattern — full-width on mobile, fixed on desktop
- **Month navigation** (`BudgetsPage.tsx`): `min-w-[120px] sm:min-w-[180px]` — narrower label on mobile
- **Sidebar sheet** (`Sidebar.tsx`): `w-3/4 max-w-[240px]` — scales on very small screens instead of fixed 240px
- **KPI cards** (`KpiCard.tsx`): Values use `text-lg sm:text-2xl`; sparkline container uses `gap-2 sm:gap-3`
- **Settings icons** (`SettingsPage.tsx`): Touch targets increased to `h-8 w-8` for better mobile interaction

**Table Sorting:**
- Added sortable column headers to AccountsPage (name, type, institution, balance, status)
- Added sortable column headers to SettingsPage Categories (name, type) and Category Rules (pattern, matchType, category, priority)
- Three-click sort cycle: ascending → descending → reset
- `SortableTableHead<T>` generic component with ArrowUp/ArrowDown/ArrowUpDown icons

**Table Header Rows:**
- `hover:bg-transparent` applied to header rows on TransactionsPage, SettingsPage, AccountsPage

## Phase 5 Enhancements

### Favorite Account Balance Charts

The dashboard now shows per-account balance history charts for all **favorited** accounts, replacing the hardcoded checking-only balance chart.

- **`Account.isFavorite`** field added to `NetWorthSummary.accounts` — passed through `computeNetWorthSummary()` in dashboardStore
- **`AccountBalanceCard`** (`src/components/dashboard/AccountBalanceCard.tsx`) — generalized replacement for `CheckingBalanceCard`; works with any account type; same self-managed data fetching, time range/granularity controls, and trend badge
- **`DashboardPage.tsx`** — derives `favoriteAccountIds` from net worth summary; renders an `AccountBalanceCard` for each favorited account (was previously a single `CheckingBalanceCard` for the first checking account)
- `CheckingBalanceCard` component deleted

## Dependencies

- [03 — Account Management](03-account-management.md) — needs accounts with balances
- [02 — Database & Encryption](02-database-and-encryption.md) — needs balance history schema
- [08 — Bill Management](08-bill-management.md) — upcoming bills widget on dashboard

## Resolved Open Questions

- **Snapshot frequency**: Balances captured on CSV import and PDF statement import; no scheduled cron job
- **Investment accounts**: Show current balance (market value) as reported by institution
- **Accounts added mid-history**: Carry-forward logic fills gaps; accounts without prior Balance records show neutral trend tickers
- **Chart library**: Recharts (React-only; Victory deferred to mobile phase)
- **Time range**: User-selectable (1M, 3M, 6M, 12M, YTD, All) with per-chart pill-style controls; each chart manages its own range independently; Net Worth chart defaults to 12M
- **Granularity**: User-selectable (weekly/monthly) with per-chart toggle; daily granularity used internally for KPI sparklines (not exposed in UI toggles); weekly uses ISO week start (Monday), monthly uses YYYY-MM, daily uses YYYY-MM-DD
- **Trend indicators**: KPI cards use inline sparkline charts for Net Worth (30-day daily) and Monthly Spending (MTD cumulative) with percentage change and direction arrow; `invertColor` pattern used for spending sparkline (increase = red); Bills Due card retains text-based trend badge; `invertColor` pattern used for liabilities in net worth chart (arrows always point in the factual direction; colors inverted so increase = red, decrease = green); overall assets/liabilities trends computed from summary `previousBalance` data (not chart history points) for consistency with per-account trends; account balance cards adapt between week-over-week and month-over-month based on granularity
- **Net worth history data source**: Balance table records (PDF statement snapshots) with carry-forward for gaps; does not use transactions
- **Checking balance history data source**: Reconstructed from transaction records by working backwards from currentBalance; does not use Balance table
- **Tooltip dates**: Full date with year shown on hover (e.g., "February 17, 2026" for weekly, "February 2026" for monthly)
