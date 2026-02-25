# 12 — Notification System

**Status:** Complete
**Phase:** 4 — Dashboard & Tracking
**Priority:** High

## Summary

Notification system with scheduler-based evaluation, per-type preferences, browser notifications via polling, and FCM infrastructure for future mobile push. All 8 notification types are implemented across 3 phases: date-based reminders (Phase 1), threshold-based alerts (Phase 2), and statement reminders + milestones (Phase 3).

## Architecture

- **Web notifications**: Polling-based (30s interval) — polls `/notifications/history` for new unread items, shows browser `Notification` popups. No Firebase client SDK on web.
- **Mobile notifications (future)**: FCM push via `firebase-admin` server SDK. Device tokens registered per-device, multicast delivery with automatic invalid token cleanup.
- **Scheduler**: `setInterval` inside finance-api (15-minute cycle). Evaluates all enabled notification types, deduplicates via unique keys, logs to database, sends via FCM to registered mobile devices.
- **Storage**: Three Prisma models — `DeviceToken`, `NotificationPreference`, `NotificationLog`.

## What Was Implemented

### Shared Package (`packages/shared/`)

**Types (`src/finance/types.ts`):**

- `NotificationType` enum — 8 notification types across 3 phases
- Per-type config interfaces: `BillDueConfig`, `CreditPaymentDueConfig`, `LoanPaymentDueConfig`, `HighCreditUtilizationConfig`, `BudgetOverspendConfig`, `LargeTransactionConfig`, `StatementReminderConfig`, `MilestonesConfig`
- `NotificationConfig` union type
- API request/response types: `DeviceToken`, `NotificationPreference`, `NotificationLogEntry`, `TestNotificationResponse`
- Default configs per type: `DEFAULT_NOTIFICATION_CONFIGS`
- Label/description/category/phase maps: `NOTIFICATION_LABELS`, `NOTIFICATION_DESCRIPTIONS`, `NOTIFICATION_CATEGORIES`, `NOTIFICATION_PHASES`

### Finance API (`packages/finance-api/`)

#### Prisma Schema

Three new models:

```prisma
model DeviceToken {
  id        String   @id @default(cuid())
  token     String   @unique       // encrypted FCM token
  platform  String                 // "web" | "ios" | "android"
  name      String?                // encrypted device label
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@map("device_tokens")
}

model NotificationPreference {
  id        String   @id @default(cuid())
  type      String   @unique       // NotificationType enum value
  enabled   Boolean  @default(true)
  config    String?                // encrypted JSON config, null = use defaults
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@map("notification_preferences")
}

model NotificationLog {
  id           String   @id @default(cuid())
  type         String
  title        String                 // encrypted
  body         String                 // encrypted
  dedupeKey    String   @unique
  isRead       Boolean  @default(false)
  isCleared    Boolean  @default(false)  // soft-delete flag; preserves dedup keys
  sentAt       DateTime @default(now())
  fcmMessageId String?
  metadata     String?               // encrypted JSON
  @@index([isCleared])
  @@map("notification_logs")
}
```

Migrations: `20260222000000_add_notifications`, `20260223000000_add_notification_is_cleared`

#### Notification Store (`src/store/notificationStore.ts`)

CRUD operations for all three models:

- **Device tokens**: `registerDeviceToken()`, `getAllEncryptedTokens()`, `listDeviceTokens()`, `removeDeviceToken()`, `removeDeviceTokenByEncryptedToken()`
- **Preferences**: `getPreferences()` (auto-seeds defaults for missing types), `getPreference()`, `updatePreference()`
- **Notification log**: `createNotificationLog()`, `getNotificationHistory()`, `getUnreadCount()`, `markAllNotificationsRead()`, `clearNotificationHistory()` (soft-delete via `isCleared` flag), `cleanupOldNotificationLogs()` (90-day retention), `updateNotificationLogFcmId()`, `checkDedupeKeyExists()` (checks all rows regardless of `isCleared`)

