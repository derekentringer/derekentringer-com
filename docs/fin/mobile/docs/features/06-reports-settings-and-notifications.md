# 06 — Reports, Settings & Notifications

**Status:** Complete
**Phase:** 6 — Reports, Settings & Notifications
**Priority:** Medium
**Completed:** v1.24.0

## Summary

Full settings CRUD screens (categories, category rules, income sources), notification preferences and history with push registration (Android/FCM), AI insights settings with per-feature toggles and cache management, AI-generated monthly/quarterly digest reports, and an About screen. Replaces the "Coming Soon" placeholders on the More tab with full functionality. Adds date-based section separators across all date-ordered lists, standardized row heights, and a notification bell badge on the Dashboard header.

## Screens

- `SettingsScreen` — menu hub with 3 rows: Categories, Category Rules, Income Sources
- `CategoriesScreen` — FlatList with SwipeableRow for edit/delete, FAB for add, CategoryFormSheet bottom sheet; default categories cannot be deleted
- `CategoryRulesScreen` — FlatList of rules with pattern, matchType badge, category, priority; CategoryRuleFormSheet with "Apply to existing" switch
- `IncomeSourcesScreen` — FlatList with amount, frequency badge, active/inactive badge; delete uses PinGateModal; IncomeSourceFormSheet with detected income suggestions
- `NotificationPreferencesScreen` — groups by NOTIFICATION_CATEGORIES (reminders, alerts, milestones); per-type toggles with gear icon → NotificationConfigSheet; "View History" link and "Send Test Notification" button
- `NotificationHistoryScreen` — SectionList with month/year sticky headers, infinite scroll, type badge, title, body, relative time, unread dot; header: "Mark Read" + "Clear" buttons
- `AiInsightsSettingsScreen` — master toggle, per-feature toggles (disabled when master off), refresh frequency pills, daily usage counter, clear cache button, "Insight History" section with date-grouped archive (infinite scroll, severity-colored borders, scope badges, muted styling for read/dismissed)
- `ReportsScreen` — SegmentedControl (Monthly / Quarterly) with AiDigestSection below
- `AboutScreen` — centered FinLogo, "Fin" text, version from expo-constants

## Components

### Settings
- `CategoryFormSheet.tsx` — bottom sheet with single name FormField, create/edit mode
- `CategoryRuleFormSheet.tsx` — bottom sheet: pattern, matchType PickerField, category PickerField (from useCategories), priority, "Apply to existing" Switch
- `IncomeSourceFormSheet.tsx` — bottom sheet: name, CurrencyInput, frequency PickerField, isActive Switch, notes; detected patterns section when creating (tappable to auto-fill)

### Notifications
- `NotificationConfigSheet.tsx` — bottom sheet with type-specific config fields (reminderDaysBefore, thresholds, warnAtPercent/alertAtPercent, threshold amount, milestones)
- `NotificationBadge.tsx` — bell icon with red count badge ("9+" if >9), polls unread count every 60s, tapping navigates to More > NotificationHistory

### Reports
- `AiDigestSection.tsx` — period navigation (prev/next chevrons), checks AI prefs, insight cards with severity-colored left border and type icons, disclaimer text

### Common
- `MenuRow.tsx` — extracted from MoreScreen for reuse; exports MenuRow, MenuSection, MenuSeparator
- `DateSectionHeader.tsx` — shared month/year section header component with groupByMonth utility; matches BillsScreen section style

## API Layer

`src/api/categories.ts` — added 3 functions: `createCategory`, `updateCategory`, `deleteCategory`

`src/api/categoryRules.ts` — 4 functions: `fetchCategoryRules`, `createCategoryRule`, `updateCategoryRule`, `deleteCategoryRule`; supports `?apply=true` query param

`src/api/incomeSources.ts` — 5 functions: `fetchIncomeSources(active?)`, `fetchDetectedIncome`, `createIncomeSource`, `updateIncomeSource`, `deleteIncomeSource`

`src/api/notifications.ts` — 10 functions: `registerDevice`, `fetchDevices`, `removeDevice`, `fetchNotificationPreferences`, `updateNotificationPreference`, `fetchNotificationHistory`, `fetchUnreadCount`, `markAllNotificationsRead`, `clearNotificationHistory`, `sendTestNotification`

