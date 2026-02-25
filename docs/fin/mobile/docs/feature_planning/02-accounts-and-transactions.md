# Phase 2 — Accounts & Transactions

**Status:** Not Started
**Priority:** High

## Summary

Account management (list by type, detail, CRUD) and transaction list with search/filter/infinite scroll.

## Screens

- `AccountsScreen` — account type groups with counts and totals
- `AccountTypeScreen` — accounts within a type, balance summary
- `AccountDetailScreen` — balance history chart, recent transactions, edit/delete
- `CreateAccountScreen`, `EditAccountScreen` — modal forms
- `TransactionsScreen` — search bar, filters, infinite scroll via `useInfiniteQuery`
- `TransactionDetailScreen` — view/edit category

## Components

- `src/components/accounts/AccountCard.tsx`, `AccountGroupHeader.tsx`, `BalanceHistoryChart.tsx`
- `src/components/transactions/TransactionRow.tsx` (with swipe-to-edit), `TransactionFilters.tsx`, `SearchBar.tsx`
- `src/components/common/PinGateModal.tsx` — PIN verification modal for destructive actions
- `src/components/common/FormField.tsx`, `PickerField.tsx`, `CurrencyInput.tsx`, `InfiniteList.tsx`, `SwipeableRow.tsx`

## Hooks

`src/hooks/useAccounts.ts`:
- `useAccounts`, `useAccount`, `useCreateAccount`, `useUpdateAccount`, `useDeleteAccount`, `useReorderAccounts`, `useAccountBalanceHistory`

`src/hooks/useTransactions.ts`:
- `useTransactions` (useInfiniteQuery), `useTransaction`, `useUpdateTransaction`, `useDeleteTransaction`, `useBulkUpdateCategory`, `useCategories`

## Verification

- Account list grouped by type with correct totals
- Account CRUD with PIN verification for deletes
- Transaction list with infinite scroll
- Transaction search and filter work correctly
- Swipe-to-edit on transaction rows

## Dependencies

- [Phase 0 — Project Setup & Auth](00-project-setup-and-auth.md)
- [Phase 1 — Dashboard](01-dashboard.md)
