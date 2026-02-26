# 04 — Sync Engine

**Status:** Not Started
**Phase:** 2 — Organization & Sync
**Priority:** High

## Summary

Background sync engine for mobile, keeping the local SQLite database in sync with central PostgreSQL via notesync-api. Same protocol as the desktop sync engine.

## Requirements

- **Online/offline detection**:
  - Use React Native's `NetInfo` (`@react-native-community/netinfo`) for network status
  - Visual indicator: online / offline / syncing in the header or status bar
  - App is fully functional offline
- **Sync protocol** (same as desktop):
  - **Push first**: send local changes from `sync_queue` to `POST /sync/push`
  - **Then pull**: fetch remote changes via `GET /sync/pull?since={lastSyncedAt}`
  - Apply remote changes to local SQLite
  - Update `lastSyncedAt` in `sync_meta`
- **Conflict resolution**:
  - Last-write-wins based on `updatedAt` timestamp
  - Same logic as desktop
- **Sync triggers**:
  - On app launch (if online)
  - On app foreground (returning from background)
  - After any local edit (debounced, 5 seconds)
  - Periodic background sync (configurable, default 30 seconds)
  - Manual "Sync Now" in settings
  - On network reconnection
- **Sync queue**:
  - All local changes written to `sync_queue` table
  - Queue persists across app restarts
  - FIFO processing with exponential backoff on failure
- **Initial sync**:
  - First launch: pull all notes from API into local SQLite
  - Progress indicator during initial sync ("Syncing notes... X/Y")
- **Sync status**:
  - Per-note sync indicator (synced / pending / modified)
  - Global sync status: "All synced" / "X changes pending"
  - Last synced timestamp

## Technical Considerations

- Sync logic should be a shared module (same code as desktop, adapted for expo-sqlite vs. Tauri SQL plugin)
- Consider extracting sync protocol into `notesync-shared` package with platform-specific SQLite adapters
- `@react-native-community/netinfo` provides `addEventListener` for network state changes
- Background sync: use `setInterval` while app is foregrounded; consider `expo-background-fetch` for true background sync (limited on iOS)
- Batch push/pull: send and receive changes in chunks (100 notes at a time)
- UUIDs for note IDs ensure no collisions across devices
- Sync must handle the case where a note was created on mobile while offline, then a different note with the same title was created on desktop — UUIDs prevent ID collision, but duplicate content detection is a future AI feature
- FTS5 index must be updated after sync pull applies changes

## Dependencies

- [00 — Project Setup & Auth](00-project-setup-and-auth.md) — needs SQLite with sync tables and API connection
- [02 — Note Editor](02-note-editor.md) — note edits generate sync queue entries

## Open Questions

- Should sync logic be a shared package with platform adapters, or duplicated per platform?
- True background sync (expo-background-fetch) or only when app is foregrounded?
- Should large notes (e.g., >100KB) be synced in a separate pass to avoid blocking smaller notes?