`src/api/ai.ts` — added 6 functions: `updateAiPreferences`, `clearAiCache`, `markInsightsRead`, `markInsightsDismissed`, `fetchUnseenInsightCounts`, `fetchInsightArchive`; updated `fetchAiInsights` to accept optional `{ month?, quarter? }` options

## Hooks

`src/hooks/useCategories.ts` — `useCategories`, `useCreateCategory`, `useUpdateCategory`, `useDeleteCategory`; invalidates `["categories"]`

`src/hooks/useCategoryRules.ts` — `useCategoryRules`, `useCreateCategoryRule`, `useUpdateCategoryRule`, `useDeleteCategoryRule`; invalidates `["categoryRules"]`, also `["transactions"]` when apply=true

`src/hooks/useIncomeSources.ts` — `useIncomeSources(active?)`, `useDetectedIncome`, `useCreateIncomeSource`, `useUpdateIncomeSource`, `useDeleteIncomeSource`; invalidates `["incomeSources"]`, `["projections"]`

`src/hooks/useNotifications.ts` — `useNotificationPreferences`, `useUpdateNotificationPreference`, `useNotificationHistory(limit)` (useInfiniteQuery), `useUnreadCount` (refetchInterval: 60_000), `useMarkAllRead`, `useClearHistory`, `useSendTestNotification`, `useRegisterDevice`

`src/hooks/useAiSettings.ts` — `useUpdateAiPreferences`, `useClearAiCache`, `useMarkInsightsRead`, `useMarkInsightsDismissed`, `useUnseenInsightCounts`, `useInsightArchive` (infinite query)

`src/hooks/useReports.ts` — `useAiDigest(scope, options?, enabled?)` with queryKey `["ai", "digest", scope, period]`

## Services

`src/services/pushNotifications.ts` — `registerForPushNotifications()` (device check, permissions, native FCM device token via `getDevicePushTokenAsync`, register API), `unregisterPushNotifications(deviceId)`, foreground notification handler with `shouldShowBanner`/`shouldShowList` (not deprecated `shouldShowAlert`), Android channel `finance_notifications` matching backend's `fcm.ts`

## Navigation Changes

- Added `MoreStackParamList` with 10 routes (MoreHome, Settings, Categories, CategoryRules, IncomeSources, NotificationPreferences, NotificationHistory, AiInsightsSettings, Reports, About)
- Created `MoreStackNavigator` with nested native stack; replaced direct MoreScreen in MainTabNavigator
- All More menu rows now navigate to sub-screens (replaced disabled placeholders)
- `NotificationBadge` added as headerRight on Dashboard tab

## UI Refinements

- Row heights standardized to `spacing.md` (16px) across all list screens: BillInstanceRow, BillDefinitionRow, BudgetCategoryRow, MenuRow, CategoriesScreen, CategoryRulesScreen, IncomeSourcesScreen, NotificationHistoryScreen
- Date-based section separators (month/year sticky headers) added to TransactionsScreen, NotificationHistoryScreen, AccountDetailScreen, and BillsScreen (refactored to shared component)
- FavoriteAccountCards converted from horizontal FlatList to ScrollView to fix VirtualizedList nesting warning
- Transaction dates formatted on AccountDetailScreen (was showing raw ISO strings)

## Dependencies

- `expo-notifications` — push notification registration
- `expo-device` — device detection for push
- `expo-constants` — app version display
- All API endpoints already exist on finance-api — this is mobile UI-only

## Verification

- More tab: all menu rows navigate to working sub-screens
- Categories: CRUD works, default category cannot be deleted
- Category Rules: CRUD works, "Apply to existing" applies rule to transactions
- Income Sources: CRUD works, delete requires PIN, detected patterns show when creating
- Notification preferences: toggles persist, type-specific config saves
- Notification history: infinite scroll loads with month/year sections, mark all read clears dots, clear empties list
- Notification bell badge: shows unread count on Dashboard, tapping navigates to history
- AI Insights settings: master toggle disables features, refresh frequency changes, cache clears
- Reports: Monthly/Quarterly tabs, period navigation, insights display, disabled state links to settings
- About screen: shows logo and version
- Push notifications (Android): registers native FCM device token, test notification received, foreground display without deprecation warnings
- Date section headers appear on all date-based lists
- Row heights consistent across all list screens
- Pull-to-refresh works on all new screens
- Type-check passes across all packages
