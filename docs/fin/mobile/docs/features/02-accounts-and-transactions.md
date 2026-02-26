# 02 — Accounts & Transactions

**Status:** Complete
**Phase:** 2 — Accounts & Transactions
**Priority:** High
**Completed:** v1.20.0

## Summary

Full account management (grouped list, type drill-down, detail with balance chart, CRUD) and transaction list with search, filters, infinite scroll, and swipe-to-edit. PIN-gated destructive actions, bottom sheet forms, and cross-navigator "See All" linking from account detail to filtered transactions.

## What Was Implemented

### Dependencies Added

- `expo-blur` — Background blur for bottom sheet backdrops (installed but backdrop uses opacity overlay for better compatibility)

### API Layer

- `src/api/accounts.ts` — 6 typed API functions: fetchAccounts, fetchAccount, createAccount, updateAccount, deleteAccount (with x-pin-token header), reorderAccounts
- `src/api/transactions.ts` — 5 typed API functions: fetchTransactions (with query params for search/filter/pagination), fetchTransaction, updateTransaction, deleteTransaction (with x-pin-token header), bulkUpdateCategory
- `src/api/categories.ts` — fetchCategories

### React Query Hooks

- `src/hooks/useAccounts.ts` — useAccounts, useAccount, useCreateAccount, useUpdateAccount, useDeleteAccount, useReorderAccounts; mutations invalidate `["accounts"]` and `["dashboard"]` keys
- `src/hooks/useTransactions.ts` — useTransactions (useInfiniteQuery with PAGE_SIZE=50), useTransaction, useUpdateTransaction, useDeleteTransaction, useBulkUpdateCategory, useCategories (10-minute staleTime)

### Navigation

- `src/navigation/types.ts` — Exported AccountsStackParamList and ActivityStackParamList type definitions
- `src/navigation/AppNavigator.tsx` — Added AccountsStackNavigator (AccountsList → AccountType → AccountDetail) and ActivityStackNavigator (TransactionsList → TransactionDetail) as nested native stack navigators inside the bottom tab navigator; tab screens use headerShown: false so stacks provide their own headers with back buttons

### Common Components

- `src/components/common/EmptyState.tsx` — Generic empty state with message and optional action button
- `src/components/common/FormField.tsx` — Text input with label, error message, and keyboard type support
- `src/components/common/CurrencyInput.tsx` — Currency-formatted numeric input with "$" prefix using FormField internally
- `src/components/common/PickerField.tsx` — Dropdown field via @gorhom/bottom-sheet with BottomSheetFlatList option picker
- `src/components/common/PinGateModal.tsx` — PIN verification modal with 4-digit auto-advancing inputs, checks isPinValid() first to skip if recently verified, haptic feedback on success/failure

### Account Components

- `src/components/accounts/AccountGroupHeader.tsx` — Pressable Card row for type groups with count badge, total balance, and chevron
- `src/components/accounts/AccountCard.tsx` — Single account row with name, institution, balance; dimmed when inactive
- `src/components/accounts/BalanceHistoryChart.tsx` — Full-width LineChart with area fill, compact Y-axis formatting, tight Y-axis range (yAxisOffset near min value), unique color per account derived from accountId hash against CATEGORY_COLORS palette
- `src/components/accounts/AccountFormSheet.tsx` — 85% snap bottom sheet form with all account fields (name, type, institution, balance, interest rate, active/favorite/exclude toggles), collapsible advanced section (account number, DTI percentage, estimated value)

### Transaction Components

- `src/components/transactions/SearchBar.tsx` — Search input with magnify icon and clear button
- `src/components/transactions/SwipeableRow.tsx` — Swipe-to-reveal wrapper using react-native-gesture-handler Swipeable with Edit/Delete actions and haptic feedback
- `src/components/transactions/TransactionRow.tsx` — Transaction row with date, description, category badge, amount (green for positive), wrapped in SwipeableRow
- `src/components/transactions/TransactionFilters.tsx` — Horizontal ScrollView with Account/Category/Date Range filter chips; each opens a BottomSheetModal picker (renders via portal above all content); 50% opacity dark backdrop; "Clear All" chip in destructive color; date presets: This Month, Last Month, Last 3/6 Months, This Year, All Time
- `src/components/transactions/TransactionEditSheet.tsx` — Bottom sheet (60% snap) for editing category (PickerField) and notes (FormField multiline)

### Screens

