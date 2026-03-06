# 10 — Multi-User Auth

## Overview

Full multi-user support replacing the single-user env-var-based auth. Includes a User model with per-user data isolation, email-based registration gated by an admin-managed approved list, password reset via Resend email service, TOTP two-factor authentication, and an admin panel for user management. The primary account (derekentringer@gmail.com) is the sole admin.

Implemented in four phases:
- **10a** — User Model & Data Isolation
- **10b** — Registration, Login, Password Reset
- **10c** — Admin Panel
- **10d** — TOTP Two-Factor Authentication

## Database

### New Models (`ns-api/prisma/schema.prisma`)

- **User** — `id`, `email` (unique), `passwordHash`, `displayName`, `role` ("admin"/"user"), `totpSecret`, `totpEnabled`, `backupCodes` (JSON), `mustChangePassword`, `createdAt`, `updatedAt`. Relations: notes, folders, refreshTokens.
- **PasswordResetToken** — `id`, `token` (unique, hashed), `userId` (FK → User), `expiresAt`, `createdAt`. Cascade delete on user removal.

### Modified Models

- **Note** — added `userId` (FK → User, cascade delete), `@@index([userId])`
- **Folder** — added `userId` (FK → User, cascade delete), `@@index([userId])`, unique constraint changed to `@@unique([userId, parentId, name])`
- **SyncCursor** — added `userId`, PK changed to `@@id([userId, deviceId])`
- **RefreshToken** — added FK relation to User (column already existed)

### Migration

- `20260308000000_add_users/migration.sql` — creates users table, password_reset_tokens table, adds userId to notes/folders/sync_cursors, backfills existing data to admin user `admin-001`, adds foreign keys and indexes

## Backend

### User Store (`ns-api/src/store/userStore.ts`) — Created

- `createUser(data)` — insert with bcrypt-hashed password (cost 12)
- `getUserById(id)` — find by PK
- `getUserByEmail(email)` — find by unique email
- `updateUser(id, data)` — update fields (password, displayName, totp, backupCodes, etc.)
- `listUsers()` — admin-only, returns all users
- `deleteUser(id)` — cascade delete (user + all their data)

### Password Reset Store (`ns-api/src/store/passwordResetStore.ts`) — Created

- `createPasswordResetToken(userId)` — generates token, stores hashed (SHA-256), returns raw token
- `lookupPasswordResetToken(rawToken)` — hash + lookup + expiry check
- `deletePasswordResetTokens(userId)` — cleanup all tokens for user
- `cleanupExpiredTokens()` — delete expired tokens

### Setting Store (`ns-api/src/store/settingStore.ts`) — Modified

- `getApprovedEmails()` — returns comma-separated approved email list
- `setApprovedEmails(emails)` — stores approved email list
- `getAiEnabled()` / `setAiEnabled()` — global AI toggle

### Note Store (`ns-api/src/store/noteStore.ts`) — Modified

- All exported functions now take `userId: string` as first parameter
- All queries scoped with `where: { userId }` for data isolation
- Folder unique constraint updated to `[userId, parentId, name]`
- Raw SQL queries (`keywordSearch`, `semanticSearch`, `hybridSearch`) — added `AND "userId" = $N`

### Link Store (`ns-api/src/store/linkStore.ts`) — Modified

- `getBacklinks()` — joins through notes table, filters by userId
- `listNoteTitles()` — scoped to user's notes
- `resolveWikiLinks()` — title lookups scoped to user's notes

### Version Store (`ns-api/src/store/versionStore.ts`) — Modified

- Note ownership verified before returning versions

### Email Service (`ns-api/src/services/emailService.ts`) — Created

- Resend SDK integration for transactional emails
- `sendPasswordResetEmail(email, resetToken, appUrl)` — sends email with reset link
- HTML email template with reset button

### Admin Guard (`ns-api/src/middleware/adminGuard.ts`) — Created

- Fastify hook: checks `request.user.role === "admin"`, returns 403 if not

### Auth Routes (`ns-api/src/routes/auth.ts`) — Modified

- `POST /auth/login` — database-backed login (was env-var based), returns `requiresTotp` when TOTP enabled, handles `mustChangePassword` flow
- `POST /auth/register` — email validation, approved-list check, password strength validation, auto-login
- `POST /auth/forgot-password` — rate-limited (3/15min), sends reset email, constant-time response
- `POST /auth/reset-password` — validates token + expiry, updates password, revokes all sessions
- `POST /auth/change-password` — authenticated, verifies current password, updates hash
- `POST /auth/revoke-all-sessions` — revokes all refresh tokens for user
- `GET /auth/me` — returns authenticated user profile

### Admin Routes (`ns-api/src/routes/admin.ts`) — Created

