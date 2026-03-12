# 09 — Centralized TokenManager

## Summary

Adopted the shared `TokenManager` from `@derekentringer/shared/token` to unify auth token lifecycle with the finance web and NoteSync apps. Replaces ad-hoc Axios interceptor token management with a factory-based architecture using a mobile-specific adapter for `expo-secure-store`. Mobile app now has proactive token refresh via the shared TokenManager's interval-based scheduler, refresh promise deduplication, and typed `AuthFailureReason` propagation.

## What Changed

### Mobile Adapter (`services/mobileTokenAdapter.ts`)

- **`createMobileTokenAdapter`** — `expo-secure-store`-based refresh adapter:
  - `doRefresh`: reads refresh token from SecureStore, sends `POST /auth/refresh` with JSON body + `X-Client-Type: mobile` header via `fetch` (avoids Axios interceptor loops)
  - `onRefreshSuccess`: persists new access + refresh tokens in SecureStore for app restart survival
  - `onAuthFailure`: clears all tokens from SecureStore
  - Distinguishes definitive failures (401/403 → return null) from transient errors (500 → throw to preserve session)

### Client Rewrite (`services/api.ts`)

- Instantiates `createTokenManager` + `createMobileTokenAdapter`
- Simplified Axios interceptors:
  - Request: attaches Bearer token from `tokenManager.getAccessToken()` (synchronous)
  - Response: 401 retry via `tokenManager.refreshAccessToken()` (deduped)
- Removed manual `refreshPromise` dedup and `refreshTokenSafely()` (handled by TokenManager)
- Removed `TOKEN_EXPIRY` storage key (TokenManager parses JWT expiry automatically)
- `tokenStorage.setTokens()` now stores in SecureStore AND sets in-memory token via `tokenManager.setAccessToken()`
- Exports `tokenManager` instance for authStore access
- Dev-mode debug logger via `__DEV__`

### Auth Store (`store/authStore.ts`)

- Imports `tokenManager` from api module
- `initialize()` loads persisted token from SecureStore → sets in TokenManager → checks expiry → refreshes if needed
- Registers `tokenManager.setOnAuthFailure()` callback to clear Zustand auth state on token revocation
- No more manual token expiry tracking

## Bugs Fixed

- **Network errors no longer destroy sessions** — Previously, `refreshTokenSafely()` catch block cleared all tokens on any error (including transient network failures); now only definitive 401/403 responses trigger auth failure
- **No proactive refresh scheduling** — Previous interceptor-based approach only refreshed reactively; now TokenManager's 60s interval checks JWT expiry and refreshes proactively

## Tests

- 8 new `mobileTokenAdapter.test.ts` tests: doRefresh (no token, success, 401, 403, 500), onRefreshSuccess (with/without refresh token), onAuthFailure
- 6 new `api.test.ts` tests: tokenStorage (get/set/clear), tokenManager export interface

## Files

| File | Action |
|------|--------|
| `packages/fin-mobile/src/services/mobileTokenAdapter.ts` | Create |
| `packages/fin-mobile/src/services/api.ts` | Rewrite |
| `packages/fin-mobile/src/store/authStore.ts` | Edit |
| `packages/fin-mobile/src/__tests__/mobileTokenAdapter.test.ts` | Create |
| `packages/fin-mobile/src/__tests__/api.test.ts` | Create |
