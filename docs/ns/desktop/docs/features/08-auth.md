# 08 — Auth

**Status:** Complete
**Phase:** 6 — Auth & Sync
**Priority:** Medium
**Completed:** v1.61.0

## Summary

Login-required authentication for the NoteSync Desktop app, using shared accounts across web, desktop, and mobile. All auth routes through ns-api. Supports registration with password strength validation, password reset via email, and TOTP 2FA for both login and settings management. Matches the ns-web auth model for feature parity.

---

## Navigation

- **Auth view routing:** `authView` state in `AppContent` switches between `"login"`, `"register"`, and `"forgot-password"` views
- **No React Router:** Uses `onNavigate` callback pattern since desktop has no router
- **Auth gate:** `AppContent` checks `isAuthenticated` from `useAuth()` — shows auth pages if false, `NotesPage` if true
- **Loading state:** Returns `null` during `isLoading` to avoid flash of login screen

---

## Pages

### LoginPage

- Email + password form with NoteSync branding (NsLogo)
- "Sign in" button disabled when inputs empty
- Error display for failed login attempts
- "Forgot your password?" link → navigates to forgot-password view
- "Create account" link → navigates to register view
- **TOTP 2FA flow:** When login returns `requiresTotp: true` with a `totpToken`, renders `TotpVerifyForm` instead of login form

### RegisterPage

- Email, password, confirm password form
- `PasswordStrengthIndicator` component with visual strength bar
- Password match validation
- "Create account" button with loading state ("Creating account...")
- "Sign in" link → navigates back to login view
- On success, auto-logs in (sets user in auth context)

### ForgotPasswordPage

- Email input + "Send reset link" button
- Success message after submission
- "Back to sign in" link → navigates to login view
- Button disabled during submission

---

## Components

### TotpVerifyForm

- 6 individual digit inputs with auto-advance on type
- Backspace navigates to previous input
- Paste support: distributes pasted digits across inputs
- Auto-submits when all 6 digits filled
- Calls `verifyTotp(totpToken, code)` on submit
- Error display for invalid codes
- "Cancel" link returns to login form

### PasswordStrengthIndicator

- Visual strength bar (4 segments: weak/fair/good/strong)
- Color-coded: red → orange → yellow → green
- Strength label text below bar
- Strength rules: length ≥ 8, uppercase, lowercase, number, special char

---

## Auth Context (`context/AuthContext.tsx`)

- `AuthProvider` wraps the entire app
- Exposes: `user`, `isAuthenticated`, `isLoading`, `login`, `register`, `logout`, `setUserFromLogin`
- **Auto-login on launch:** `useEffect` calls `refreshSession()` → if valid, calls `getMe()` to hydrate user state
- **Auth failure handler:** `setOnAuthFailure` callback clears user state on token expiry
- Token storage: access token in memory, refresh token in `localStorage` (`ns-desktop:refreshToken`)

---

## API Client (`api/client.ts`)

- `apiFetch(path, options)` — wrapper around `fetch` with:
  - Base URL from `VITE_API_URL` env var (defaults to `http://localhost:3004`)
  - Automatic `Authorization: Bearer` header when access token exists
  - Automatic `Content-Type: application/json` for non-FormData bodies
  - **401 retry:** On 401 response, calls `doRefresh()` then retries the original request
  - Auth failure callback triggers logout on unrecoverable auth errors
- `doRefresh()` — deduplicates concurrent refresh attempts via shared promise

## API Auth Functions (`api/auth.ts`)

- `login(credentials)` → `POST /auth/login`
- `register(data)` → `POST /auth/register`
- `refreshSession()` → `POST /auth/refresh` (uses stored refresh token)
- `getMe()` → `GET /auth/me`
- `logout()` → `POST /auth/logout`
- `forgotPassword(email)` → `POST /auth/forgot-password`
- `verifyTotp(totpToken, code)` → `POST /auth/totp/verify`
- `setupTotp()` → `POST /auth/totp/setup`
- `verifyTotpSetup(code)` → `POST /auth/totp/verify-setup`
- `disableTotp(code)` → `DELETE /auth/totp`

---

## CORS

- ns-api `.env` updated: `CORS_ORIGIN=http://localhost:3005,http://localhost:3006`
- Desktop dev server runs on port 3006 (configured in `vite.config.ts`)
- Production: will need `CORS_ORIGIN` updated on Railway to include desktop origin

