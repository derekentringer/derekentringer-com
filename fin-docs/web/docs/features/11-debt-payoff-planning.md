# 11 — Debt Payoff Planning

**Status:** Complete
**Phase:** 5 — Projections & Planning
**Priority:** Medium

## Summary

Calculate and visualize debt payoff timelines using avalanche, snowball, and custom strategies. Side-by-side strategy comparison charts, per-account amortization schedules, actual vs planned tracking from real balance history, and localStorage-persisted user preferences.

## What Was Implemented

### Shared Package (`packages/shared/`)

- `DebtPayoffStrategy` — `"avalanche" | "snowball" | "custom"`
- `DebtAccountSummary` — accountId, name, type, currentBalance, interestRate, minimumPayment, isMortgage
- `DebtPayoffMonthPoint` — month, balance, principal, interest, payment, extraPayment
- `DebtPayoffAccountTimeline` — payoffDate, totalInterestPaid, totalPaid, monthsToPayoff, schedule[]
- `DebtActualVsPlanned` — per-account actual, planned (with extra), and minimumOnly balance arrays
- `DebtPayoffAggregatePoint` — month, totalBalance, totalPayment, totalInterest, totalPrincipal
- `DebtPayoffStrategyResult` — strategy, debtFreeDate, totalInterestPaid, totalPaid, per-account timelines, aggregate schedule
- `DebtPayoffResponse` — debtAccounts[], avalanche, snowball, custom|null, actualVsPlanned[]

### Finance API (`packages/finance-api/`)

#### Debt Payoff Calculation (`src/store/projectionsStore.ts`)

`listDebtAccounts(includeMortgages)`:
- Fetches active accounts where `classifyAccountType(type) === "liability"`
- Batch-fetches latest Balance with LoanProfile/CreditProfile
- Extracts interestRate: LoanProfile > CreditProfile.apr > Account.interestRate > 0
- Extracts minimumPayment: LoanProfile.monthlyPayment > CreditProfile.minimumPayment > fallback max(balance * 0.02, 25)
- Filters out mortgages if !includeMortgages; filters out $0 balance accounts

`computeDebtPayoffStrategy(debts, extraPayment, strategy, customOrder?, maxMonths)`:
- Sorts by strategy: avalanche = highest rate first, snowball = smallest balance first, custom = user order
- Month-by-month loop applying interest, minimum payments, extra payment cascade
- Freed minimums from paid-off debts cascade to next priority debt
- Builds per-account timelines and aggregate schedule
- Returns DebtPayoffStrategyResult

`computeActualVsPlanned(debts, extraPayment)`:
- Fetches all Balance records per debt account, groups by month (last balance per month)
- Planned projection starts from latest actual balance, projects forward with min + extra payment
- Minimum-only projection starts from latest actual balance, projects forward with just minimum payment
- Returns paired actual/planned/minimumOnly arrays per account

`computeDebtPayoff(params)`:
- Accepts optional `accountIds` filter for per-account toggling
- Runs all three strategies (avalanche, snowball, custom if customOrder given)
- Calls computeActualVsPlanned
- Returns DebtPayoffResponse

#### API Routes (`src/routes/projections.ts`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/projections/debt-payoff/accounts` | List debt accounts with summaries |
| GET | `/projections/debt-payoff` | Full debt payoff projection |

Query parameters for debt payoff:
- `extraPayment` — extra monthly payment (default 0, clamped 0–50000)
- `includeMortgages` — include mortgage accounts (default false)
- `accountIds` — comma-separated account IDs to include
- `customOrder` — comma-separated account IDs for custom strategy priority
- `maxMonths` — projection cap (120|240|360, default 360)

### Finance Web (`packages/finance-web/`)

#### Debt Payoff Tab (`src/components/projections/DebtPayoffTab.tsx`)

