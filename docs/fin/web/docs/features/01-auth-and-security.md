# 01 — Auth & Security

**Status:** Complete
**Phase:** 1 — Foundation
**Priority:** High
**Completed:** v1.2.0 (single-user), v1.6.0 (multi-user overhaul)

## Summary

Multi-user JWT authentication for the personal finance app. Database-backed users with email/password registration (gated by approved email list), password reset via email, TOTP two-factor authentication, and admin panel. All API routes are gated behind auth middleware. Per-user data isolation ensures each user only sees their own financial data.

## What Was Implemented

### Phase 18a — User Model & Data Isolation

#### Database Schema Changes
- **User model** — id, email (unique), passwordHash, displayName, role (admin/user), totpSecret, totpEnabled, backupCodes, mustChangePassword, timestamps
- **PasswordResetToken model** — token (unique), userId, expiresAt
- **Setting model** — key-value store for admin-controlled settings (approved emails, AI toggle)
- **userId column** added to 16 tables: Account, Category, CategoryRule, Budget, Bill, IncomeSource, Goal, TargetAllocation, DeviceToken, NotificationPreference, NotificationLog, AiInsightPreference, AiInsightCache, AiInsightUsage, AiInsightStatus, RefreshToken
- **Per-user unique constraints**: Category name, Budget category+effectiveFrom, NotificationPreference type, AiInsightUsage date, AiInsightCache scope+hash, TargetAllocation accountId+assetClass
- **Global tables** (no userId): PriceHistory, BenchmarkHistory

#### Backend Store Changes
- All 19 store files updated to accept `userId: string` as first parameter
- Ownership verification on single-record operations
- Notification scheduler iterates over all users
- Default categories and notification preferences seeded per-user on registration

#### PIN System Removal
- Removed PIN verification endpoint, `signPinToken`, `ADMIN_USER_ID` constant
- Removed `PinContext`, `PinGate` components from frontend
- Removed PIN guards from all route files (accounts, transactions, balances, budgets, bills, goals, holdings, incomeSources)
- Removed `verifyPin` from frontend API client

### Phase 18b — Registration, Login & Password Reset

#### Backend (`packages/fin-api/`)
- **POST /auth/login** — email/password login, TOTP check, mustChangePassword support
- **POST /auth/register** — approved email check, password validation, auto-login, seeds default categories + notification preferences
- **POST /auth/refresh** — token rotation with `isMobileClient` body fallback for mobile apps
- **GET /auth/me** — returns current user profile
- **POST /auth/logout** — revokes refresh token, clears cookie
- **POST /auth/sessions/revoke-all** — revokes all sessions for current user
- **POST /auth/forgot-password** — sends reset email via Resend (always returns 200)
- **POST /auth/reset-password** — validates token, updates password, revokes all sessions
- **POST /auth/change-password** — verifies current password, validates new, revokes other sessions
- **Email service** (`src/services/emailService.ts`) — Resend SDK with "Fin" branding

#### Frontend (`packages/fin-web/`)
- **RegisterPage** — email, password, confirm password, display name, password strength indicator, auto-login
- **ForgotPasswordPage** — email input with success confirmation
- **ResetPasswordPage** — reads `?token=` from URL, new password + confirm
- **PasswordStrengthIndicator** — uses `validatePasswordStrength` from `@derekentringer/shared`
- **AuthContext** — calls `getMe()` after refresh for real user data, `register` and `setUserFromLogin` functions
- **LoginPage** — email field (replaced username), "Forgot password?" and "Create account" links

### Phase 18c — Admin Panel

#### Backend (`packages/fin-api/`)
- **Admin guard middleware** (`src/middleware/adminGuard.ts`) — checks `request.user.role === "admin"`, returns 403
- **GET /admin/users** — list all users
- **POST /admin/users/:id/reset-password** — admin resets user password, sets mustChangePassword
- **DELETE /admin/users/:id** — delete user + cascade data (prevents self-deletion)
- **GET/PUT /admin/approved-emails** — manage approved email list
- **GET/PUT /admin/ai-settings** — toggle global AI enabled/disabled
- **AI routes** modified to check `getSetting("aiEnabled")`, returns 503 when disabled

#### Frontend (`packages/fin-web/`)
- **AdminPage** — three sections: AI Controls toggle, Approved Emails textarea, User Management table with reset-password and delete dialogs
- **Sidebar** — "Admin" nav item with Shield icon, visible only when `user.role === "admin"`
- **Admin API client** (`src/api/admin.ts`) — all admin API functions

### Phase 18d — TOTP Two-Factor Authentication