#### API Routes (`src/routes/notifications.ts`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/notifications/devices` | Register FCM device token |
| GET | `/notifications/devices` | List registered devices |
| DELETE | `/notifications/devices/:id` | Remove device |
| GET | `/notifications/preferences` | List all preferences (seeds defaults if empty) |
| PATCH | `/notifications/preferences/:type` | Update enabled/config for a type |
| GET | `/notifications/history` | Paginated notification log (`?limit=20&offset=0`) |
| GET | `/notifications/unread-count` | Returns `{ count: number }` for bell badge |
| POST | `/notifications/mark-all-read` | Sets `isRead = true` on all unread |
| DELETE | `/notifications/history` | Soft-clears all notification log entries (`isCleared = true`); returns `{ cleared: number }` |
| POST | `/notifications/test` | Creates test notification + sends via FCM |

#### FCM Integration (`src/lib/fcm.ts`)

- Uses `firebase-admin` SDK with service account credentials
- `sendToAllDevices(payload, notificationLogId?)` — decrypts all stored device tokens, sends multicast
- Platform-specific payloads: Android (high priority, channelId), iOS (APNs with sound/badge)
- Auto-removes invalid/expired tokens on `UNREGISTERED`/`INVALID_ARGUMENT` errors
- Graceful skip when Firebase credentials not configured (dev mode)

#### Notification Evaluator (`src/lib/notificationEvaluator.ts`)

**Phase 1 evaluators (date-based reminders):**

- **Bill Due**: Reuses `generateDueDates()` from billStore, checks payment records, fires within reminder window for unpaid bills
- **Credit Payment Due**: Reads `paymentDueDate` from latest CreditProfile, fires within reminder window
- **Loan Payment Due**: Reads `nextPaymentDate` from latest LoanProfile, fires within reminder window

**Phase 2 evaluators (threshold-based alerts):**

- **High Credit Utilization**: Queries active credit accounts, decrypts `creditLimit` and `availableCredit` from latest balance's CreditProfile, computes `(creditLimit - availableCredit) / creditLimit * 100`. Fires at highest exceeded threshold from configurable list (default: [30, 70]). Deduped per account/threshold/month.
- **Budget Overspend**: Reuses `getActiveBudgetsForMonth()` and `computeSpendingSummary()` to compare actual spending against budgets. Fires "exceeded" at `alertAtPercent` (default 100%) or "warning" at `warnAtPercent` (default 80%). Deduped per category/level/month.
- **Large Transaction**: Scheduler-based with 7-day lookback window. Queries recent transactions, decrypts amounts, fires for `abs(amount) >= threshold` (default $500). 7-day window prevents alerts for historical imports. Deduped per transaction ID.

**Phase 3 evaluators (statement reminders + milestones):**

- **Statement Reminder**: For each active account, estimates next statement close from `periodEnd` in CreditProfile/LoanProfile (adds 1 month). Falls back to configurable `fallbackDayOfMonth` (default 28th) when no period data exists. Fires within `reminderDaysBefore` (default 3) of close date. Deduped per account/month.
- **Milestones**: Two sub-checks:
  - *Net worth*: Uses `computeNetWorthSummary()`, fires at highest crossed milestone from configurable list (default: $50k, $100k, $250k, $500k, $1M). Deduped per milestone amount (fires once ever).
  - *Loan payoff*: For each active loan with `originalBalance`, computes payoff percentage. Fires at highest crossed milestone (default: 25%, 50%, 75%, 90%, 100%). Special messaging for 100% (fully paid off). Deduped per account/milestone.

All evaluators: check preference enabled, check dedupe key, skip if already sent.

#### Notification Scheduler (`src/lib/notificationScheduler.ts`)

- `startNotificationScheduler()` / `stopNotificationScheduler()` — `setInterval` at 15-minute cycles
- Calls evaluator, logs notifications, sends via FCM
- Import guard: skips evaluation when `isImporting` flag is set
- Wired into `app.ts` `onReady`/`onClose` lifecycle hooks

#### App Integration (`src/app.ts`)

- Notification routes registered at `/notifications`
- Scheduler started on `onReady`, stopped on `onClose`
- 90-day log cleanup added to existing hourly token cleanup timer

