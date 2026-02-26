# 03 — Bills & Budgets

**Status:** Complete
**Phase:** 3 — Bills & Budgets
**Priority:** Medium
**Completed:** v1.21.0

## Summary

Full bill management (upcoming with month-grouped sections, all bills list, mark-paid swipe action, CRUD) and budget tracking (month navigation, category progress bars, CRUD). Planning tab replaced with a PlanningStackNavigator containing a planning overview hub, bill screens, and budget screen. All API endpoints already exist on finance-api — this is a mobile UI-only implementation.

## What Was Implemented

### API Layer

- `src/api/bills.ts` — 8 typed API functions: fetchBills, fetchBill, fetchUpcomingBills, createBill, updateBill, deleteBill (with x-pin-token header), markBillPaid, unmarkBillPaid
- `src/api/budgets.ts` — 5 typed API functions: fetchBudgets, fetchBudgetSummary (with ?month param), createBudget, updateBudget, deleteBudget (with x-pin-token header)

### React Query Hooks

- `src/hooks/useBills.ts` — useBills, useBill, useUpcomingBills (60-day default), useCreateBill, useUpdateBill, useDeleteBill, useMarkBillPaid, useUnmarkBillPaid; mutations invalidate `["bills"]` and `["dashboard"]` keys
- `src/hooks/useBudgets.ts` — useBudgets, useBudgetSummary (month param), useCreateBudget, useUpdateBudget, useDeleteBudget; mutations invalidate `["budgets"]` and `["dashboard"]` keys

### Navigation

- `src/navigation/types.ts` — Added PlanningStackParamList (PlanningHome, BillsList, BillDetail, BudgetsList)
- `src/navigation/AppNavigator.tsx` — Replaced PlanningScreen placeholder with PlanningStackNavigator containing 4 screens; Planning tab uses headerShown: false so the stack provides its own headers

### Bill Components

- `src/components/bills/BillInstanceRow.tsx` — Upcoming bill row with Swipeable for mark-paid/unpay actions, overdue badge, paid checkmark icon, haptic feedback
- `src/components/bills/BillDefinitionRow.tsx` — Bill template row using SwipeableRow for edit/delete actions, frequency badge, inactive state dimming
- `src/components/bills/BillFormSheet.tsx` — 85% snap bottom sheet form with name, amount (CurrencyInput), frequency (PickerField), conditional fields based on frequency (day of month, month picker for yearly, weekday picker for weekly/biweekly), category/account pickers, notes, active toggle, next 3 dates preview via computeNextDates()

### Budget Components

- `src/components/budgets/MonthSelector.tsx` — Prev/next month chevron navigation with formatted month label and haptic feedback
- `src/components/budgets/BudgetCategoryRow.tsx` — Category row with SwipeableRow wrapping, progress bar (green under budget, red over), budgeted/actual/remaining amounts
- `src/components/budgets/BudgetFormSheet.tsx` — 60% snap bottom sheet; create mode: category picker, amount, effective-from month picker, notes; edit mode: category display-only, amount, notes

### Screens

- `src/screens/PlanningHomeScreen.tsx` — Overview hub with pull-to-refresh; Bills section with SectionHeader "See All" → BillsList, upcoming bills for current month with tap-to-navigate, monthly total and remaining total (red); Budgets section with SectionHeader "See All" → BudgetsList, current month summary with totals, top 5 categories with mini progress bars
- `src/screens/BillsScreen.tsx` — Custom TabBar (Upcoming / All Bills) with monthly total and remaining total banner above tabs; Upcoming tab uses SectionList with sticky month headers; All Bills tab with FlatList, FAB for create, swipe edit/delete, PIN-gated delete
- `src/screens/BillDetailScreen.tsx` — Hero card with amount + frequency badge, info rows (category, due day, notes), next 3 due dates (computed client-side), recent payment history, header right edit/delete buttons, BillFormSheet for edit, PIN-gated delete
- `src/screens/BudgetsScreen.tsx` — MonthSelector at top, FlatList of BudgetCategoryRow, totals footer (budgeted/actual/remaining with over-budget red), FAB for create, swipe edit/delete, PIN-gated delete

