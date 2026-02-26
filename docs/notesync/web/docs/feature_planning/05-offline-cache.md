# 05 — Offline Cache

**Status:** Not Started
**Phase:** 3 — AI & Offline
**Priority:** Medium

## Summary

Light offline caching via IndexedDB for the web app. Provides brief offline tolerance with read-only access to recently viewed notes and a queue for edits made while offline.

## Requirements

- **IndexedDB cache**:
  - Cache recently viewed notes (full content) in IndexedDB
  - Cache the note list (metadata only) for sidebar rendering
  - Cache limit: most recent 100 notes or configurable
  - Auto-evict oldest cached notes when limit is reached
- **Offline detection**:
  - Monitor `navigator.onLine` and `online`/`offline` events
  - Visual indicator: online (green) / offline (yellow) in the app header
  - "Last synced" timestamp shown when offline
- **Offline read**:
  - When offline, serve cached notes from IndexedDB
  - Note list shows cached notes with a "cached" indicator
  - Opening a cached note loads from IndexedDB instead of API
  - Notes not in cache show as unavailable
- **Offline edits**:
  - When offline, edits save to IndexedDB and queue in an `offlineQueue` store
  - Queue entries: `{ noteId, action, payload, timestamp }`
  - Visual indicator: "X changes pending sync"
  - When back online: flush the queue to the API in order (FIFO)
  - On success: clear queue entries, update cache from API response
  - On conflict: last-write-wins (same as desktop/mobile sync)
- **Cache refresh**:
  - On app load (if online): refresh cached note list from API
  - On note open: fetch fresh content from API, update cache
  - Background refresh: periodically update cached notes (low priority)

## Technical Considerations

- IndexedDB via `idb` library (lightweight Promise wrapper around IndexedDB API)
- IndexedDB stores:
  - `notes` — full note objects (id, title, content, folder, tags, updatedAt)
  - `noteList` — metadata only for sidebar rendering
  - `offlineQueue` — pending changes to flush when online
  - `meta` — last sync timestamp, cache stats
- Service worker is NOT required for this level of offline support — IndexedDB + online/offline events are sufficient
- The web app is not a true offline-first client (unlike desktop/mobile with SQLite); this is a convenience cache
- Future PWA enhancement could add a service worker for full offline support

## Dependencies

- [00 — Project Scaffolding](00-project-scaffolding.md) — needs web app running
- [02 — Note Management](02-note-management.md) — needs note CRUD to cache and queue

## Open Questions

- Should offline edits support creating new notes, or only editing existing cached ones?
- Cache size: number of notes vs. total storage size limit?
- Should the offline queue support delete operations, or only edits?
