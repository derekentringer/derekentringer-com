# 01 — Auth & Security

**Status:** Not Started
**Phase:** 1 — Foundation
**Priority:** High

## Summary

Implement single-user gated access so only one authorized user can access the finance tool. All API routes are behind auth middleware — no public endpoints except login.

## Requirements

- Single-user authentication (this is a personal tool, not multi-tenant)
- Username/password login with bcrypt password hashing
- JWT access tokens with short expiry (~15 minutes)
- Refresh tokens for seamless session renewal
- All API routes behind auth middleware (except `POST /auth/login` and `GET /health`)
- Rate limiting on login endpoint to prevent brute force
- Optional secondary PIN/passphrase for viewing sensitive data (account numbers, balances) — similar to how banking apps gate sensitive screens
- CORS configured to only allow the web frontend origin
- TLS enforced (Railway provides this by default)

## Technical Considerations

- Two auth approaches were considered:
  1. **Auth.js (NextAuth) / Passport.js** with an allowlist of one email
  2. **Simple bcrypt + JWT** with a hardcoded single user
- Option 2 is simpler for a single-user tool and avoids OAuth provider dependencies
- Store hashed password in the database or as an env var
- JWT secret stored as a Railway environment variable
- Refresh token stored in an httpOnly cookie
- Consider `@fastify/rate-limit` for rate limiting
- Consider `@fastify/cors` for CORS configuration

## Dependencies

- [00 — Project Scaffolding](00-project-scaffolding.md) — needs API package set up

## Open Questions

- Final decision: bcrypt+JWT vs. Auth.js/Passport.js with allowlist?
- Should the hashed password be stored in the database or as an env var?
- Refresh token rotation strategy — rotate on every use or fixed expiry?
- PIN/passphrase implementation — separate from login password or derived from it?