- `GET /admin/users` — list all users (admin only)
- `POST /admin/users/:id/reset-password` — reset user password, set mustChangePassword, revoke sessions
- `DELETE /admin/users/:id` — delete user and all their data (prevents self-delete)
- `GET /admin/approved-emails` / `PUT /admin/approved-emails` — manage registration approved list
- `GET /admin/ai-settings` / `PUT /admin/ai-settings` — global AI enable/disable toggle

### TOTP Routes (`ns-api/src/routes/totp.ts`) — Created

- `POST /auth/totp/setup` — generates secret, returns QR code data URL and otpauth URL
- `POST /auth/totp/verify-setup` — verifies code against pending secret, enables TOTP, generates 8 backup codes
- `POST /auth/totp/verify` — second step of login (validates totpToken JWT + TOTP code or backup code)
- `DELETE /auth/totp` — disables 2FA (requires valid TOTP code)

### Note Routes (`ns-api/src/routes/notes.ts`) — Modified

- All handlers extract `userId = request.user.sub` and pass to store functions

### AI Routes (`ns-api/src/routes/ai.ts`) — Modified

- userId scoping for all AI operations
- Admin AI toggle check: returns 403 when AI disabled globally

### Mapper (`ns-api/src/lib/mappers.ts`) — Modified

- `toUserResponse(row)` — maps database user to API response (strips sensitive fields)

### Config (`ns-api/src/config.ts`) — Modified

- Removed `adminUsername`, `adminPasswordHash`
- Added `resendApiKey`, `appUrl`

## Shared Package

### Types (`shared/src/types/auth.ts`) — Modified

- `User` — `id`, `email`, `displayName?`, `role`, `totpEnabled`, `createdAt`, `updatedAt`
- `JwtPayload` — `sub` (userId), `email`, `role`, `iat`, `exp`
- `LoginRequest` — `email` + `password` (was `username`)
- `RegisterRequest`, `ForgotPasswordRequest`, `ResetPasswordRequest`, `ChangePasswordRequest` — new
- `TotpSetupResponse`, `TotpVerifySetupResponse`, `TotpVerifyRequest` — new
- `LoginResponse` — added optional `requiresTotp`, `totpToken`, `mustChangePassword`

### Password Validation (`shared/src/validation/password.ts`) — Created

- `validatePasswordStrength(password)` → `{ valid: boolean; errors: string[] }`
- Rules: min 8 chars, uppercase, lowercase, number, special character
- Used by both backend and frontend

### Barrel Export Fix (`shared/src/index.ts`) — Modified

