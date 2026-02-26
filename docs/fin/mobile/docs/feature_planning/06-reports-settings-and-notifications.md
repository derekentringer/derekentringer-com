# Phase 6 — Reports, Settings & Notifications

**Status:** Not Started
**Priority:** Medium
**Note:** The More screen shell is already in place (v1.19.1) with placeholder menu rows for Settings, Notifications, AI Insights, Reports, and About. This phase replaces the placeholders with full functionality.

## Summary

AI digests, full settings CRUD, notification history, and push notifications (Android only via FCM).

## Screens

- `ReportsScreen` — top tabs: Monthly Digest, Quarterly Digest (AI-generated, completed periods only)
- `SettingsScreen` — sectioned list navigating to sub-screens
- `CategoriesSettingsScreen`, `CategoryRulesSettingsScreen`, `IncomeSourcesSettingsScreen` — each with CRUD
- `NotificationSettingsScreen` — per-type toggles with config, device management, test notification
- `AiInsightSettingsScreen` — master toggle, per-feature toggles, refresh frequency, cache clear
- `NotificationHistoryScreen` — list with read/unread, mark all read, clear
- Create/edit modal screens for categories, rules, income sources

## Components

- `src/components/settings/SettingsRow.tsx`, `SettingsSection.tsx`
- `src/components/notifications/NotificationRow.tsx`, `NotificationBell.tsx` (header bell with badge)
- `src/components/reports/InsightCard.tsx`

## Services

- `src/services/notifications.ts` — FCM registration (Android only), device token registration with backend, notification listeners, tap-to-navigate mapping

## Hooks

- `src/hooks/useCategories.ts`, `useCategoryRules.ts`, `useIncomeSources.ts` — CRUD hooks
- `src/hooks/useNotifications.ts` — useNotificationPreferences, useUpdateNotificationPreference, useNotificationHistory (infinite), useUnreadCount (poll 60s), useMarkAllRead, useClearHistory, useDevices, useRegisterDevice, useSendTestNotification
- `src/hooks/useAiInsights.ts` — useAiPreferences, useUpdateAiPreferences, useAiInsights, useClearAiCache

## Verification

- Push notification registration on Android device
- Notification bell badge updates on 60s poll
- AI insights load on dashboard and reports
- Settings CRUD for categories, rules, income sources
- Notification history with read/unread states

## Dependencies

- [Phase 5 — Portfolio & Decision Tools](05-portfolio-and-decision-tools.md)
