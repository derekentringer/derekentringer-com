# 04 — Sync Engine

**Status:** Complete
**Phase:** 2 — Organization & Sync
**Priority:** High
**Completed:** v1.93.31

## Summary

Offline-first sync engine for mobile, keeping the local SQLite database in sync with central PostgreSQL via ns-api. Same push → pull → SSE protocol as the desktop sync engine (`ns-desktop/src/lib/syncEngine.ts`). Reads from local SQLite, writes to SQLite + sync queue, and background-syncs with the server. Includes FTS5 local search, network status detection, offline banner, sync status indicator, and sync rejection handling UI.

## What Was Implemented

### Database Layer Enhancements

- **`src/lib/database.ts`** — Schema versioning via `sync_meta` table. Migration v2 creates `notes_fts` FTS5 virtual table + `fts_map` join table for full-text search. `initDatabase()` runs migrations on startup.
- **`src/lib/noteStore.ts`** — ~300 lines of sync-aware operations added:
  - **Sync queue**: `enqueueSyncAction`, `readSyncQueue`, `removeSyncQueueEntries`, `getSyncQueueCount`, `getSyncMeta`, `setSyncMeta`
  - **Remote upserts** (pull, no enqueue): `upsertNoteFromRemote` (LWW), `upsertFolderFromRemote`, `softDeleteNoteFromRemote`, `softDeleteFolderFromRemote`
  - **Local CRUD** (mutations, enqueue): `createNoteLocal`, `updateNoteLocal`, `deleteNoteLocal`, `toggleFavoriteLocal`, `createFolderLocal`, `renameFolderLocal`, `deleteFolderLocal`
  - **FTS**: `ftsInsert`, `ftsUpdate`, `ftsDelete`, `searchNotes` (FTS5 MATCH via `fts_map` join), `rebuildFtsIndex`
  - **Enhanced reads**: `getAllNotes` (favorite/limit/deletedOnly params), `getDashboardData`, `getTagsLocal`
  - **Sync readers**: `readNoteForSync`, `readFolderForSync`
- **`src/lib/types.ts`** — `SyncQueueEntry` interface

### Sync Engine Module

- **`src/lib/syncEngine.ts`** — ~500 lines mirroring desktop protocol:
  - **Constants**: DEBOUNCE_MS=5000, PERIODIC_MS=30000, MAX_BACKOFF_MS=60000, BATCH_LIMIT=100
  - **Public API**: `initSyncEngine(apiBaseUrl, getToken, callbacks)`, `destroySyncEngine()`, `notifyLocalChange()`, `manualSync()`
  - **Push**: read queue → deduplicate by entity_id → sort (folder creates → notes → folder deletes) → POST /sync/push → handle rejections → remove applied entries
  - **Pull**: read lastPullAt → POST /sync/pull → LWW apply → update cursor → loop if hasMore
  - **Force push/discard**: re-read entities, push with `force: true` or remove from queue and pull fresh
  - **SSE**: `XMLHttpRequest` streaming to `GET /sync/events?deviceId={deviceId}`. On "sync" event → `triggerSync()`. Reconnect with exponential backoff.
  - **App lifecycle**: `AppState` listener — "active" → connect SSE + sync, "background" → disconnect SSE
  - **Device ID**: Generated via `expo-crypto` `randomUUID()`, persisted in `sync_meta`

### Sync Store (Zustand)

- **`src/store/syncStore.ts`** — Bridges sync engine → React components:
  - `status` ("idle" | "syncing" | "error" | "offline"), `error`, `isOnline`, `lastSyncedAt`
  - `rejections`, `rejectionActions` (forcePush/discard functions)
  - `setStatus`, `setIsOnline`, `setRejections`, `clearRejections`

### Network Status Hook

- **`src/hooks/useNetworkStatus.ts`** — Initializes `@react-native-community/netinfo` listener, updates `syncStore.isOnline`

### Hook Layer Refactor (API-first → SQLite-first)

