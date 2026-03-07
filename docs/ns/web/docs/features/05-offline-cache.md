# 05 — Offline Cache

**Status:** Complete
**Phase:** 3 — AI & Offline
**Priority:** Medium

## Summary

Light IndexedDB caching layer so the app remains functional during short offline periods: cached notes are readable, edits queue locally, and changes sync automatically when the connection returns. Folder/tag reads are cached; folder/tag mutations remain online-only (too complex to reconcile tree operations offline).

## Architecture

The offline cache sits between NotesPage and the API, wrapping the same function signatures so the page component barely changes. Three new layers:

1. **`lib/db.ts`** — IndexedDB schema + typed CRUD via `idb` library
2. **`lib/offlineQueue.ts`** — FIFO queue stored in IndexedDB for pending mutations
3. **`api/offlineNotes.ts`** — Drop-in replacements for `api/notes.ts` functions that read from cache when offline and enqueue writes

Two hooks:
- **`useOnlineStatus`** — `navigator.onLine` + event listeners
- **`useOfflineCache`** — Orchestrates queue flush on reconnect, exposes pending count and reconciled IDs

One UI component:
- **`OnlineStatusIndicator`** — Green/yellow dot + "X pending" badge in sidebar footer

## Dependencies

- `idb` (production) — lightweight Promise wrapper for IndexedDB
- `fake-indexeddb` (dev) — polyfill for Vitest/jsdom

## Implementation Details

### IndexedDB Layer — `packages/ns-web/src/lib/db.ts`

Six stores:
- `notes` — full Note objects, keyed by `id`, indexed by `updatedAt`
- `noteList` — metadata-only (no content), keyed by `id`, indexed by `updatedAt`
- `offlineQueue` — `{ id (auto-inc), noteId, action, payload, timestamp }`, indexed by `noteId`
- `meta` — key-value pairs (`lastSyncedAt`, etc.)
- `folders` — single `"tree"` key holding `FolderInfo[]` + `cachedAt`
- `tags` — single `"list"` key holding `TagInfo[]` + `cachedAt`

Exported functions:
- `getDB()` — lazy singleton, opens DB version 1 with upgrade handler
- `cacheNote(note)`, `cacheNotes(notes[])` — put to notes store, enforce 100-note limit
- `getCachedNote(id)`, `getAllCachedNotes()`, `deleteCachedNote(id)`
- `cacheNoteList(notes[])` — clear + replace noteList store (metadata only, content stripped)
- `getCachedNoteList()` — returns notes with empty content
- `cacheFolders(folders[])`, `getCachedFolders()`, `cacheTags(tags[])`, `getCachedTags()`
- `setMeta(key, value)`, `getMeta(key)`
- `clearAllCaches()` — empties all 6 stores
- `resetDB()` — closes and nulls the singleton (for testing)

Cache eviction: after each `cacheNote`/`cacheNotes`, count notes store. If > 100, open cursor on `by-updatedAt` index ascending (oldest first), delete excess.

### Offline Queue — `packages/ns-web/src/lib/offlineQueue.ts`

Thin wrapper over the `offlineQueue` store:
- `enqueue(entry)` — add entry, returns auto-increment ID
- `dequeue()` — pop oldest entry (FIFO via ascending cursor)
- `peekAll()` — read all without removing
- `getQueueCount()` — count entries
- `clearQueue()` — clear all
- `removeEntriesForNote(noteId)` — delete all entries matching noteId

### Online Status Hook — `packages/ns-web/src/hooks/useOnlineStatus.ts`

- `useState` initialized from `navigator.onLine`
- `useEffect` adds `online`/`offline` event listeners on `window`
- On `offline` event: loads `lastSyncedAt` from meta store
- Returns `{ isOnline: boolean, lastSyncedAt: Date | null }`

### Offline-Aware API — `packages/ns-web/src/api/offlineNotes.ts`

Wraps each notes API function with identical signatures:

**Read operations** (`fetchNotes`, `fetchNote`, `fetchFolders`, `fetchTags`):
- If online: call real API, cache result in background, return API result
- If API throws and `navigator.onLine` is now false: fall through to cache
- If offline: return cached data (or throw "not available offline" for missing notes)

**Write operations** (`createNote`, `updateNote`, `deleteNote`):
- If online: call real API, update cache, return result
- If API throws and `navigator.onLine` is now false: fall through to offline handler
- If offline: update cache locally, enqueue action, return local result

**Offline create**: Generate `temp-{uuid}` ID via `crypto.randomUUID()`, build full Note object with current timestamps, cache it, enqueue `create` action.

**Offline update**: Merge update data into cached note, enqueue `update` action.

**Offline delete**: If temp ID → remove from cache + remove all queue entries (never synced, just discard). If real ID → remove from cache, enqueue `delete` action.

**Passthrough (online-only)**: `fetchTrash`, `restoreNote`, `permanentDeleteNote`, all folder mutations, all tag mutations, `reorderNotes` — re-exported directly from `notes.ts`.

### Main Cache Hook — `packages/ns-web/src/hooks/useOfflineCache.ts`

