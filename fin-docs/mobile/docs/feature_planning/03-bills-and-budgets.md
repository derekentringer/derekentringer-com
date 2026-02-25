# Phase 3 — Bills & Budgets

**Status:** Not Started
**Priority:** Medium

## Summary

Bill tracking with upcoming/paid views and budget overview with monthly navigation.

## Screens

- `BillsScreen` — top tabs: Upcoming, All Bills; mark paid via swipe
- `BillDetailScreen`, `CreateBillScreen`, `EditBillScreen`
- `BudgetsScreen` — month selector, category rows with progress bars, copy previous month
- `CreateBudgetScreen`, `BudgetDetailScreen`

## Components

- `src/components/bills/BillInstanceRow.tsx` (swipe to mark paid), `BillDefinitionRow.tsx`
- `src/components/budgets/BudgetCategoryRow.tsx` (progress bar with color thresholds), `MonthSelector.tsx`

## Hooks

`src/hooks/useBills.ts`:
- `useBills`, `useUpcomingBills`, `useCreateBill`, `useUpdateBill`, `useDeleteBill`, `useMarkBillPaid`, `useUnmarkBillPaid`

`src/hooks/useBudgets.ts`:
- `useBudgetSummary`, `useBudgets`, `useCreateBudget`, `useUpdateBudget`, `useDeleteBudget`

## Verification

- Bill mark-paid swipe action works
- Budget progress bars reflect correct spending
- Month selector navigates between months
- Bill CRUD and budget CRUD with PIN verification for deletes

## Dependencies

- [Phase 2 — Accounts & Transactions](02-accounts-and-transactions.md)