### Chart Improvements

- Added `maxValue` with 10% headroom on NetWorthChart, IncomeSpendingChart, and BalanceHistoryChart to prevent top clipping
- Set explicit `yAxisLabelWidth` on all charts for consistent left/right margins within Card containers
- Removed negative margin hacks on chart containers

### Transaction List Improvements

- Debit amounts now display in red (`colors.error`) instead of default foreground color
- Increased spacing between description and amount for better readability
- Account detail recent transactions match the same spacing

## Mobile UX Adaptations

- **Custom tab bar** — Replaced @react-navigation/material-top-tabs with a custom Pressable-based TabBar to avoid duplicate @react-navigation package conflicts in the monorepo
- **SectionList with month headers** — Upcoming bills grouped by month with sticky headers for easy scanning
- **Monthly total banner** — Persistent above tabs showing both monthly total and remaining amount in red
- **Swipe actions** — Mark-paid/unpay on upcoming bills, edit/delete on all bills and budgets
- **computeNextDates()** — Client-side next due date calculation ported from web BillForm for BillFormSheet and BillDetailScreen
- **Haptic feedback** — On pull-to-refresh, swipe threshold, mark-paid success, month navigation

## Files Created (14 new files)

- `src/api/bills.ts`, `src/api/budgets.ts`
- `src/hooks/useBills.ts`, `src/hooks/useBudgets.ts`
- `src/components/bills/BillInstanceRow.tsx`, `BillDefinitionRow.tsx`, `BillFormSheet.tsx`
- `src/components/budgets/MonthSelector.tsx`, `BudgetCategoryRow.tsx`, `BudgetFormSheet.tsx`
- `src/screens/PlanningHomeScreen.tsx`, `BillsScreen.tsx`, `BillDetailScreen.tsx`, `BudgetsScreen.tsx`

## Files Modified

- `packages/mobile/src/navigation/types.ts` — Added PlanningStackParamList
- `packages/mobile/src/navigation/AppNavigator.tsx` — Replaced PlanningScreen with PlanningStackNavigator
- `packages/mobile/src/components/dashboard/NetWorthChart.tsx` — Chart maxValue headroom, yAxisLabelWidth, removed negative margin
- `packages/mobile/src/components/dashboard/IncomeSpendingChart.tsx` — Chart maxValue headroom, yAxisLabelWidth, removed negative margin
- `packages/mobile/src/components/dashboard/FavoriteAccountCards.tsx` — Removed negative margin on mini chart
- `packages/mobile/src/components/accounts/BalanceHistoryChart.tsx` — Chart maxValue headroom, yAxisLabelWidth
- `packages/mobile/src/components/transactions/TransactionRow.tsx` — Debit amounts red, increased description/amount spacing
- `packages/mobile/src/screens/AccountDetailScreen.tsx` — Increased transaction description/amount spacing

## Files Deleted

- `src/screens/PlanningScreen.tsx` — Replaced by PlanningHomeScreen via PlanningStackNavigator

## Verification

1. `npx turbo run type-check --force` passes across all workspace packages
2. Planning tab: overview shows bills + budgets summaries with totals
3. "See All" navigates to BillsScreen / BudgetsScreen
4. BillsScreen: Upcoming tab shows instances grouped by month with sticky headers
5. BillsScreen: All Bills tab shows bill definitions with frequency badges
6. Mark bill paid via swipe works with haptic feedback
7. Bill CRUD: create via FAB, edit via swipe, delete (PIN-gated) via swipe
8. BillDetailScreen: shows info, next 3 dates, payment history
9. BudgetsScreen: month selector navigates months, progress bars update
10. Budget CRUD: create via FAB, edit via swipe, delete (PIN-gated) via swipe
11. Pull-to-refresh on all screens
12. Skeleton loading + empty states render correctly
13. Charts no longer clip at top, left/right margins match card boundaries

## Dependencies

- [Phase 0 — Project Setup & Auth](00-project-setup-and-auth.md)
- [Phase 1 — Dashboard](01-dashboard.md)
- [Phase 2 — Accounts & Transactions](02-accounts-and-transactions.md)
