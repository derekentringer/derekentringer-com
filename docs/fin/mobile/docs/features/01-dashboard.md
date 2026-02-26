# 01 — Dashboard

**Status:** Complete
**Phase:** 1 — Dashboard
**Priority:** High
**Completed:** v1.19.0

## Summary

Full-featured mobile dashboard matching the web app's `DashboardPage.tsx`, adapted for mobile UX. ScrollView with pull-to-refresh, KPI cards with sparklines, interactive charts, bottom sheet detail views, and all dashboard widgets.

## What Was Implemented

### Dependencies Added

- `react-native-gifted-charts` — SVG-based charts (line, area, bar, pie), no Skia dependency, New Architecture compatible
- `@gorhom/bottom-sheet` v5 — Native bottom sheets with pull-to-dismiss (uses react-native-reanimated + gesture-handler)
- `@react-native-async-storage/async-storage` — AI insight seen-IDs storage (expo-secure-store has 2KB limit)
- `expo-haptics` — Haptic feedback on KPI taps, time range toggles, pull-to-refresh
- `expo-linear-gradient` — Required by react-native-gifted-charts for gradient fills

### API Layer

- `src/api/dashboard.ts` — 7 typed API functions: fetchNetWorth, fetchSpendingSummary, fetchUpcomingBills, fetchDailySpending, fetchIncomeSpending, fetchAccountBalanceHistory, fetchDTI
- `src/api/goals.ts` — fetchGoalProgress
- `src/api/ai.ts` — fetchAiPreferences, fetchAiInsights

### React Query Hooks

- `src/hooks/useDashboard.ts` — All dashboard hooks with `['dashboard', ...]` query key prefix for unified pull-to-refresh invalidation: useNetWorth, useSpendingSummary, useUpcomingBills, useDailySpending, useIncomeSpending, useAccountBalanceHistory, useDTI, useGoalProgress, useAiPreferences, useAiInsights

### Chart Theme

- `src/lib/chartTheme.ts` — Ported CHART_COLORS, CATEGORY_COLORS, getCategoryColor, formatCurrency, formatCurrencyFull from web app

### Common Components

- `src/components/common/Card.tsx` — Dark-themed card wrapper with border
- `src/components/common/SkeletonLoader.tsx` — Shimmer skeleton using react-native-reanimated, plus SkeletonCard and SkeletonChartCard
- `src/components/common/ErrorCard.tsx` — Error state with retry button
- `src/components/common/SectionHeader.tsx` — Section title with optional action link

### Dashboard Components

- `src/components/dashboard/KpiCard.tsx` — Metric card with SVG Polyline sparkline, trend badge, vertical divider layout matching web
- `src/components/dashboard/KpiGrid.tsx` — 2x2 grid with unified loading state, sparkline computation (net worth 30-day, spending MTD cumulative, income MTD cumulative), all cards tappable with haptic feedback
- `src/components/dashboard/NetWorthChart.tsx` — AreaChart with 3 series (assets, liabilities, net worth), self-managed range/granularity state with TimeRangeSelector, legend row, touch interaction disabled for mobile UX
- `src/components/dashboard/IncomeSpendingChart.tsx` — Grouped BarChart with self-managed range/granularity state, bar press disabled for mobile UX
- `src/components/dashboard/SpendingChart.tsx` — PieChart donut with category legend
- `src/components/dashboard/UpcomingBillsList.tsx` — Bill rows with overdue badges, filtered to current month unpaid
- `src/components/dashboard/GoalsSummaryCard.tsx` — Progress bars for top 5 goals with type badges
- `src/components/dashboard/AiInsightCard.tsx` — Collapsible insight list, AsyncStorage for seen IDs
- `src/components/dashboard/TimeRangeSelector.tsx` — Horizontal ScrollView with pill buttons, 44pt touch targets, haptic feedback
- `src/components/dashboard/FavoriteAccountCards.tsx` — Horizontal FlatList with snap behavior, per-account sparkline area charts

