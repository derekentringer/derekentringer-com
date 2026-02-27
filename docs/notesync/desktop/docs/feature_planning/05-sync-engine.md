# 05 — Sync Engine

**Status:** Not Started
**Phase:** 4 — External Sources & Sync
**Priority:** Medium

## Summary

Background sync engine that keeps the local SQLite database in sync with the central PostgreSQL database via the notesync-api. Enables offline-first usage with automatic sync when online.

## Requirements

- **Online/offline detection**:
  - Detect network status (Tauri's network plugin or periodic API health check)
  - Visual indicator in the app: online (green) / offline (gray) / syncing (animated)
  - App is fully functional offline; sync resumes when connectivity returns
- **Sync protocol**:
  - **Push**: send local changes (from `sync_queue` table) to the API
    - `POST /sync/push` — send array of pending changes (create, update, delete)
    - API applies changes to PostgreSQL and returns confirmation with server-assigned IDs
    - On success: clear processed items from `sync_queue`, update `syncStatus` to `synced`, store `remoteId`
  - **Pull**: fetch remote changes since last sync
    - `GET /sync/pull?since={lastSyncedAt}` — returns all notes modified after the timestamp
    - Apply remote changes to local SQLite
    - Update `lastSyncedAt` in `sync_meta` table
  - **Order**: always push first, then pull (ensures local changes aren't overwritten)
- **Conflict resolution**:
  - Last-write-wins based on `updatedAt` timestamp
  - If a note was modified both locally and remotely since last sync, the version with the later `updatedAt` wins
  - Losing version is discarded (future enhancement: keep conflict log for manual resolution)
- **Sync triggers**:
  - On app launch (if online)
  - After any local change (debounced, e.g., 5 seconds after last edit)
  - Periodic background sync (configurable interval, default 30 seconds)
  - Manual "Sync Now" button
  - On network reconnection
- **Sync queue**:
  - All local changes (create, update, delete) are written to `sync_queue` before being applied to `notes` table
  - Queue persists across app restarts
  - Queue items are processed in order (FIFO)
  - Failed items are retried with exponential backoff
- **Initial sync**:
  - First sync on a new device: pull all notes from the API
  - Populate local SQLite with full dataset
  - Set `syncStatus` to `synced` for all pulled notes

## Technical Considerations

- Sync runs in a background thread/worker to avoid blocking the UI
- Tauri's Rust backend can handle the sync loop independently of the React frontend
- API endpoints (`/sync/push`, `/sync/pull`) are specific to NoteSync — not shared with other apps
- `lastSyncedAt` stored in `sync_meta` table as ISO 8601 timestamp
- Batch operations: push and pull in chunks (e.g., 100 notes at a time) to avoid large payloads
- Soft-deleted notes sync their `deletedAt` timestamp; permanent deletes propagate as hard deletes
- UUIDs for note IDs ensure no collisions between devices
- Consider a full re-sync option ("Reset & Sync") for recovery from corrupt state

## Dependencies

- [00 — Project Scaffolding](00-project-scaffolding.md) — needs SQLite database with sync tables
- [02 — Note Editor](02-note-editor.md) — needs note CRUD operations to generate sync queue entries

## Open Questions

- Should conflict resolution show the user a merge dialog, or silently pick the latest version?
- Sync interval: configurable in settings, or fixed at 30 seconds?
- Should attachments/images (if supported later) be synced, or only note text?
- How to handle a note that was permanently deleted on one device but modified on another?