- Consumes `useOnlineStatus()`
- Polls `getQueueCount()` every 2s to update `pendingCount`
- On `isOnline` transition to `true` with pending entries → calls `flushQueue()`
- `flushQueue()`: dequeues entries one by one in FIFO order:
  - `create` → call `api.createNote()`, replace temp note in cache with real note, track temp→real ID mapping
  - `update` → call `api.updateNote()` (map temp IDs if needed), update cache
  - `delete` → call `api.deleteNote()` (skip temp IDs), remove from cache
  - On error: skip entry and continue (last-write-wins)
- Exposes `reconciledIds: Map<string, string>` for temp→real ID mapping after sync
- Returns `{ isOnline, lastSyncedAt, pendingCount, isSyncing, reconciledIds }`

### Status Indicator — `packages/ns-web/src/components/OnlineStatusIndicator.tsx`

- Green dot when online, yellow dot when offline
- "X pending" text when `pendingCount > 0`
- Tooltip: "Connected" when online, "Offline — last synced Xm ago" when offline

### NotesPage Integration — `packages/ns-web/src/pages/NotesPage.tsx`

- Import swap: `fetchNotes`, `createNote`, `updateNote`, `deleteNote`, `fetchFolders`, `fetchTags` from `offlineNotes.ts` instead of `notes.ts`
- Added `useOfflineCache` hook for `isOnline`, `pendingCount`, `isSyncing`, `reconciledIds`
- `OnlineStatusIndicator` in sidebar footer alongside trash/settings
- Folder/tag mutation handlers (`handleCreateFolder`, `handleRenameFolder`, `handleDeleteFolder`, `handleMoveFolder`, `handleRenameTag`, `handleDeleteTag`) show error toast when offline
- ID reconciliation `useEffect`: when `reconciledIds` changes, updates `notes` state and `selectedId` to replace temp IDs with real IDs, then reloads from server
- Save status shows "Syncing..." when `isSyncing` is true

## Tests

| Test file | Tests |
|-----------|-------|
| `db.test.ts` | 9: cache/get/delete notes, enforce 100-note limit, noteList metadata, folders/tags round-trip, meta, clearAll |
| `offlineQueue.test.ts` | 7: enqueue, dequeue FIFO, empty dequeue, peekAll, count, clear, removeEntriesForNote |
| `useOnlineStatus.test.ts` | 4: default online, offline event, online event, lastSyncedAt |
| `offlineNotes.test.ts` | 18: online/offline paths for fetchNotes, fetchNote, createNote, updateNote, deleteNote (incl. temp ID), fetchFolders, fetchTags, isTempId |
| `useOfflineCache.test.ts` | 6: initial state, pendingCount, flush on reconnect (create/update/delete), error handling |
| `OnlineStatusIndicator.test.tsx` | 5: green/yellow dot, pending count, tooltip |
| `NotesPage.test.tsx` | Updated mocks for offlineNotes imports + useOfflineCache |

**Total: 49 new tests**

## Technical Considerations

- No database/schema changes — offline cache is entirely client-side (IndexedDB in the browser)
- `idb` library provides typed Promise wrappers for IndexedDB — no raw `IDBRequest` handling
- Fire-and-forget cache updates (`.catch(() => {})`) keep the online path fast — cache misses degrade gracefully
- Queue flush distinguishes transient vs permanent errors (see [11 — Architecture Hardening](11-architecture-hardening.md)): transient errors (5xx/network) re-enqueue with retry count (max 3) and break; permanent errors (4xx) log and skip
- Temp IDs (`temp-{uuid}`) are reconciled to real server IDs after sync via `reconciledIds` Map
- Folder/tag mutations are online-only to avoid complex tree reconciliation

## Files

| File | Action |
|------|--------|
| `packages/ns-web/package.json` | Add `idb`, `fake-indexeddb` |
| `packages/ns-web/src/__tests__/setup.ts` | Add fake-indexeddb import |
| `packages/ns-web/src/lib/db.ts` | **New** |
| `packages/ns-web/src/lib/offlineQueue.ts` | **New** |
| `packages/ns-web/src/hooks/useOnlineStatus.ts` | **New** |
| `packages/ns-web/src/hooks/useOfflineCache.ts` | **New** |
| `packages/ns-web/src/api/offlineNotes.ts` | **New** |
| `packages/ns-web/src/components/OnlineStatusIndicator.tsx` | **New** |
| `packages/ns-web/src/pages/NotesPage.tsx` | Modify imports, add hook, add indicator, disable mutations offline |
| `packages/ns-web/src/__tests__/db.test.ts` | **New** |
| `packages/ns-web/src/__tests__/offlineQueue.test.ts` | **New** |
| `packages/ns-web/src/__tests__/useOnlineStatus.test.ts` | **New** |
| `packages/ns-web/src/__tests__/offlineNotes.test.ts` | **New** |
| `packages/ns-web/src/__tests__/useOfflineCache.test.ts` | **New** |
| `packages/ns-web/src/__tests__/OnlineStatusIndicator.test.tsx` | **New** |
| `packages/ns-web/src/__tests__/NotesPage.test.tsx` | Update mocks |

## Dependencies

- [00 — Project Scaffolding](00-project-scaffolding.md) — needs web app infrastructure
- [01 — Auth](01-auth.md) — API calls require authentication
- [02 — Note Management](02-note-management.md) — caches note CRUD operations
- [03 — Search & Organization](03-search-and-organization.md) — caches folders and tags
