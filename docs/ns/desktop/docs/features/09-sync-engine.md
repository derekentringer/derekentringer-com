# 09 — Sync Engine

**Status:** Complete
**Phase:** 6 — Auth & Sync
**Priority:** Medium

## Summary

Background sync engine keeping local SQLite in sync with central PostgreSQL via ns-api. SSE-based real-time notifications with fallback polling, push/pull protocol with last-write-wins conflict resolution.

## What Was Implemented

### Sync Engine (`src/lib/syncEngine.ts`)

- `initSyncEngine({ onStatusChange, onDataChanged })` — initializes sync with callback hooks
- `destroySyncEngine()` — tears down SSE connection and timers
- `notifyLocalChange()` — triggers push after local edits (debounced)
- `manualSync()` — user-initiated full push+pull cycle
- `connectSse()` — SSE connection to `/sync/events?deviceId=...` for real-time push notifications
- SSE reconnect with captured local AbortController reference to avoid race conditions (new connection's controller not affected)
- Fallback 30s polling when SSE is unavailable
- Push: `POST /sync/push` with array of local changes
- Pull: `POST /sync/pull` with `since` timestamp, applies remote changes to local SQLite
- Status states: `idle`, `syncing`, `error` with error message
- `SyncStatusButton` component shows current sync state in sidebar

### Database Support (`src/lib/db.ts`)

- `upsertNoteFromRemote(note)` — applies remote note changes to local SQLite with LWW check (local `updated_at > remote updatedAt` → skip)
- `fetchFavoriteNotes()` defaults: `updatedAt`/`desc` matching client and API defaults

### NotesPage Integration (`src/pages/NotesPage.tsx`)

- Sync engine initialized in mount `useEffect([], [])`
- Callback refs pattern (`refreshSidebarDataRef`, `loadFavoriteNotesRef`, `loadNoteTitlesRef`) to avoid stale closures — sync engine's `onDataChanged` reads from refs
- `reloadNotes` converted from plain function to `useCallback([activeFolder, sortBy, sortOrder])`
- `handleSave` deps updated to include `reloadNotes`, `loadFavoriteNotes`, `loadNoteTitles`

### Sort Preferences

- Notes list sort persisted to localStorage (`ns-desktop-sort-by`, `ns-desktop-sort-order`)
- Favorites sort persisted to localStorage (`ns-fav-sort-by`, `ns-fav-sort-order`)
- `validateSortField()` / `validateSortOrder()` helpers validate stored values on load

## Files

| File | Action |
|------|--------|
| `src/lib/syncEngine.ts` | Created — SSE + push/pull sync engine |
| `src/lib/db.ts` | Modified — upsertNoteFromRemote with LWW, default sort alignment |
| `src/pages/NotesPage.tsx` | Modified — sync engine init, callback refs, sort persistence |
| `src/components/SyncStatusButton.tsx` | Created — sync status indicator |

## Dependencies

- [08 — Auth](08-auth.md) — needs authentication tokens for API calls
- [00 — Project Scaffolding](00-project-scaffolding.md) — needs SQLite database
- [01 — Note Editor](01-note-editor.md) — notes must exist for syncing
- [05 — Favorites](05-favorites.md) — favorites sync support

## Deferred

- **Offline queue** — no dedicated `sync_queue` table; sync operates on current note state rather than queued change events
- **Attachment sync** — only note text and metadata are synced; file attachments deferred
- **Conflict merge dialog** — last-write-wins is silent; no user-facing merge UI
