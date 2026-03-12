# 15 — Centralized TokenManager

## Summary

Unified token lifecycle management via a shared `TokenManager` in `@derekentringer/shared/token`. Replaces the ad-hoc `client.ts` implementation with a factory-based architecture using platform-specific adapters. Web now has proactive token refresh, dynamic SSE reconnect timers, jitter, and typed auth failure reasons.

## What Changed

### Shared Package (`@derekentringer/shared/token`)

- **`createTokenManager`** — Factory function returning a `TokenManager` object: in-memory access token, JWT expiry parsing via `parseJwt.ts`, proactive refresh scheduling (60s interval, 2min threshold), refresh promise deduplication, auth failure callback with `AuthFailureReason`, optional debug logger
- **`createApiFetch`** — Shared fetch wrapper: Bearer header, Content-Type for JSON (skips FormData), 401 retry after refresh, merges `defaultFetchOptions` (e.g. `credentials: "include"`)
- **`parseJwt.ts`** — `getTokenExpiryMs()` extracts `exp` from JWT payload via `atob`; replaces duplicated logic across ns-web/sse.ts, ns-desktop/client.ts, ns-desktop/syncEngine.ts
- **Types** — `AuthFailureReason` (`"token_expired" | "token_revoked" | "no_refresh_token" | "network_error" | "unknown"`), `TokenRefreshAdapter`, `TokenManager`, `TokenLogger`, `RefreshResult`
- **Package export** — `./token` sub-path in `package.json`

### Web Integration (`ns-web`)

- **`webTokenAdapter.ts`** — Cookie-based refresh adapter (`credentials: "include"`), no-op `onRefreshSuccess`/`onAuthFailure` (server manages cookies)
- **`client.ts`** — Rewritten to instantiate `createTokenManager` + `createWebTokenAdapter`, re-exports backward-compatible API surface, exports `tokenManager` instance for SSE
- **New behavior** — Web now has proactive token refresh (60s interval, 2min threshold); previously only reactive on 401

### SSE Improvements (`ns-web/api/sse.ts`)

- **Dynamic reconnect timer** — `tokenManager.getMsUntilExpiry() - 120_000` replaces hardcoded 13-minute interval (min 30s)
- **Jitter** — `Math.floor(Math.random() * baseMs * 0.1)` added to reconnect delay to prevent thundering herd
- **401/403 distinction** — 401 triggers refresh + retry once; 403 stops retrying entirely; other errors use backoff

### Auth Reason Propagation (`ns-web/context/AuthContext.tsx`)

- `clearAuth` accepts optional `AuthFailureReason`
- `tokenManager.setOnAuthFailure((reason) => clearAuth(reason))` replaces `setOnAuthFailure`
- Dispatches `CustomEvent("auth:logout", { detail: { reason } })` instead of plain `Event`

### Server Cleanup (`ns-api`)

- **`deleteStaleRevokedTokens`** — New function in `refreshTokenStore.ts`; deletes revoked tokens older than a configurable age for a given user
- **Refresh endpoint** — After revoking old refresh token, opportunistically cleans up revoked tokens >24h old

## Tests

- 25 new `tokenManager.test.ts` tests (shared): get/set, JWT parsing, refresh, dedup, auth failure, proactive refresh, logger
- 9 new `apiFetch.test.ts` tests (shared): Bearer header, Content-Type, 401 retry, defaultFetchOptions merge
- 3 new SSE tests: 403 stop, 401 refresh+retry, jitter
- Updated mocks in 5+ existing test files for `tokenManager` export

## Files

| File | Action |
|------|--------|
| `packages/shared/src/token/types.ts` | Create |
| `packages/shared/src/token/parseJwt.ts` | Create |
| `packages/shared/src/token/createTokenManager.ts` | Create |
| `packages/shared/src/token/createApiFetch.ts` | Create |
| `packages/shared/src/token/index.ts` | Create |
| `packages/shared/package.json` | Edit (add `./token` export) |
| `packages/shared/src/__tests__/tokenManager.test.ts` | Create |
| `packages/shared/src/__tests__/apiFetch.test.ts` | Create |
| `packages/ns-web/src/api/webTokenAdapter.ts` | Create |
| `packages/ns-web/src/api/client.ts` | Rewrite |
| `packages/ns-web/src/api/sse.ts` | Edit |
| `packages/ns-web/src/context/AuthContext.tsx` | Edit |
| `packages/ns-web/src/__tests__/sse.test.ts` | Edit |
| `packages/ns-api/src/store/refreshTokenStore.ts` | Edit |
| `packages/ns-api/src/routes/auth.ts` | Edit |
