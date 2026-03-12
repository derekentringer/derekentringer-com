# 17 — Centralized TokenManager

## Summary

Unified token lifecycle management via a shared `TokenManager` in `@derekentringer/shared/token`. Replaces the ad-hoc `client.ts` implementation with a factory-based architecture using a desktop-specific adapter for Stronghold vault storage and body-based refresh. Fixes localStorage security fallback, adds auth:logout event dispatch, dynamic SSE reconnect timers, jitter, and typed auth failure reasons.

## What Changed

### Desktop Adapter (`ns-desktop/api/desktopTokenAdapter.ts`)

- **`createDesktopTokenAdapter`** — Stronghold-based refresh adapter:
  - `doRefresh`: reads refresh token from Stronghold with 200ms retry, sends `POST /auth/refresh` with JSON body + `X-Requested-With` header
  - `onRefreshSuccess`: stores new refresh token in Stronghold via `setSecureItem`
  - `onAuthFailure`: removes token from Stronghold, dispatches `window auth:logout` event

### Client Rewrite (`ns-desktop/api/client.ts`)

- Instantiates `createTokenManager` + `createDesktopTokenAdapter`
- Re-exports backward-compatible API surface: `setAccessToken`, `getAccessToken`, `setRefreshToken`, `clearRefreshToken`, `setOnAuthFailure`, `refreshAccessToken`, `apiFetch`
- Exports `tokenManager` instance for syncEngine to access `getMsUntilExpiry()`
- Dev-mode logger via `import.meta.env.DEV`

### Security Fix — Stronghold localStorage Fallback (`secureStorage.ts`)

- Removed `localStorage.setItem(key, value)` fallback in `setSecureItem` catch block
- Removed `localStorage.removeItem(key)` fallback in `removeSecureItem` catch block
- Tokens are never stored in plaintext; if Stronghold fails, the operation silently fails

### Auth Context (`ns-desktop/context/AuthContext.tsx`)

- `clearAuth` accepts optional `AuthFailureReason` and dispatches `CustomEvent("auth:logout", { detail: { reason } })`
- `tokenManager.setOnAuthFailure((reason) => clearAuth(reason))` replaces `setOnAuthFailure`

### Sync Engine (`ns-desktop/lib/syncEngine.ts`)

- **Dynamic SSE reconnect timer** — `tokenManager.getMsUntilExpiry() - 120_000` replaces manual JWT parsing (min 30s)
- **Jitter** — `Math.floor(Math.random() * baseMs * 0.1)` added to reconnect delay
- **401/403 distinction** — 401 triggers refresh + retry once; 403 stops retrying; other errors use backoff
- Removed duplicated `getAccessToken`/`refreshAccessToken` imports (uses tokenManager directly)

## Audit Issues Addressed

| # | Issue | Fix |
|---|-------|-----|
| 4 | Stronghold localStorage fallback | Removed plaintext fallback in secureStorage.ts |
| 7 | Desktop missing auth:logout event | Dispatched in adapter onAuthFailure + AuthContext clearAuth |
| 8 | Proactive timer reset after refresh | Timer runs continuously, checks actual expiry |
| 9 | Debug logging for refresh | TokenLogger interface, wired in dev mode |

## Tests

- 14 client tests migrated to new structure (same mock boundaries: secureStorage + globalThis.fetch)
- Updated syncEngine.test.ts mock with `tokenManager` and `refreshAccessToken`
- Updated AuthContext.test.tsx for `mockSetOnAuthFailure` assertion
- Updated 4 additional test files with `tokenManager` mock

## Files

| File | Action |
|------|--------|
| `packages/ns-desktop/src/api/desktopTokenAdapter.ts` | Create |
| `packages/ns-desktop/src/api/client.ts` | Rewrite |
| `packages/ns-desktop/src/lib/secureStorage.ts` | Edit (remove localStorage fallback) |
| `packages/ns-desktop/src/context/AuthContext.tsx` | Edit |
| `packages/ns-desktop/src/lib/syncEngine.ts` | Edit |
| `packages/ns-desktop/src/__tests__/client.test.ts` | Rewrite |
| `packages/ns-desktop/src/__tests__/syncEngine.test.ts` | Edit |
| `packages/ns-desktop/src/__tests__/AuthContext.test.tsx` | Edit |
