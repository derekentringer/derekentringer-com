# 01 — Auth & Security

**Status:** Complete
**Phase:** 1 — Foundation
**Priority:** High
**Completed:** v1.2.0

## Summary

Single-user JWT authentication for the personal finance app. All API routes are gated behind auth middleware except login, refresh, and health. Optional PIN gate for sensitive financial data.

## What Was Implemented

### Shared Package (`packages/shared/`)
- Auth types: `LoginResponse` (with `accessToken`), `RefreshResponse`, `PinVerifyRequest/Response`, `PinJwtPayload`, `LogoutResponse`, `AuthPluginOptions`
- Reusable Fastify auth plugin (`@derekentringer/shared/auth`) — registers `@fastify/jwt`, decorates `fastify.authenticate`
- PIN verification preHandler (`@derekentringer/shared/auth/pinVerify`) — verifies `X-Pin-Token` header
- Fastify type augmentations for `authenticate` decorator and JWT payload types

### Finance API (`packages/finance-api/`)
- **POST /auth/login** — rate-limited (5/15min), bcrypt password comparison, returns JWT access token + sets httpOnly refresh cookie
- **POST /auth/refresh** — rotates refresh token on every use, issues new access token
- **POST /auth/logout** — JWT-protected, revokes refresh token, clears cookie
- **POST /auth/pin/verify** — JWT-protected, rate-limited, returns short-lived PIN token (5 min)
- Centralized config (`src/config.ts`) with production validation
- In-memory refresh token store with TTL-based expiry
- `@fastify/cookie`, `@fastify/cors`, `@fastify/rate-limit` plugins

### Finance Web (`packages/finance-web/`)
- API client (`src/api/client.ts`) with auto-refresh interceptor on 401
- Auth API functions (`src/api/auth.ts`) — login, refresh, logout, PIN verify
- `AuthContext` with silent refresh on mount
- `PinContext` with auto-expiry timer
- `ProtectedRoute` component — redirects to `/login` if unauthenticated
- `PinGate` component — PIN prompt overlay for sensitive data
- `LoginPage` — dark-themed login form
- App routing updated with auth flow

## Security Design

- **Password storage**: bcrypt hash in `ADMIN_PASSWORD_HASH` env var (no database dependency)
- **Access token**: memory-only (never in cookie/localStorage), 15-minute expiry
- **Refresh token**: httpOnly cookie, Secure in production, SameSite=Strict, scoped to `/auth/refresh`, 7-day expiry
- **Refresh rotation**: stolen token usable only once (revoke-on-use)
- **PIN token**: separate short-lived JWT (5 min), verified via `X-Pin-Token` header
- **Rate limiting**: 5 attempts / 15 min on login and PIN endpoints, 100/min global
- **CORS**: locked to finance-web origin only

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ADMIN_USERNAME` | No (default: `admin`) | Login username |
| `ADMIN_PASSWORD_HASH` | Production only | bcrypt hash of password |
| `JWT_SECRET` | Production only | JWT signing secret (min 32 chars) |
| `REFRESH_TOKEN_SECRET` | Production only | Refresh token secret |
| `PIN_HASH` | No | bcrypt hash of PIN (omit to disable) |
| `CORS_ORIGIN` | No (default: `http://localhost:3003`) | Allowed CORS origin |

### Local Development Setup

1. Copy `.env.example` to `.env` in `packages/finance-api/`
2. Generate a bcrypt hash for your password: `node -e "require('bcryptjs').hash('yourpassword', 12).then(h => console.log(h))"`
3. Set `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` in `.env`
4. The dev script (`npm run dev`) automatically loads `.env` via `--env-file`

### Production

Set environment variables directly in Railway (or your hosting platform). The `.env` file is gitignored and never committed.

## Resolved Open Questions

- **Auth approach**: Simple bcrypt + JWT (no Auth.js/Passport.js needed for single user)
- **Password storage**: Environment variable (no database dependency yet)
- **Refresh rotation**: Rotate on every use for maximum security
- **PIN implementation**: Separate from login password, separate short-lived JWT
