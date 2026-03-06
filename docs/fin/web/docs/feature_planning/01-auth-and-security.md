# 01 — Auth & Security

**Status:** Complete (see [features/01-auth-and-security.md](../features/01-auth-and-security.md))
**Phase:** 1 — Foundation
**Priority:** High

## Summary

Multi-user authentication with email-based registration, password reset, admin panel, and TOTP two-factor authentication. All API routes are behind auth middleware — no public endpoints except login, register, refresh, and password reset flows.

## Requirements

- Multi-user authentication with email/password registration
- Registration gated by admin-managed approved email list
- JWT access tokens with short expiry (~15 minutes)
- Refresh tokens with rotation for seamless session renewal
- Password reset via email (Resend service)
- Password change with strength validation
- TOTP two-factor authentication via authenticator apps
- Backup codes for TOTP recovery
- Admin panel for user management (single admin: dentringer@gmail.com)
- Admin-controlled settings: approved emails, global AI toggle
- Per-user data isolation — all user-scoped data filtered by userId
- All API routes behind auth middleware (except public auth endpoints and health)
- Rate limiting on auth endpoints to prevent brute force
- CORS configured to only allow the web frontend origin

## Technical Considerations

- Database-backed users with Prisma User model
- Password hashing via bcrypt (12 rounds)
- Password strength validation shared between frontend and backend (`@derekentringer/shared`)
- JWT payload includes `sub` (userId), `email`, and `role`
- Refresh token stored in httpOnly cookie (with `isMobileClient` body fallback for mobile apps)
- TOTP via `otpauth` library with QR code generation (`qrcode`)
- Email service via Resend SDK (same account as NoteSync)
- Admin guard middleware checks `request.user.role === "admin"`
- Settings table for admin-controlled server-wide settings
- PIN system removed — TOTP replaces it for 2FA

## Dependencies

- [00 — Project Scaffolding](00-project-scaffolding.md) — needs API package set up
- [02 — Database & Encryption](02-database-and-encryption.md) — needs PostgreSQL + Prisma

## Resolved Design Decisions

- **Auth approach**: Database-backed multi-user with bcrypt + JWT (replaced single-user env var approach)
- **Registration gating**: Admin-managed approved email list in Settings table
- **2FA method**: TOTP via authenticator apps (replaced PIN system)
- **Admin model**: Single admin only (dentringer@gmail.com), identified by `role: "admin"` in User table
- **Password rules**: Shared validator from `@derekentringer/shared` (min 8, upper, lower, number, special)
- **Email service**: Resend (same account as NoteSync)
- **Data isolation**: userId column on all user-scoped tables, enforced at store layer
