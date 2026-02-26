# Phase 1 — Dashboard

**Status:** Complete
**Priority:** High
**Completed:** v1.19.0

## Summary

Full dashboard with all widgets matching the web app's dashboard — KPIs, charts, upcoming bills, goals summary, favorite accounts, and AI insights.

## Screen

`DashboardScreen` — ScrollView with pull-to-refresh

## Components

- `src/components/dashboard/KpiCard.tsx` — compact metric card (Net Worth, Income, Spending, DTI)
- `src/components/dashboard/NetWorthChart.tsx` — LineChart with time range selector
- `src/components/dashboard/SpendingChart.tsx` — donut chart via react-native-svg
- `src/components/dashboard/IncomeSpendingChart.tsx` — grouped bar chart
- `src/components/dashboard/UpcomingBillsList.tsx` — compact bill list, tap to navigate
- `src/components/dashboard/GoalsSummaryCard.tsx` — top goals with progress bars
- `src/components/dashboard/FavoriteAccountCards.tsx` — horizontal ScrollView with sparklines
- `src/components/dashboard/AiInsightCard.tsx` — collapsible AI insight card
- `src/components/common/Card.tsx`, `ChartContainer.tsx`, `TimeRangeSelector.tsx`, `PullToRefresh.tsx`

## Hooks

`src/hooks/useDashboard.ts`:
- `useNetWorth(range?, granularity?)`
- `useSpendingSummary(month?)`
- `useUpcomingBills(days?)`
- `useIncomeSpending(range?, granularity?)`
- `useDTI()`
- `useGoalProgress(months?)`
- `useAiInsights(scope)`

## Verification

- Dashboard KPIs and charts load from API
- Pull-to-refresh triggers data reload
- Time range selector updates chart data
- AI insight card loads and collapses correctly

## Dependencies

- [Phase 0 — Project Setup & Auth](00-project-setup-and-auth.md)
