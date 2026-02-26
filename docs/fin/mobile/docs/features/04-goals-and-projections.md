# 04 — Goals & Projections

**Status:** Complete
**Phase:** 4 — Goals & Projections
**Priority:** Medium
**Completed:** v1.22.0

## Summary

Goal tracking with progress visualization and financial projection charts (net income, savings, debt payoff). Goals support four types (savings, debt payoff, net worth, custom), drag-and-drop reordering, swipe edit/delete, and progress tracking with on-track/off-track badges. Projections include three tabs — Net Income, Savings, and Debt Payoff — each with interactive charts and controls matching the web app's data.

## Screens

- `GoalsScreen` — goal list with progress bars, on-track indicators, drag-and-drop reorder via `react-native-draggable-flatlist`, swipe-to-edit/delete, FAB for creation, KPI row (Monthly Surplus, Goals On Track)
- `GoalDetailScreen` — detailed goal view with mini projection chart, linked accounts, monthly contributions, progress summary
- `ProjectionsScreen` — top-level segmented control (Net Income, Savings, Debt Payoff); each tab with charts and controls

## Components

### Goals
- `GoalCard.tsx` — card with drag handle (long-press), type/status badges, percentage, progress bar, amount row; `isActive` drag state with scale/elevation effect
- `GoalFormSheet.tsx` — bottom sheet for create/edit goal form
- `GoalProjectionChart.tsx` — mini projection chart for goal detail

### Projections
- `AccountBalanceChart.tsx` — multi-line area chart with per-account colored lines, optional "Overall" line, color-coded legend; used by Net Income tab for Assets and Liabilities charts
- `NetIncomeProjectionChart.tsx` — dual-line chart (income vs expenses over time)
- `SavingsProjectionCard.tsx` — per-savings-account card with APY badge, balance, and 12-month line chart
- `DebtPayoffChart.tsx` — multi-line area chart with per-account debt balance lines plus total line, strategy label, color-coded legend
- `DebtStrategyToggle.tsx` — KPI grid (Total Debt, Debt-Free Date, Interest Saved, Monthly Payment)
- `TimePeriodSelector.tsx` — 6M/12M/24M pill buttons with haptic feedback

### Common (new)
- `SegmentedControl.tsx` — reusable segmented tab control
- `Slider.tsx` — labeled slider with formatted value display

## Hooks

`src/hooks/useGoals.ts`:
- `useGoals`, `useGoalProgress`, `useCreateGoal`, `useUpdateGoal`, `useDeleteGoal`, `useReorderGoals`

`src/hooks/useProjections.ts`:
- `useNetIncomeProjection`, `useAccountProjections`, `useSavingsAccounts`, `useSavingsProjection`, `useDebtAccounts`, `useDebtPayoff`

## API

`src/api/goals.ts` — CRUD + reorder endpoints for goals
`src/api/projections.ts` — net income, account balances, savings, debt accounts, debt payoff endpoints

## Key Features

### Goals
- Four goal types: savings, debt_payoff, net_worth, custom
- Drag-and-drop reordering via long-press drag handle (react-native-draggable-flatlist)
- Haptic feedback on drag begin (medium impact)
- Swipe-to-edit and swipe-to-delete via SwipeableRow
- Progress bars with type-specific colors
- On Track / Off Track / Complete status badges
- KPI row showing Monthly Surplus and Goals On Track count

### Net Income Tab
- KPIs: Overall Balance, Monthly Income, Monthly Expenses
- Assets chart — per-account balance lines with Overall total line
- Liabilities chart — per-account balance lines (color offset to avoid collision)
- Time period selector (6M/12M/24M)
- Account classification via shared `classifyAccountType()`

### Savings Tab
- Per-account savings projection cards
- Each card shows account name, APY badge, current balance, 12-month projection chart

### Debt Payoff Tab
- Extra monthly payment slider (0–$2,000, $50 steps)
- Account selector — expandable checkbox list with per-account interest rates, "Include Mortgages" toggle
- KPIs: Total Debt, Debt-Free Date, Interest Saved (best vs worst strategy), Monthly Payment
- Avalanche chart — per-account lines + total balance line (red)
- Snowball chart — per-account lines + total balance line (amber)
- Both charts shown simultaneously (stacked vertically)

## Dependencies

- `react-native-draggable-flatlist` — drag-and-drop goal reordering
- `react-native-gifted-charts` — all projection charts (already installed)
- `react-native-gesture-handler` + `react-native-reanimated` — gesture support (already installed)
- All API endpoints already exist on finance-api — this is a mobile UI-only implementation

## Verification

- Goal list renders with drag handles, progress bars, and status badges
- Long-press drag handle lifts card with scale effect, reorder persists via API
- Swipe edit/delete still works alongside drag-and-drop
- Tap navigates to GoalDetail with projection chart
- Net Income tab shows Overall Balance, Monthly Income, Monthly Expenses KPIs
- Assets and Liabilities charts show per-account lines matching web data
- Savings tab shows per-account projection cards with APY and chart
- Debt Payoff tab shows account selector, both strategy charts with per-account lines
- Account selection filters debt payoff calculations
- Extra payment slider updates both charts
- All charts render with correct data matching the web app
