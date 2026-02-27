# 05 — Portfolio & Decision Tools

**Status:** Complete
**Phase:** 5 — Portfolio & Decision Tools
**Priority:** Medium
**Completed:** v1.23.0

## Summary

Investment portfolio management with holdings CRUD, asset allocation donut chart, performance tracking with benchmark comparison, and rebalance suggestions. Financial decision calculators for HYS vs Debt Payoff and 401(k) optimization — computed client-side with pure functions matching the web app's `decisionCalculators.ts`.

## Screens

- `PortfolioScreen` — segmented control with 4 tabs (Holdings, Allocation, Performance, Rebalance); account selector for investment accounts plus "All Accounts" option; pull-to-refresh
- `DecisionToolsScreen` — segmented control with 2 tabs (HYS vs. Debt, 401(k)); pull-to-refresh

## Components

### Portfolio
- `HoldingsTab.tsx` — FlatList of holdings with summary KPIs (Total Market Value, Total Cost, Total Gain/Loss), FAB for add, loading/error/empty states
- `HoldingRow.tsx` — SwipeableRow with edit/delete actions; displays name, ticker badge, asset class, market value, gain/loss ($ and %), shares x price; refresh icon for live quote
- `HoldingFormSheet.tsx` — bottom sheet (85% snap) for create/edit holding; fields: name, ticker, asset class (PickerField), shares, cost basis (CurrencyInput), current price (CurrencyInput), notes; edit mode sends only changed fields
- `AllocationTab.tsx` — PieChart donut per `AssetAllocationSlice` with `CATEGORY_COLORS`, center label showing total market value; legend with color dot, label, percentage, market value, drift indicators (green <2%, amber 2-5%, red >5%); target allocation form with 3 presets (Aggressive/Moderate/Conservative), editable rows per asset class, Save button
- `PerformanceTab.tsx` — period selector (1M/3M/6M/12M/All); 4 KPI cards (Total Value, Total Return $, Return %, Benchmark SPY %); LineChart area chart with portfolio (blue) and benchmark (muted) lines; empty state when no price history available
- `RebalanceTab.tsx` — table with columns: Asset Class, Current %, Target %, Drift %, Action (Buy/Sell/Hold badges with color coding); total market value summary; empty state directing to Allocation tab for targets

### Decision Tools
- `HysVsDebtTab.tsx` — 2 account pickers (savings + loan) with "Manual Entry" option; pre-populates balance/APY/APR from selected accounts; 5 inputs (HYS Balance, HYS APY %, Loan Balance, Loan APR %, Monthly Payment); 300ms debounced recalculation; 4 KPI cards (Recommendation, Net Benefit, Break-Even Month, Interest Delta); 2-line chart (Keep HYS amber, Pay Loan green)
- `FourOhOneKTab.tsx` — account picker for investment accounts; 6 inputs (Annual Salary, Contribution % with Slider, Employer Match %, Match Cap %, Expected Return %, Current Balance); 300ms debounced recalculation; 4 KPI cards (Annual Contribution, Employer Match, Left on Table, Optimal %); 3-line 30-year projection chart (Current blue, Optimal green, IRS Max violet)

## API Layer

`src/api/holdings.ts` — 7 functions: `fetchHoldings`, `fetchHolding`, `createHolding`, `updateHolding`, `deleteHolding`, `reorderHoldings`, `fetchQuote`

`src/api/portfolio.ts` — 5 functions: `fetchAssetAllocation`, `fetchTargetAllocations`, `setTargetAllocations`, `fetchPerformance`, `fetchRebalanceSuggestions`

## Hooks

`src/hooks/useHoldings.ts`:
- `useHoldings(accountId?)` — fetches for single account or merges all investment accounts via `useQueries`
- `useHolding(id)`, `useCreateHolding`, `useUpdateHolding`, `useDeleteHolding`, `useReorderHoldings`, `useQuote(ticker)`

`src/hooks/usePortfolio.ts`:
- `useAssetAllocation(accountId?)`, `useTargetAllocations(accountId?)`, `useSetTargetAllocations`, `usePerformance(period?, accountId?)`, `useRebalanceSuggestions(accountId?)`

## Local Computation

`src/lib/calculations.ts` — pure decision calculator functions copied from web:
- `calculateHysVsDebt(inputs)` — 360-month simulation, two scenarios
- `calculateFourOhOneK(inputs)` — 30-year projection, three contribution levels
- Helpers: `monthLabel()`, `computeEmployerMatch()`, `IRS_401K_LIMIT = 23500`

## Navigation Changes

- Added `Portfolio: { accountId?: string } | undefined` to `AccountsStackParamList`
- Added `DecisionTools: undefined` to `PlanningStackParamList`
- Registered `PortfolioScreen` in AccountsStack and `DecisionToolsScreen` in PlanningStack
- `AccountTypeScreen` shows "Portfolio Overview" button for investment account groups
- `PlanningHomeScreen` includes "Decision Tools" section with HYS vs. Debt and 401(k) navigation rows

## UI Refinements

- Planning page refactored: section titles and action links moved into card headers with bottom border separator
- Card header title font size (17) matches Dashboard's "Net Worth" title for consistency
- Allocation donut chart inner circle color matches card background for legibility
- Performance tab shows empty state message when no historical price data available

## Dependencies

- All API endpoints already exist on finance-api — this is a mobile UI-only implementation
- `react-native-gifted-charts` — PieChart donut and LineChart area charts (already installed)
- `@gorhom/bottom-sheet` — HoldingFormSheet (already installed)
- No new npm dependencies added

## Verification

- Holdings CRUD: add/edit/delete holdings, verify data persists across refresh
- Live quote refresh: tap refresh icon on holding with ticker
- "All Accounts" mode merges holdings from all investment accounts
- Allocation donut chart renders with correct proportions and center total
- Target allocation presets populate correctly, save persists
- Drift indicators show correct color thresholds
- Performance KPIs display correctly; chart renders when price history available
- Rebalance suggestions show Buy/Sell/Hold with correct amounts
- HYS vs Debt: account selection pre-populates fields, chart + KPIs update on input
- 401(k): slider adjusts contribution %, chart shows 3-line projection
- Navigation: AccountTypeScreen → Portfolio Overview, PlanningHome → Decision Tools
- Pull-to-refresh works on both new screens
- Type-check passes across all packages