### Bottom Sheet Detail Views

- `src/components/dashboard/DtiDetailSheet.tsx` — DTI breakdown with debt + income components, threshold key
- `src/components/dashboard/NetWorthDetailSheet.tsx` — Net worth with asset/liability summary cards, full account breakdown with per-account balance changes
- `src/components/dashboard/IncomeDetailSheet.tsx` — MTD income/spending/net summary, 6-month average, recent months table
- `src/components/dashboard/SpendingDetailSheet.tsx` — Category breakdown with color dots, percentages, and stacked bar visualization

### Screen

- `src/screens/DashboardScreen.tsx` — Orchestrator: ScrollView + RefreshControl, all queries fired in parallel via React Query, pull-to-refresh invalidates dashboard/goals/AI queries, empty state navigates to Accounts tab, 4 bottom sheet detail views (Net Worth, Income, Spending, DTI)

### Modified Files

- `App.tsx` — Wrapped with GestureHandlerRootView for bottom sheet support
- `babel.config.js` — Added `react-native-reanimated/plugin` as last plugin (required for reanimated worklets)

## Mobile UX Adaptations

- **KPI cards** — Fixed height (110pt), value + sparkline layout with vertical divider, `adjustsFontSizeToFit` for long currency values
- **KPI sparklines** — SVG Polyline (not gifted-charts LineChart) for predictable rendering at small sizes
- **All KPI cards tappable** — Haptic feedback + bottom sheet detail views for Net Worth, Income, Spending, and DTI
- **DTI detail → bottom sheet** — Native pull-to-dismiss feel (not centered modal)
- **Time range selectors** — Horizontal ScrollView with pill buttons, minimum 44pt touch targets per Apple HIG
- **Favorite accounts → horizontal FlatList** — Snap-to-card behavior, preserves vertical space
- **Haptic feedback** — On KPI taps, time range toggles, pull-to-refresh completion
- **Accessibility** — `accessibilityLabel` and `accessibilityRole` on all interactive elements

## Files Created (22 new files)

- `src/api/dashboard.ts`, `src/api/goals.ts`, `src/api/ai.ts`
- `src/hooks/useDashboard.ts`
- `src/lib/chartTheme.ts`
- `src/components/common/Card.tsx`, `SkeletonLoader.tsx`, `ErrorCard.tsx`, `SectionHeader.tsx`
- `src/components/dashboard/KpiCard.tsx`, `KpiGrid.tsx`, `NetWorthChart.tsx`, `SpendingChart.tsx`, `IncomeSpendingChart.tsx`, `UpcomingBillsList.tsx`, `GoalsSummaryCard.tsx`, `AiInsightCard.tsx`, `DtiDetailSheet.tsx`, `FavoriteAccountCards.tsx`, `TimeRangeSelector.tsx`, `NetWorthDetailSheet.tsx`, `IncomeDetailSheet.tsx`, `SpendingDetailSheet.tsx`

## Files Modified

- `packages/mobile/package.json` — 5 new dependencies
- `packages/mobile/App.tsx` — GestureHandlerRootView wrapper
- `packages/mobile/babel.config.js` — reanimated plugin
- `packages/mobile/src/screens/DashboardScreen.tsx` — replaced placeholder

## Verification

1. `npx turbo run type-check --force` passes across all workspace packages
2. Dashboard loads on physical Android device with all widgets
3. Pull-to-refresh reloads all data
4. Charts render with correct colors, data, and time range controls
5. Skeleton loading states animate while data loads
6. Error states show retry buttons
7. Empty state (no accounts) shows navigation to Accounts tab
8. All 4 KPI cards open bottom sheet detail views on tap
9. DTI bottom sheet opens/dismisses correctly with pull-to-dismiss
10. Favorite account cards scroll horizontally with snap behavior

## Dependencies

- [Phase 0 — Project Setup & Auth](00-project-setup-and-auth.md)
