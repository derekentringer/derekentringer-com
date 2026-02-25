# 16 — PWA Support

**Status:** Not Started
**Phase:** 7 — Mobile & PWA
**Priority:** Low

## Summary

Make the React web app installable as a Progressive Web App with offline support, so it can be used on mobile devices without a native app.

## Requirements

- Web app manifest (`manifest.json`):
  - App name, icons, theme color, background color
  - Display mode: standalone (looks like a native app)
  - Start URL: `/personal-finance`
- Service worker:
  - Cache static assets (HTML, CSS, JS, fonts) for offline shell
  - Cache API responses for offline data viewing
  - Background sync: queue data changes made offline, sync when back online
- Install prompt: show "Add to Home Screen" banner on mobile browsers
- Offline capabilities:
  - View cached dashboard, account balances, recent transactions
  - Read-only mode when offline (no imports or edits)
  - Clear indicator when viewing cached/stale data
- Push notifications (optional):
  - Bill due date reminders
  - Budget threshold alerts
  - Requires notification permission

## Technical Considerations

- Vite has PWA plugins (`vite-plugin-pwa`) that generate service workers and manifests
- Workbox library for service worker caching strategies (stale-while-revalidate for API, cache-first for assets)
- Offline data: IndexedDB or Cache API for storing recent API responses client-side
- PWA is a stepping stone — provides mobile experience before the React Native app is built
- PWA install works on Android Chrome, iOS Safari (with limitations on iOS)

## Dependencies

- [00 — Project Scaffolding](00-project-scaffolding.md) — needs the web app built
- [06 — Net Worth Tracking](06-net-worth-tracking.md) — dashboard to cache for offline
- [07 — Budgeting & Expense Tracking](07-budgeting-expense-tracking.md) — data to display offline

## Open Questions

- Which data should be cached for offline access (everything vs. summary only)?
- How to handle data freshness — show "last updated X hours ago" for cached data?
- iOS PWA limitations (no push notifications, limited background sync) — acceptable trade-offs?