#### Backend (`packages/fin-api/`)
- **POST /auth/totp/setup** — generates TOTP secret + QR code (issuer: "Fin")
- **POST /auth/totp/verify-setup** — verifies code, enables 2FA, returns backup codes
- **POST /auth/totp/verify** — second step of login (validates totpToken + TOTP code)
- **DELETE /auth/totp** — disables 2FA (requires current code)
- Backup code consumption with automatic disable when all codes used
- `isMobileClient` pattern preserved in verify response

#### Frontend (`packages/fin-web/`)
- **TotpVerifyForm** — 6-digit code input with auto-advance, paste support, auto-submit, "Use backup code" toggle
- **LoginPage** — TOTP verification step when login returns `requiresTotp`
- **SettingsPage Security tab** — Change Password (with strength indicator), Two-Factor Authentication (setup QR, verify, backup codes, disable), Sessions (revoke all)

### Shared Package (`packages/shared/`)
- Auth types: `User`, `LoginResponse` (with `requiresTotp`, `totpToken`, `mustChangePassword`), `RefreshResponse`, `RegisterRequest/Response`, `TotpSetupResponse`, `TotpVerifySetupResponse`, `LogoutResponse`, `AuthPluginOptions`
- `validatePasswordStrength()` — min 8 chars, uppercase, lowercase, number, special character
- Reusable Fastify auth plugin (`@derekentringer/shared/auth`) — registers `@fastify/jwt`, decorates `fastify.authenticate`

## Security Design

- **Password storage**: bcrypt hash (12 rounds) in database User table
- **Password validation**: Shared validator enforces min 8 chars, uppercase, lowercase, number, special character
- **Access token**: memory-only (never in cookie/localStorage), 15-minute expiry, payload includes sub/email/role
- **Refresh token**: httpOnly cookie (Secure in production, SameSite=Strict, scoped to `/auth/refresh`), 7-day expiry; mobile clients receive token in response body
- **Refresh rotation**: stolen token usable only once (revoke-on-use)
- **TOTP 2FA**: TOTP via `otpauth` library (SHA-1, 6 digits, 30s period), QR code via `qrcode` library
- **Backup codes**: 8 random codes generated on TOTP setup, consumed on use, 2FA auto-disabled when all codes used
- **Rate limiting**: 5/15min on login, 3/1hr on register, 3/15min on forgot-password, 5/15min on reset-password, 100/min global
- **CORS**: locked to finance-web origin only
- **Data isolation**: userId column on all user-scoped tables, enforced at store layer
- **Admin guard**: middleware checks JWT role claim, returns 403 for non-admin users

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | Production only | JWT signing secret (min 32 chars) |
| `REFRESH_TOKEN_SECRET` | Production only | Refresh token secret |
| `CORS_ORIGIN` | No (default: `http://localhost:3003`) | Allowed CORS origin |
| `RESEND_API_KEY` | Production only | Resend API key for password reset emails |
| `APP_URL` | No (default: `http://localhost:3003`) | Frontend URL for email links |

### Removed Environment Variables (v1.6.0)

| Variable | Reason |
|----------|--------|
| `ADMIN_USERNAME` | Replaced by database-backed users with email login |
| `ADMIN_PASSWORD_HASH` | Password hash now stored in User table |
| `PIN_TOKEN_SECRET` | PIN system removed, TOTP replaces it |
| `PIN_HASH` | PIN system removed, TOTP replaces it |

## New Files Created

| File | Description |
|------|-------------|
| `fin-api/prisma/migrations/20260306000000_add_multi_user_support/` | Migration: User, PasswordResetToken, Setting tables + userId columns |
| `fin-api/src/store/userStore.ts` | User CRUD operations |
| `fin-api/src/store/passwordResetStore.ts` | Password reset token CRUD |
| `fin-api/src/store/settingStore.ts` | Key-value settings store |
| `fin-api/src/middleware/adminGuard.ts` | Admin role guard middleware |
| `fin-api/src/routes/admin.ts` | Admin panel API routes |
| `fin-api/src/routes/totp.ts` | TOTP 2FA API routes |
| `fin-api/src/services/emailService.ts` | Resend email service |
| `fin-web/src/pages/RegisterPage.tsx` | Registration page |
| `fin-web/src/pages/ForgotPasswordPage.tsx` | Forgot password page |
| `fin-web/src/pages/ResetPasswordPage.tsx` | Reset password page |
| `fin-web/src/pages/AdminPage.tsx` | Admin panel page |
| `fin-web/src/components/PasswordStrengthIndicator.tsx` | Password strength indicator |
| `fin-web/src/components/TotpVerifyForm.tsx` | TOTP code input form |
| `fin-web/src/api/admin.ts` | Admin API client |

## Deleted Files

| File | Reason |
|------|--------|
| `fin-web/src/context/PinContext.tsx` | PIN system removed |
| `fin-web/src/components/PinGate.tsx` | PIN system removed |