- `src/screens/AccountsScreen.tsx` — Replaced placeholder; grouped account list via ACCOUNT_TYPE_GROUPS (from shared), FAB button for create, pull-to-refresh, skeleton loading, empty state with create action
- `src/screens/AccountTypeScreen.tsx` — Filtered account list within a type group, sorted by sortOrder, navigates to AccountDetail
- `src/screens/AccountDetailScreen.tsx` — Balance hero with type badge, BalanceHistoryChart with TimeRangeSelector, recent transactions (last 10), header edit/delete icons, "See All" navigates to Activity tab with accountId filter via CommonActions.navigate, PinGateModal for delete, AccountFormSheet for edit
- `src/screens/TransactionsScreen.tsx` — Full transaction list with SearchBar (300ms debounced), TransactionFilters, infinite scroll FlatList with onEndReached, accepts optional accountId route param for pre-filtering, syncs filter state on route param changes
- `src/screens/TransactionDetailScreen.tsx` — Hero amount (colored green/red), date, description, account name; editable category (PickerField) and notes (FormField); PIN-gated delete

### Modified Common Components

- `src/components/common/SectionHeader.tsx` — Action link now uses primary blue color with chevron-right icon for better tap affordance
- `App.tsx` — Added BottomSheetModalProvider wrapper for portal-based bottom sheet rendering

## Mobile UX Adaptations

- **BottomSheetModal with backdrop** — Filter pickers use BottomSheetModal (portal rendering) with 50% opacity backdrop to prevent z-index issues where sheets appeared behind content
- **Unique chart colors** — Each account's balance chart gets a deterministic color from hashing accountId against CATEGORY_COLORS palette, preventing all charts from looking identical
- **Tight Y-axis range** — Balance charts use yAxisOffset near the minimum value so data fills the chart area instead of stretching from $0
- **Cross-navigator navigation** — "See All" from account detail uses CommonActions.navigate for reliable cross-tab navigation with accountId pre-filter
- **Route param sync** — TransactionsScreen watches route params via useEffect so navigating to an already-mounted screen correctly applies the account filter
- **Haptic feedback** — On pull-to-refresh, filter chip taps, swipe threshold, PIN entry

## Files Created (23 new files)

- `src/api/accounts.ts`, `src/api/transactions.ts`, `src/api/categories.ts`
- `src/hooks/useAccounts.ts`, `src/hooks/useTransactions.ts`
- `src/navigation/types.ts`
- `src/components/common/EmptyState.tsx`, `FormField.tsx`, `CurrencyInput.tsx`, `PickerField.tsx`, `PinGateModal.tsx`
- `src/components/accounts/AccountGroupHeader.tsx`, `AccountCard.tsx`, `BalanceHistoryChart.tsx`, `AccountFormSheet.tsx`
- `src/components/transactions/SearchBar.tsx`, `SwipeableRow.tsx`, `TransactionRow.tsx`, `TransactionFilters.tsx`, `TransactionEditSheet.tsx`
- `src/screens/AccountTypeScreen.tsx`, `AccountDetailScreen.tsx`, `TransactionDetailScreen.tsx`

## Files Modified

- `packages/mobile/package.json` — 1 new dependency (expo-blur)
- `packages/mobile/App.tsx` — Added BottomSheetModalProvider wrapper
- `packages/mobile/src/navigation/AppNavigator.tsx` — Added AccountsStackNavigator and ActivityStackNavigator
- `packages/mobile/src/screens/AccountsScreen.tsx` — Replaced placeholder with grouped account list
- `packages/mobile/src/screens/TransactionsScreen.tsx` — New screen (replaces ActivityScreen via stack navigator)
- `packages/mobile/src/components/common/SectionHeader.tsx` — Action link styling (primary color + chevron)

## Files Deleted

- `src/screens/ActivityScreen.tsx` — Replaced by TransactionsScreen via ActivityStackNavigator

## Verification

1. `npx turbo run type-check --force` passes across all workspace packages
2. Accounts tab: grouped list → type → detail drill-down works
3. Account CRUD: create, edit, delete (PIN-gated) all functional
4. Activity tab: transactions load with infinite scroll
5. Search with 300ms debounce filters correctly
6. Filter chips work (account, category, date range) with backdrop overlay
7. Swipe-to-edit on transaction rows works
8. Transaction detail: edit category/notes saves correctly
9. Delete transaction (PIN-gated) works
10. Pull-to-refresh on all screens
11. Skeleton loading states while data loads
12. Empty states render correctly
13. "See All" from account detail navigates to Activity tab with account filter applied
14. Each account chart has a unique color

## Dependencies

- [Phase 0 — Project Setup & Auth](00-project-setup-and-auth.md)
- [Phase 1 — Dashboard](01-dashboard.md)
