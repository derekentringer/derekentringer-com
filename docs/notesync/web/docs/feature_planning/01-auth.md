# 01 — Auth

**Status:** Not Started
**Phase:** 1 — Foundation
**Priority:** High

## Summary

Single-user authentication for the web app, reusing the `@derekentringer/shared` auth plugin. Same JWT + bcrypt pattern as finance-web.

## Requirements

- **Login page**:
  - Username + password form
  - Error message on invalid credentials
  - Redirect to notes view on successful login
- **Auth flow**:
  - `POST /auth/login` — validates credentials with bcrypt, returns access token
  - Access token stored in memory (not localStorage)
  - Refresh token stored as HttpOnly cookie (same as finance-web)
  - `POST /auth/refresh` — cookie-based refresh, returns new access token
  - `POST /auth/logout` — clears tokens
- **Token management**:
  - API client adds `Authorization: Bearer {token}` to all requests
  - On 401 response: attempt token refresh, retry request
  - On refresh failure: redirect to login
  - Same interceptor pattern as finance-web `client.ts`
- **Route protection**:
  - All routes except `/login` require authentication
  - `AuthContext` provider wraps the app (same pattern as finance-web)
  - Redirect unauthenticated users to `/login`
- **Single-user setup**:
  - Username and password hash stored as environment variables on Railway
  - No user registration — single admin user only
  - User record (admin-001) created on first login if not exists

## Technical Considerations

- Reuse `@derekentringer/shared/auth` Fastify plugin — registers JWT verification, `authenticate` decorator
- Reuse `@derekentringer/shared` auth types: `LoginRequest`, `LoginResponse`, `RefreshResponse`, `JwtPayload`
- Auth routes in notesync-api: copy structure from finance-api `src/routes/auth.ts` (same endpoints, same logic)
- No PIN layer — simpler than finance-api (PIN is finance-specific for sensitive financial operations)
- CORS must allow credentials for cookie-based refresh tokens

## Dependencies

- [00 — Project Scaffolding](00-project-scaffolding.md) — needs API and web app running

## Open Questions

- Should NoteSync reuse the same `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` as finance, or have its own credentials?
- Session duration: same as finance (15m access token, 7d refresh token)?