- **`src/hooks/useNotes.ts`** — `useNotes(filters)` → `useQuery` calling `getAllNotes(filters)` from SQLite. `useNote(id)` → SQLite read. `useDashboard()` → `getDashboardData()`. All mutations → SQLite local functions + `notifyLocalChange()`. Removed `useInfiniteQuery`.
- **`src/hooks/useFolders.ts`** — All reads → SQLite. All mutations → local functions + `notifyLocalChange()`.
- **`src/hooks/useTags.ts`** — `useTags()` → `getTagsLocal()` SQLite aggregation.
- **`src/hooks/useAutoSave.ts`** — Switched from API mutation hooks to SQLite local functions (`createNoteLocal`/`updateNoteLocal`). Same 500ms debounce.
- **`src/hooks/useTrash.ts`** — `useTrash()` → SQLite `getAllNotes({ deletedOnly: true })`. `useRestoreNote()` → clear deleted_at locally + enqueue + `notifyLocalChange()`. Permanent delete and empty trash remain API-only (server-side operation).

### Navigation & Initialization

- **`src/navigation/AppNavigator.tsx`** — `AuthenticatedApp` initializes database + sync engine on mount. Waits for `initDatabase()` before rendering screens (prevents race condition). Wire callbacks to syncStore + queryClient. OfflineBanner rendered above tab navigator with negative margin compensation to prevent double status bar gap.

### UI Components

- **`src/components/common/SyncStatusIndicator.tsx`** — Header icon: idle → cloud-check, syncing → cloud-sync (animated rotation), error → cloud-alert, offline → cloud-off. Tap for manual sync; shows rejection badge count when sync issues exist.
- **`src/components/common/OfflineBanner.tsx`** — Thin banner when offline: `[cloud-off] No internet — changes saved locally`. Positioned below status bar with safe area insets, uses `zIndex`/`elevation` to render above native navigator.
- **`src/components/sync/SyncIssuesSheet.tsx`** — Bottom sheet listing sync rejections with per-item Force Push / Discard actions + bulk "Force Push All" / "Discard All" buttons.

### Screen Updates

- **`src/screens/NotesScreen.tsx`** — SyncStatusIndicator in Notes header, SyncIssuesSheet bottom sheet
- **`src/screens/NoteListScreen.tsx`** — Removed infinite query, uses simple array from SQLite
- **`src/screens/NoteDetailScreen.tsx`** — Pull-to-refresh calls `manualSync()`
- **`src/screens/NoteEditorScreen.tsx`** — Shows "Saved locally" when offline (via syncStore)
- **`src/screens/SettingsScreen.tsx`** — Added Sync section with last synced time, "Sync Now" button, pending queue count, and "View Issues" link
- **`src/screens/TrashScreen.tsx`** — Updated to use SQLite-based trash query

### Testing

- **`src/__tests__/syncEngine.test.ts`** — 9 tests: init, status callbacks, push/pull protocol, dedup, rejection handling, backoff, SSE
- **`src/__tests__/syncStore.test.ts`** — 9 tests: status transitions, online state, rejections with action functions
- **`src/__tests__/noteStore.test.ts`** — Enhanced with sync queue, FTS, remote upsert, dashboard, and tags tests (24 total)
- **`src/__tests__/database.test.ts`** — Enhanced with schema versioning and FTS5 migration tests (8 total)

## Files Summary