#### Config (`src/config.ts`)

New fields: `fcmProjectId`, `fcmClientEmail`, `fcmPrivateKey`

#### Mappers (`src/lib/mappers.ts`)

New encrypt/decrypt functions for DeviceToken, NotificationPreference, NotificationLog models.

### Finance Web (`packages/finance-web/`)

#### Browser Notification Hook (`src/hooks/useBrowserNotifications.ts`)

- Polls `/notifications/history` every 30 seconds
- Shows browser `Notification` popups for new unread items
- Tracks shown IDs in `useRef(new Set())` to prevent duplicate popups
- Skips on first load (seeds shown set from existing unread)
- Dispatches `notification-refresh` event for bell badge sync
- Activated in `AppLayout.tsx`

#### API Client (`src/api/notifications.ts`)

- `registerDevice()`, `fetchDevices()`, `removeDevice()`
- `fetchNotificationPreferences()`, `updateNotificationPreference()`
- `fetchNotificationHistory()`, `fetchUnreadCount()`, `markAllRead()`, `clearNotificationHistory()`
- `sendTestNotification()`

#### Notification Bell (`src/components/NotificationBell.tsx`)

- Bell icon in header (between username and logout button)
- Red dot overlay when unread count > 0
- Polls unread count every 60 seconds + listens for `notification-refresh` events
- Radix `Popover` dropdown with:
  - Notification list (title, body, relative time, unread highlight)
  - "Mark All Read" and "Clear All" buttons
  - "Load More" pagination
  - Empty state message

#### Notification Settings (`src/components/NotificationSettings.tsx`)

Two cards in Settings > Notifications tab:

**Browser Notifications card:**
- Permission status badge (Enabled / Blocked / Not set)
- "Enable Notifications" button (requests `Notification.requestPermission()`)
- "Send Test" button
- Mobile device list (for future React Native devices)

**Notification Preferences card:**
- Grouped by category (Reminders / Alerts / Milestones) with explicit display ordering (Statement Reminder first in Reminders)
- Per-type toggle switch (enabled/disabled) — all 8 types active
- Configure button opens dialog with type-specific fields:
  - Bill/Credit/Loan Due: reminder days before
  - Credit Utilization: threshold list
  - Budget: warn/alert percentages
  - Large Transaction: dollar threshold
  - Statement Reminder: reminder days + fallback day
  - Milestones: net worth values + payoff percentages

#### UI Components

- `src/components/ui/switch.tsx` — Radix UI Switch toggle
- `src/components/ui/popover.tsx` — Radix UI Popover

#### Settings Page (`src/pages/SettingsPage.tsx`)

- Added "Notifications" tab to existing TabSwitcher

#### Header (`src/components/Header.tsx`)

- Added `NotificationBell` component between username and logout button

## Files Created

| File | Description |
|------|-------------|
| `packages/finance-api/prisma/migrations/20260222000000_add_notifications/migration.sql` | Migration SQL |
| `packages/finance-api/src/store/notificationStore.ts` | CRUD for device tokens, preferences, logs |
| `packages/finance-api/src/routes/notifications.ts` | API endpoints |
| `packages/finance-api/src/lib/fcm.ts` | Firebase Admin FCM integration |
| `packages/finance-api/src/lib/notificationEvaluator.ts` | Phase 1 evaluators |
| `packages/finance-api/src/lib/notificationScheduler.ts` | Scheduler lifecycle |
| `packages/finance-web/src/api/notifications.ts` | Frontend API client |
| `packages/finance-web/src/hooks/useBrowserNotifications.ts` | Polling-based browser notifications |
| `packages/finance-web/src/components/NotificationBell.tsx` | Bell icon + popover |
| `packages/finance-web/src/components/NotificationSettings.tsx` | Settings UI |
| `packages/finance-web/src/components/ui/switch.tsx` | Toggle switch component |
| `packages/finance-web/src/components/ui/popover.tsx` | Popover component |

## Files Modified