Main tab component layout (top to bottom):
1. **KPI cards** (4 cards) — Total Debt, Debt-Free Date, Interest Saved, Monthly Payment; each with info icon tooltip explaining the metric; Interest Saved dynamically shows which strategy (avalanche or snowball) saves more
2. **Controls card** — Extra Monthly Payment input + range slider (two-tone track with primary fill), Accounts popover with per-account checkboxes and "Include Mortgages" bulk toggle
3. **Strategy comparison** — Two side-by-side DebtStrategyCharts (avalanche vs snowball) in responsive grid, each showing interest paid and debt-free date in header
4. **Amortization schedule** — Strategy selector (Avalanche/Snowball/Custom) with collapsible per-account tables; defaults to collapsed
5. **Custom priority** — Drag-and-drop sortable list (shown when Custom selected)
6. **Actual vs planned** — Per-account charts with three lines (actual, with extra, minimum only) and comparison details table

State persistence:
- Extra Monthly Payment saved to `localStorage` as `debtPayoff.extraPayment`
- Selected account IDs saved to `localStorage` as `debtPayoff.selectedAccountIds` (JSON array); restored on mount with validation against current accounts; skips initial render to prevent overwriting saved data

Debounced 300ms API calls with AbortController (same pattern as NetIncomeTab).

#### Strategy Chart (`src/components/projections/DebtStrategyChart.tsx`)

Per-strategy AreaChart with:
- Per-account balance lines (colored by `getCategoryColor`) showing payoff order differences
- Aggregate total line (thicker, strategy color)
- Table below chart: columns for priority (#), account name, rate, balance, monthly payment, payoff time
- Total row summing balance and payment

#### Amortization Table (`src/components/projections/DebtAmortizationTable.tsx`)

Collapsible per-account sections (default collapsed) with:
- Columns: Month, Payment, Principal, Interest, Extra, Balance
- Default shows 24 months, "Show all" button to expand
- Responsive: Principal/Interest hidden on small screens, Extra hidden on medium

#### Priority List (`src/components/projections/DebtPriorityList.tsx`)

Drag-and-drop sortable list using @dnd-kit for custom strategy ordering:
- Each item: drag handle, account name, balance, rate, minimum payment
- `onOrderChange` callback triggers re-fetch

#### Actual vs Planned Chart (`src/components/projections/DebtActualVsPlannedChart.tsx`)

Per-account AreaChart with three lines:
- **Actual** (green, solid) — real balance history
- **With Extra** (indigo, solid) — projection from latest balance with min + extra payment
- **Minimum Only** (amber, dashed) — projection from latest balance with just minimum payment

Comparison details table below chart:
- Current Balance, Monthly Payment, Interest Rate, Payoff Time, Total Interest
- Side-by-side Minimum Only vs With Extra columns with savings column

### Global UI Updates

- **Switch component** (`src/components/ui/switch.tsx`) — unchecked background changed from `bg-input` to `#2a2d38` for visibility on dark card backgrounds
- **Tooltip component** (`src/components/ui/tooltip.tsx`) — updated to `bg-card`, `rounded-lg`, `text-xs` to match dashboard chart tooltip styling
- **Range slider** (`src/styles/global.css`) — custom CSS for native range inputs: two-tone track via `--range-pct` CSS variable (primary fill left, `#3a3d48` right), styled thumb, Firefox `::-moz-range-progress` support
- **Chart theme** (`src/lib/chartTheme.ts`) — added `debtAvalanche`, `debtSnowball`, `debtCustom`, `debtPlanned`, `debtActual` colors

## Dependencies

- [03 — Account Management](03-account-management.md) — account balances, LoanProfile, CreditProfile for rates and minimums
- [PDF Statement Import](pdf-statement-import.md) — balance history for actual vs planned tracking

## Resolved Open Questions

- **Actual vs planned**: Implemented — actual from real balance history, planned projects forward from latest balance (not from earliest)
- **Include mortgages**: Toggleable via accounts popover (default excluded); per-account selection available
- **Custom strategy**: Full drag-and-drop priority ordering with @dnd-kit
- **0% APR periods**: Not specifically handled — uses current rate as fixed approximation
- **Minimum payment source**: LoanProfile.monthlyPayment > CreditProfile.minimumPayment > fallback max(2% of balance, $25)