- Removed `encrypt`/`decrypt` barrel export (was pulling Node's `crypto` into browser bundles)
- Added `"./crypto"` subpath export in `package.json` for server-side imports

## Frontend

### New Pages

- **RegisterPage** — email, password, confirm password, display name, real-time password strength indicator, approved-list gating
- **ForgotPasswordPage** — email input, success message
- **ResetPasswordPage** — reads `?token=` from URL, new password with strength indicator
- **ChangePasswordPage** — current password, new password, confirm password
- **AdminPage** — three sections: AI Controls (global toggle), Approved Emails (textarea), User Management (table with reset password/delete)

### New Components

- **PasswordStrengthIndicator** — visual bar (red → yellow → green) + requirement checklist
- **TotpVerifyForm** — 6-digit code input with backup code toggle

### Modified Pages

- **LoginPage** — email field (was username), TOTP verification step, forgot password + register links
- **SettingsPage** — Two-Factor Authentication section (setup with QR code, backup codes display, disable flow)

### Auth Context (`ns-web/src/context/AuthContext.tsx`) — Modified

- Real user data via `GET /auth/me` on refresh (was hardcoded)
- `register()` function
- `mustChangePassword` flow (redirect to change password page)
- `requiresTotp` flow (show TOTP input step)

### API Client (`ns-web/src/api/auth.ts`) — Modified

- `register()`, `forgotPassword()`, `resetPassword()`, `changePassword()`, `getMe()`
- `setupTotp()`, `verifyTotpSetup()`, `verifyTotp()`, `disableTotp()`

### Admin API (`ns-web/src/api/admin.ts`) — Created

- `getUsers()`, `resetUserPassword()`, `deleteUser()`
- `getApprovedEmails()`, `setApprovedEmails()`
- `getAdminAiSettings()`, `setAdminAiSettings()`

### App Router (`ns-web/src/App.tsx`) — Modified

- Added routes: `/register`, `/forgot-password`, `/reset-password`, `/change-password`, `/admin`
- Admin route visible only for `role === "admin"`

### Sidebar — Modified

- "Admin" link visible only when `user.role === "admin"`

## Dependencies

### Added

- `ns-api`: `resend` (email SDK), `otpauth` (TOTP), `qrcode` + `@types/qrcode` (QR generation)

### Removed

- `ns-api`: `@simplewebauthn/server` (passkeys removed — Chrome localhost limitation)
- `ns-web`: `@simplewebauthn/browser` (passkeys removed)

## Environment Variables

### Removed

- `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` — replaced by User table
- `RP_ID`, `RP_NAME` — passkey config (feature removed)

### Added

- `RESEND_API_KEY` — Resend email service for password resets
- `APP_URL` — base URL for email links (e.g., `https://ns.derekentringer.com`)

## Tests

### Backend (ns-api)

- `auth.test.ts` — database-backed login, register (happy path, unapproved email, weak password, duplicate), forgot/reset password, change password, revoke sessions, `GET /auth/me`
- `admin.test.ts` — all admin routes, 403 for non-admin, approved emails CRUD, AI toggle, user reset/delete
- `totp.test.ts` — setup flow, verify setup, login with TOTP, backup code login, disable 2FA
- `config.test.ts` — updated for removed rpId/rpName fields
- `helpers/mockPrisma.ts` — added `user`, `passwordResetToken` mock models
- All note/AI route tests updated to pass `userId`

### Frontend (ns-web)

- `PasswordStrengthIndicator.test.tsx` — strength levels, requirement checks
- Existing tests updated with `userId` in mock data

## Files Changed

| File | Action |
|------|--------|
| `ns-api/prisma/schema.prisma` | Modified — User, PasswordResetToken models; userId on Note/Folder/SyncCursor |
| `ns-api/prisma/migrations/20260308000000_add_users/migration.sql` | Created |
| `ns-api/src/config.ts` | Modified — removed admin creds, added resendApiKey/appUrl |
| `ns-api/src/app.ts` | Modified — registered admin/totp routes |
| `ns-api/src/store/userStore.ts` | Created |
| `ns-api/src/store/passwordResetStore.ts` | Created |
| `ns-api/src/store/settingStore.ts` | Modified — approved emails, AI toggle |
| `ns-api/src/store/noteStore.ts` | Modified — userId param on all functions |
| `ns-api/src/store/linkStore.ts` | Modified — userId scoping |
| `ns-api/src/store/versionStore.ts` | Modified — ownership verification |
| `ns-api/src/services/emailService.ts` | Created |
| `ns-api/src/middleware/adminGuard.ts` | Created |
| `ns-api/src/routes/auth.ts` | Modified — database-backed, register, password reset/change |
| `ns-api/src/routes/admin.ts` | Created |
| `ns-api/src/routes/totp.ts` | Created |
| `ns-api/src/routes/notes.ts` | Modified — userId extraction |
| `ns-api/src/routes/ai.ts` | Modified — userId scoping, AI toggle |
| `ns-api/src/lib/mappers.ts` | Modified — toUserResponse |
| `shared/src/types/auth.ts` | Modified — User, auth request/response types |
| `shared/src/validation/password.ts` | Created |
| `shared/src/index.ts` | Modified — new type exports, crypto barrel fix |
| `shared/package.json` | Modified — added ./crypto subpath export |
| `ns-web/src/context/AuthContext.tsx` | Modified — real user data, register, TOTP |
| `ns-web/src/pages/LoginPage.tsx` | Modified — email field, TOTP step |
| `ns-web/src/pages/RegisterPage.tsx` | Created |
| `ns-web/src/pages/ForgotPasswordPage.tsx` | Created |
| `ns-web/src/pages/ResetPasswordPage.tsx` | Created |
| `ns-web/src/pages/ChangePasswordPage.tsx` | Created |
| `ns-web/src/pages/AdminPage.tsx` | Created |
| `ns-web/src/pages/SettingsPage.tsx` | Modified — TOTP section |
| `ns-web/src/components/PasswordStrengthIndicator.tsx` | Created |
| `ns-web/src/components/TotpVerifyForm.tsx` | Created |
| `ns-web/src/api/auth.ts` | Modified — register, password flows, TOTP |
| `ns-web/src/api/admin.ts` | Created |
| `ns-web/src/App.tsx` | Modified — new routes |
| `ns-api/src/__tests__/auth.test.ts` | Modified — database-backed tests |
| `ns-api/src/__tests__/admin.test.ts` | Created |
| `ns-api/src/__tests__/totp.test.ts` | Created |
| `ns-api/src/__tests__/config.test.ts` | Modified |
| `ns-api/src/__tests__/helpers/mockPrisma.ts` | Modified — user, passwordResetToken |
| `ns-web/src/__tests__/PasswordStrengthIndicator.test.tsx` | Created |
| `fin-api/src/lib/encryption.ts` | Modified — import from `@derekentringer/shared/crypto` |
| `fin-api/prisma/data-migrations/encrypt-plaintext-fields.ts` | Modified — import path |
| `CLAUDE.md` | Modified — updated env vars documentation |