| Action | File | Description |
|--------|------|-------------|
| Created | `src/lib/syncEngine.ts` | Core sync engine (~500 lines) |
| Created | `src/lib/types.ts` | SyncQueueEntry interface |
| Created | `src/store/syncStore.ts` | Zustand sync state store |
| Created | `src/hooks/useNetworkStatus.ts` | Network monitor hook |
| Created | `src/components/common/SyncStatusIndicator.tsx` | Sync status header icon |
| Created | `src/components/common/OfflineBanner.tsx` | Offline banner |
| Created | `src/components/sync/SyncIssuesSheet.tsx` | Sync rejection handling sheet |
| Created | `src/__tests__/syncEngine.test.ts` | Sync engine tests |
| Created | `src/__tests__/syncStore.test.ts` | Sync store tests |
| Modified | `src/lib/database.ts` | FTS5 tables, schema versioning |
| Modified | `src/lib/noteStore.ts` | Sync queue, FTS, local CRUD, remote upserts |
| Modified | `src/hooks/useNotes.ts` | API → SQLite reads + sync-aware mutations |
| Modified | `src/hooks/useFolders.ts` | API → SQLite reads + sync-aware mutations |
| Modified | `src/hooks/useTags.ts` | API → SQLite aggregation |
| Modified | `src/hooks/useAutoSave.ts` | SQLite-first save flow |
| Modified | `src/hooks/useTrash.ts` | SQLite reads for trash |
| Modified | `src/navigation/AppNavigator.tsx` | Init sync, offline banner, DB init gate |
| Modified | `src/screens/NoteListScreen.tsx` | Remove infinite query |
| Modified | `src/screens/NoteDetailScreen.tsx` | Sync-aware refresh |
| Modified | `src/screens/NoteEditorScreen.tsx` | "Saved locally" status |
| Modified | `src/screens/NotesScreen.tsx` | SyncStatusIndicator + SyncIssuesSheet |
| Modified | `src/screens/SettingsScreen.tsx` | Sync section |
| Modified | `src/screens/TrashScreen.tsx` | SQLite-based trash |
| Modified | `package.json` | Added expo-crypto, @react-native-community/netinfo |
| Modified | `jest.setup.js` | Mocks for NetInfo, expo-crypto, AppState |

## Dependency Installed

- `expo-crypto@~15.0.8` — for `randomUUID()` device ID generation (compatible with Expo SDK 54)
- `@react-native-community/netinfo` — network status detection (already installed)

## Verification

1. `npx tsc --noEmit` — clean
2. `npm test` — 182 tests pass across 15 suites
3. App launches, initial sync pulls all notes into SQLite
4. Notes list loads from SQLite (instant, no network spinner)
5. Create/edit/delete note works offline (saved to SQLite + sync queue)
6. Go online → changes push to server automatically
7. Edit note on web → SSE triggers pull on mobile → note updates
8. Network disconnect → offline banner shown, edits saved locally
9. Network reconnect → sync resumes, banner hides
10. Sync conflicts → rejection sheet with Force Push / Discard
11. Settings → Sync shows last synced time, Sync Now, pending count
12. FTS5 search returns relevant results from local data

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Mirror desktop sync engine protocol | Proven push → pull → SSE protocol, same API endpoints, consistent behavior across platforms |
| SQLite-first reads | Instant UI, no loading spinners, full offline support |
| expo-crypto for UUIDs | Native random UUID generation, compatible with Expo managed workflow |
| DB init gate in AppNavigator | Prevents React Query hooks from firing before SQLite tables exist (race condition fix) |
| Negative margin for offline banner | Native stack headers can't disable status bar inset (edge-to-edge ignores statusBarTranslucent), so negative margin compensates for double safe-area gap |
| zIndex/elevation on banner | Ensures banner renders above native stack navigator views on Android |
| Permanent delete stays API-only | Server-side operation — hard delete from PostgreSQL can't be done locally |
| LWW conflict resolution | Simple, predictable, matches desktop. Server-side rejection handling for edge cases. |

## Key Patterns Reused

| Pattern | Source | Adaptation |
|---------|--------|------------|
| Sync engine protocol | `ns-desktop/src/lib/syncEngine.ts` | Same push/pull/SSE flow, adapted for expo-sqlite API |
| Shared sync types | `ns-shared/src/types.ts` | SyncRejection, SyncChange types |
| Zustand store | `src/store/authStore.ts` | Same pattern for syncStore |
| Bottom sheet | `@gorhom/bottom-sheet` | SyncIssuesSheet follows same pattern as FolderPicker |
| Auto-save debounce | `src/hooks/useAutoSave.ts` | Same 500ms debounce, now writes to SQLite |

## What's Next

- Feature 05: AI Features — AI writing assistance, smart tagging, summarization, Q&A chat
- Feature 07: Audio Recording & Transcription — voice-to-note with Whisper
