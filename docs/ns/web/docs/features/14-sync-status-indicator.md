# 14 — Sync Status Indicator

**Status:** Complete
**Phase:** UI Enhancements
**Priority:** Medium
**Completed:** v1.65.0

## Summary

Replaces the simple green/yellow dot `OnlineStatusIndicator` (2 states: online/offline) with an interactive `SyncStatusButton` (4 states: idle/syncing/error/offline) matching the desktop app. Adds `onConnect` callback to the SSE client, sync status state tracking, and manual sync via button click.

---

## What Was Implemented

### 1. SyncStatusButton component

**File**: `packages/ns-web/src/components/SyncStatusButton.tsx` (Created)

Interactive button with 4 distinct SVG icons and states:
- **idle** — checkmark-circle icon in dimmed green (`text-green-600/50`), brightens on hover
- **syncing** — refresh-arrow icon with `animate-spin` CSS animation
- **error** — alert-circle icon in destructive red, clickable to retry
- **offline** — wifi-off icon, disabled with reduced opacity

Exports `SyncStatus` type (`"idle" | "syncing" | "error" | "offline"`) for use in NotesPage.

Optional `pendingCount` prop enriches the offline tooltip: `"Offline — X pending"` when count > 0, otherwise `"Offline"`.

Component matches the desktop `SyncStatusButton` exactly (same SVGs, layout, interaction) with the addition of `pendingCount`.

### 2. SSE `onConnect` callback

**File**: `packages/ns-web/src/api/sse.ts` (Modified)

Added third optional parameter `onConnect` to `connectSseStream`:

```typescript
export function connectSseStream(
  onEvent: () => void,
  onError?: () => void,
  onConnect?: () => void,
): SseConnection
```

`onConnect` fires after successful fetch (line 86, after `backoffMs = 1000` reset). Fires on initial connect and every reconnect (13-min JWT refresh, visibility restore, backoff recovery).

### 3. Sync status tracking in NotesPage

**File**: `packages/ns-web/src/pages/NotesPage.tsx` (Modified)

- Added `syncStatus` and `syncError` state
- Offline/online effect: sets `"offline"` when `isOnline` goes false; SSE `onConnect` restores to `"idle"`
- SSE handler updated: sets `"syncing"` → reloads data via `Promise.all` → sets `"idle"` on success or `"error"` on failure
- `handleManualSync` callback: full data reload triggered by button click with status tracking
- Replaced `<OnlineStatusIndicator>` render with `<SyncStatusButton>` passing `syncStatus`, `syncError`, `handleManualSync`, and `pendingCount`

### 4. Dimmed green idle color (web + desktop)

**Files**: `packages/ns-web/src/components/SyncStatusButton.tsx`, `packages/ns-desktop/src/components/SyncStatusButton.tsx`

Idle state uses `text-green-600/50` (dimmed green at 50% opacity) instead of `text-muted-foreground`. Hover brightens to `text-green-500`.

### 5. Deleted OnlineStatusIndicator

**Files**: `packages/ns-web/src/components/OnlineStatusIndicator.tsx` (Deleted), `packages/ns-web/src/__tests__/OnlineStatusIndicator.test.tsx` (Deleted)

Old 2-state indicator removed — only consumer was NotesPage (updated in step 3).

## Status Flow

```
Mount → "idle" (optimistic)
  ↓
SSE connects → onConnect → "idle" (confirmed)
  ↓
SSE sync event → "syncing" → reload data → "idle" | "error"
  ↓
SSE connection drops → onError → "error" → auto-reconnect → onConnect → "idle"
  ↓
Browser offline → "offline"
  ↓
Browser online → SSE reconnects → onConnect → "idle"
  ↓
Manual sync click → "syncing" → reload data → "idle" | "error"
```

## Files Changed

| File | Action |
|------|--------|
| `packages/ns-web/src/api/sse.ts` | Modified — `onConnect` callback parameter |
| `packages/ns-web/src/components/SyncStatusButton.tsx` | Created — 4-state sync button with `pendingCount` |
| `packages/ns-web/src/components/OnlineStatusIndicator.tsx` | Deleted |
| `packages/ns-web/src/pages/NotesPage.tsx` | Modified — sync status state, SSE callbacks, manual sync, component swap |
| `packages/ns-desktop/src/components/SyncStatusButton.tsx` | Modified — dimmed green idle color |

## Tests

| Test file | Changes |
|-----------|---------|
| `packages/ns-web/src/__tests__/SyncStatusButton.test.tsx` | Created — 10 tests (4 status titles, disabled/enabled, onSync click, animate-spin, 2 pendingCount tooltip tests) |
| `packages/ns-web/src/__tests__/OnlineStatusIndicator.test.tsx` | Deleted |
| `packages/ns-web/src/__tests__/sse.test.ts` | +2 tests: onConnect fires on success, does not fire on failure |
| `packages/ns-web/src/__tests__/NotesPage.test.tsx` | Added SSE mock to prevent unmocked connections |

## Dependencies

- [05 — Offline Cache](05-offline-cache.md) — `useOfflineCache` provides `isOnline`, `pendingCount`
- [13 — Sync Hardening](13-sync-hardening.md) — SSE refs pattern, `onConnect` builds on stable SSE infrastructure