| File | Changes |
|------|---------|
| `packages/shared/src/finance/types.ts` | NotificationType enum, config interfaces, API types |
| `packages/shared/src/index.ts` | Re-export notification types |
| `packages/finance-api/prisma/schema.prisma` | 3 new models |
| `packages/finance-api/src/app.ts` | Route registration, scheduler lifecycle, log cleanup |
| `packages/finance-api/src/config.ts` | Firebase credential fields |
| `packages/finance-api/src/lib/mappers.ts` | Encrypt/decrypt for new models |
| `packages/finance-api/.env.example` | Firebase env vars |
| `packages/finance-web/src/components/AppLayout.tsx` | Activate browser notification hook |
| `packages/finance-web/src/components/Header.tsx` | Add NotificationBell |
| `packages/finance-web/src/pages/SettingsPage.tsx` | Add Notifications tab |

## Dependencies Added

| Package | Where | Purpose |
|---------|-------|---------|
| `firebase-admin` | finance-api | FCM server SDK for mobile push |
| `@radix-ui/react-switch` | finance-web | Toggle switch UI component |
| `@radix-ui/react-popover` | finance-web | Notification bell popover |

## Environment Variables

### Finance API

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREBASE_PROJECT_ID` | No | Firebase project ID; FCM disabled if missing |
| `FIREBASE_CLIENT_EMAIL` | No | Firebase service account email |
| `FIREBASE_PRIVATE_KEY` | No | Firebase service account private key |

## Design Decisions

- **Web: polling, not FCM push** — Firebase client SDK's `getToken()` produces orphaned tokens that don't reliably map to browser push subscriptions. Polling at 30s is lightweight and proven reliable.
- **Mobile: FCM via firebase-admin** — Standard approach for iOS/Android push. Device tokens registered per-device, server sends multicast.
- **NotificationPreference.config is nullable** — Null means "use defaults"; avoids conflict with encryption (encrypted empty JSON !== `"{}"`).
- **NotificationLog.dedupeKey is @unique** — Duplicate insert attempts caught as benign (safe during Railway rolling deploys).
- **Soft-delete on clear** — "Clear All" sets `isCleared = true` (via `updateMany`) instead of `deleteMany`, preserving dedup keys so cleared notifications don't re-fire on the next scheduler cycle. UI queries (`listNotificationLogs`, `getUnreadCount`, `markAllNotificationsRead`) filter by `isCleared: false`; `checkDedupeKeyExists` deliberately ignores `isCleared` to maintain dedup integrity. The `cleanupOldNotificationLogs` 90-day retention job eventually hard-deletes old rows.
- **Log retention: 90 days** — Cleanup runs on existing hourly timer in app.ts.
- **Scheduler interval: 15 minutes** — Date-based checks are lightweight; frequent enough for timely reminders.
- **Import guard** — Scheduler skips evaluation when statement import is in progress to avoid alerting on partially imported data.
- **Large Transaction: scheduler-based, not event-driven** — Simpler than wiring into import code paths. 7-day lookback window prevents alerts for historical imports; 15-minute scheduler is fast enough.
- **Credit utilization: highest threshold only** — When multiple thresholds are exceeded, only fires for the highest one to avoid notification spam.
- **Milestone dedupe: permanent** — Net worth milestones deduped per amount (no date suffix), so they fire only once ever. Loan payoff milestones deduped per account/percentage.
- **Statement Reminder: periodEnd extrapolation** — Estimates next close date by adding 1 month to last `periodEnd` from credit/loan profiles. Falls back to configurable day of month when no profile data exists.

## Resolved Open Questions

- **Web push delivery**: Firebase client SDK tokens unreliable on web; switched to polling-based browser notifications
- **Server FCM SDK**: firebase-admin (full SDK) vs google-auth-library (lightweight HTTP v1); chose firebase-admin for simpler API and future mobile support
- **Notification permission UX**: Browser permission is one-time; ongoing control via per-type preference toggles
- **Disable flow**: Users toggle individual notification types off via preferences; no app-level master toggle needed since per-type toggles cover all cases
