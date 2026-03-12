# 16 — Centralized TokenManager

## Summary

Adopted the shared `TokenManager` from `@derekentringer/shared/token` to unify auth token lifecycle with the NoteSync apps. Replaces the ad-hoc `client.ts` implementation with a factory-based architecture using a web token adapter. Finance web now has proactive token refresh, typed auth failure reasons, and consistent auth behavior across the platform.

## What Changed

### Web Adapter (`fin-web/api/webTokenAdapter.ts`)

- **`createWebTokenAdapter`** — Cookie-based refresh adapter:
  - `doRefresh`: `POST /auth/refresh` with `credentials: "include"` + `X-Requested-With` header; returns `RefreshResult | null`
  - `onRefreshSuccess`: no-op (server manages cookies)
  - `onAuthFailure`: no-op (server clears cookies)
  - `fetchOptions`: `{ credentials: "include" }`

### Client Rewrite (`fin-web/api/client.ts`)

- Instantiates `createTokenManager` + `createWebTokenAdapter`
- Re-exports backward-compatible API surface: `setAccessToken`, `getAccessToken`, `setOnAuthFailure`, `apiFetch`
- Exports `tokenManager` instance
- Dev-mode logger via `import.meta.env.DEV`
- **New behavior**: Proactive token refresh (60s interval, 2min threshold); previously only reactive on 401

### Auth Context (`fin-web/context/AuthContext.tsx`)

- `clearAuth` accepts optional `AuthFailureReason` and dispatches `CustomEvent("auth:logout", { detail: { reason } })`
- `tokenManager.setOnAuthFailure((reason) => clearAuth(reason))` replaces `setOnAuthFailure`

### Bugs Fixed

- **Network errors no longer destroy sessions** — Previously, a `catch` block in `apiFetch` called `onAuthFailure` on any error (including transient network failures); now only definitive 401/403 responses trigger auth failure
- **Missing X-Requested-With header** — Refresh requests now include CSRF defense header
- **No proactive refresh** — Added proactive token refresh; previously users could hit expired tokens between requests

## Tests

- Updated `App.test.tsx` mock with `tokenManager` export

## Files

| File | Action |
|------|--------|
| `packages/fin-web/src/api/webTokenAdapter.ts` | Create |
| `packages/fin-web/src/api/client.ts` | Rewrite |
| `packages/fin-web/src/context/AuthContext.tsx` | Edit |
| `packages/fin-web/src/__tests__/App.test.tsx` | Edit |