---

## Files

| File | Action |
|------|--------|
| `packages/ns-desktop/src/App.tsx` | Edited — added AuthProvider, auth view routing, auth gate |
| `packages/ns-desktop/src/api/client.ts` | Created — apiFetch with Bearer auth and 401 retry |
| `packages/ns-desktop/src/api/auth.ts` | Created — all auth + TOTP API functions |
| `packages/ns-desktop/src/context/AuthContext.tsx` | Created — auth state management with auto-login |
| `packages/ns-desktop/src/pages/LoginPage.tsx` | Created — login form with TOTP 2FA flow |
| `packages/ns-desktop/src/pages/RegisterPage.tsx` | Created — registration form with password strength |
| `packages/ns-desktop/src/pages/ForgotPasswordPage.tsx` | Created — forgot password form |
| `packages/ns-desktop/src/components/TotpVerifyForm.tsx` | Created — 6-digit TOTP input |
| `packages/ns-desktop/src/components/PasswordStrengthIndicator.tsx` | Created — visual password strength bar |
| `packages/ns-desktop/src/pages/SettingsPage.tsx` | Edited — added 2FA settings section |
| `packages/ns-desktop/src/__tests__/AuthContext.test.tsx` | Created — 8 tests |
| `packages/ns-desktop/src/__tests__/LoginPage.test.tsx` | Created — 10 tests |
| `packages/ns-desktop/src/__tests__/RegisterPage.test.tsx` | Created — 8 tests |
| `packages/ns-desktop/src/__tests__/ForgotPasswordPage.test.tsx` | Created — 6 tests |
| `packages/ns-desktop/src/__tests__/TotpVerifyForm.test.tsx` | Created — 5 tests |
| `packages/ns-desktop/src/__tests__/PasswordStrengthIndicator.test.tsx` | Created — 4 tests |
| `packages/ns-desktop/src/__tests__/SettingsPage.test.tsx` | Edited — added 8 2FA tests (30 total) |

---

## Tests

| Test file | Tests |
|-----------|-------|
| `AuthContext.test.tsx` | 8 tests: provider state, login, register, logout, auto-refresh, auth failure |
| `LoginPage.test.tsx` | 10 tests: rendering, form validation, login flow, TOTP flow, error display |
| `RegisterPage.test.tsx` | 8 tests: rendering, form validation, password match, registration flow |
| `ForgotPasswordPage.test.tsx` | 6 tests: rendering, email submission, success message, loading state |
| `TotpVerifyForm.test.tsx` | 5 tests: digit inputs, auto-advance, paste, submit, error display |
| `PasswordStrengthIndicator.test.tsx` | 4 tests: strength levels, color coding, label text |
| `SettingsPage.test.tsx` | 8 new 2FA tests (30 total): enable/disable flow, QR code, backup codes |

---

## Desktop vs Web Differences

| Aspect | Web | Desktop |
|--------|-----|---------|
| Routing | React Router (`/login`, `/register`, etc.) | `authView` state + `onNavigate` callback |
| Token storage | httpOnly cookies (access), localStorage (refresh) | In-memory (access), localStorage (refresh) |
| Auth provider | `AuthProvider` wraps router | `AuthProvider` wraps `AppContent` |
| Password reset | In-app reset form at `/reset-password` | Sends email via API; reset happens in ns-web browser |
| WebAuthn passkeys | Supported (register + login) | Deferred (requires Tauri native integration) |
| Change password | In-app settings form | Deferred |
| Admin panel | Full admin page | Deferred |

---

## Dependencies

- [00 — Project Scaffolding](00-project-scaffolding.md) — app shell
- [07 — Settings & Preferences](07-settings-and-preferences.md) — 2FA settings section lives in SettingsPage

---

## Deferred

- **WebAuthn passkeys** — requires Tauri native integration for biometric prompts (platform authenticator)
- **Change password** — in-app form (current password + new password with strength indicator)
- **Admin panel** — user management, approved emails, AI toggle (may not be needed in desktop)
- **Tauri secure token storage** — currently uses localStorage; should migrate to `tauri-plugin-store` for encrypted storage
- **Refresh token reuse detection** — server-side feature, already in ns-api
