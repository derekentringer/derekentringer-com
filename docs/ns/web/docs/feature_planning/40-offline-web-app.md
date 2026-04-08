# 40 — Offline Web App (PWA)

**Status:** Planned
**Phase:** Phase 3 — Differentiation
**Priority:** Medium

## Summary

Make the web app work offline using Service Workers and IndexedDB. Currently the web app requires internet — users lose access on planes, spotty WiFi, etc. Desktop and mobile already work offline; the web should too.

## Implementation

### Service Worker

- **Workbox** (via vite-plugin-pwa) for service worker generation
- **Strategy:** Cache-first for app shell (HTML, CSS, JS, fonts), network-first for API calls
- **Precaching:** All static assets cached on first load
- **Runtime caching:** API responses cached in IndexedDB for offline access

### IndexedDB (expand existing)

The web app already has a light IndexedDB cache for recently viewed notes. Expand it to:
- Store all user notes locally (not just recent)
- Queue writes (create, update, delete) when offline
- Replay queued writes when back online (similar to desktop sync engine)
- Store images locally for offline display

### Offline Detection

- `navigator.onLine` + `online`/`offline` events
- Show subtle indicator when offline: "Offline — changes will sync when reconnected"
- Disable features that require server: AI completions, search (unless client-side FTS is implemented)
- Enable: reading notes, editing, creating, deleting (all queued)

### Sync on Reconnect

- When coming back online, push all queued changes via existing sync push endpoint
- Pull any changes from server that happened while offline
- Conflict resolution: last-write-wins (same as desktop/mobile)

### PWA Manifest

Already exists (`public/site.webmanifest`). Ensure:
- `"display": "standalone"` for app-like experience
- Correct icons for "Add to Home Screen"
- `"start_url": "/"` with offline fallback

## Limitations

- Full-text search: server-side only unless client-side FTS is added (see feature plan 38)
- AI features: require internet (Claude/Whisper APIs)
- First load: still requires internet to download the app shell
- Storage: IndexedDB has browser-imposed limits (~50MB-unlimited depending on browser)

## Verification

- Load app with internet, then disconnect
- Can browse all notes offline
- Can edit and save notes offline
- Can create new notes offline
- Reconnecting syncs all offline changes
- Offline indicator shows/hides correctly
- "Add to Home Screen" works on mobile browsers
- App loads from cache on subsequent visits (no network needed)
