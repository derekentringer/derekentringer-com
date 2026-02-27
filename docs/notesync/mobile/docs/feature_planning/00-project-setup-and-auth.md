# 00 — Project Setup & Auth

**Status:** Not Started
**Phase:** 0 — Setup
**Priority:** High

## Summary

Set up the Expo + React Native mobile app with authentication, secure token storage, API connection, and local SQLite database. Matches the patterns established by the existing fin mobile app.

## Requirements

- **Project setup** (`packages/notesync-mobile/`):
  - Expo ~54 with managed workflow and new architecture enabled
  - TypeScript strict mode
  - React Navigation 7 (native stack + bottom tabs)
  - TanStack React Query v5 for server state
  - Zustand v5 for local state (auth, preferences)
  - axios for HTTP with auth interceptors
  - expo-secure-store for token storage
  - expo-sqlite for local database
  - Tailwind-style theming (dark mode, consistent spacing/colors)
  - Add to `turbo.json` pipelines
- **Local SQLite database**:
  - Same schema as desktop:
    ```sql
    CREATE TABLE notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      folder TEXT,
      tags TEXT,
      summary TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      deletedAt TEXT,
      syncStatus TEXT DEFAULT 'pending',
      remoteId TEXT
    );

    CREATE TABLE sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      noteId TEXT NOT NULL,
      action TEXT NOT NULL,
      payload TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    ```
- **Authentication**:
  - Login screen: username + password
  - `POST /auth/login` with `X-Client-Type: mobile` header
  - Store access token, refresh token, and expiry in expo-secure-store
  - Proactive token refresh (30-second buffer before expiry, matching fin mobile)
  - Shared refresh lock to prevent concurrent refresh calls
  - On refresh failure: clear tokens, redirect to login
  - Zustand auth store: `isAuthenticated`, `isLoading`, `user`, `initialize()`, `login()`, `logout()`
- **API client** (`src/services/api.ts`):
  - Base URL: `__DEV__ ? "http://localhost:3004" : "https://notesync-api.derekentringer.com"`
  - axios instance with request/response interceptors (matching fin mobile pattern)
  - Request interceptor: add Bearer token, proactive refresh if expired
  - Response interceptor: on 401, attempt refresh, retry request
- **Navigation shell**:
  - Bottom tabs: Notes, Search, AI, Settings
  - Native stack for note detail/editor screens
  - Auth-gated navigation (login screen vs. main app)

## Technical Considerations

- Copy patterns from existing `packages/mobile/` (fin mobile): API service, auth store, token storage, interceptors
- expo-sqlite provides synchronous SQLite access; use for all local data
- SQLite schema mirrors desktop exactly — sync engine will be shared logic
- `X-Client-Type: mobile` header tells the API to return refresh tokens in the response body (not cookies)
- React Query for API data, but local SQLite is the primary data source when offline
- Consider a `useNotes()` hook that reads from SQLite first, then refreshes from API in the background

## Dependencies

None — this is the first feature for mobile.

## Open Questions

- Should the mobile app share any React components with desktop/web, or keep them fully separate?
- Bottom tab layout: Notes, Search, AI, Settings — or different grouping?
- Should the app support biometric auth (fingerprint/face) as an alternative to username/password?
