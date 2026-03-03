# 01 — Auth

**Status:** Complete
**Phase:** 1 — Foundation
**Priority:** High
**Completed:** v1.30.0

## Summary

Single-user JWT authentication for the NoteSync web app, reusing the `@derekentringer/shared` auth plugin. Same JWT + bcrypt pattern as fin-web, without the PIN layer.

## What Was Implemented

### NoteSync API (`packages/ns-api/`)
- **POST /auth/login** — rate-limited (5/15min), bcrypt password comparison with constant-time dummy hash (timing attack prevention), returns JWT access token + sets httpOnly refresh cookie (7-day TTL)
- **POST /auth/refresh** — rate-limited (30/15min), cookie-based token rotation, revoke-on-use, issues new access + refresh tokens
- **POST /auth/logout** — JWT-protected, revokes refresh token, clears cookie
- **POST /auth/sessions/revoke-all** — JWT-protected, revokes all refresh tokens for user, returns revoked count
- Refresh token store with SHA-256 hashing, TTL-based expiry, periodic cleanup
- Centralized config (`src/config.ts`) with production secret enforcement

### NoteSync Web (`packages/ns-web/`)
- `AuthContext` with silent refresh on mount, login/logout functions
- `ProtectedRoute` component — redirects to `/login` if unauthenticated
- `LoginPage` — dark-themed login form with NoteSync branding, error handling
- API client (`src/api/client.ts`) with auto-refresh interceptor on 401, auth failure callback
- Auth API functions (`src/api/auth.ts`) — login, refreshSession, logout

## Security Design

- **Password storage**: bcrypt hash in `ADMIN_PASSWORD_HASH` env var
- **Access token**: memory-only (never in cookie/localStorage), 15-minute expiry
- **Refresh token**: httpOnly cookie, Secure in production, SameSite=Strict, scoped to `/auth/refresh`, 7-day expiry
- **Refresh rotation**: stolen token usable only once (revoke-on-use)
- **No PIN layer** — simpler than fin-api (PIN is finance-specific)
- **Rate limiting**: 5 attempts/15min on login, 30/15min on refresh, 200/min global
- **CORS**: locked to ns-web origin only

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ADMIN_USERNAME` | No (default: `admin`) | Login username |
| `ADMIN_PASSWORD_HASH` | Production only | bcrypt hash of password |
| `JWT_SECRET` | Production only | JWT signing secret |
| `REFRESH_TOKEN_SECRET` | Production only | Refresh token secret |
| `CORS_ORIGIN` | No (default: `http://localhost:3005`) | Allowed CORS origin |
| `DATABASE_URL` | Yes | PostgreSQL connection string |

## Resolved Open Questions

- **Credentials**: Same env var pattern as fin-api; can share or use different values per Railway service
- **Session duration**: Same as finance — 15m access token, 7d refresh token
- **No PIN**: PIN gate is finance-specific; NoteSync uses password-only auth
