# 08 — Multi-User Auth, TOTP 2FA & PIN Removal

**Status:** Complete
**Phase:** 8 — Multi-User Auth
**Priority:** High
**Completed:** v1.52.0

## Summary

Updated fin-mobile to align with the Phase 18 backend overhaul that introduced multi-user auth with email-based registration, password reset, TOTP two-factor authentication, and admin panel. Removed the deprecated PIN verification system. The app now fetches real user data from `GET /auth/me` instead of using a hardcoded admin placeholder, and handles all new auth flows (TOTP challenge on login, registration, forgot password, security settings).

## What Was Implemented

### PIN System Removal

- Removed `PinGateModal` component and all PIN-related state/functions from auth store
- Removed `pinToken` parameter from all delete API functions (`deleteAccount`, `deleteTransaction`, `deleteBill`, `deleteBudget`) and their corresponding React Query mutation hooks
- Removed `x-pin-token` header from all API calls
- Removed PIN token from secure storage keys and `tokenStorage` helper functions
- Delete operations on 6 screens now execute directly without PIN verification: `AccountDetailScreen`, `TransactionDetailScreen`, `BillsScreen`, `BillDetailScreen`, `BudgetsScreen`, `IncomeSourcesScreen`

### Auth Store Overhaul

- `initialize()` now calls `authApi.getMe()` to fetch real user data from the API instead of setting a hardcoded `admin-001` placeholder
- `login()` returns `{ requiresTotp?, totpToken?, mustChangePassword? }` — callers check for TOTP challenge
- Login only stores tokens when no TOTP is required (partial login returns `totpToken` for second factor)
- Added `verifyTotp(totpToken, code)` action — completes TOTP-gated login, stores tokens, sets user
- Added `setUser(user)` action — allows screens to update user state after profile changes (e.g., enabling/disabling 2FA)

### Login Screen Updates

- Changed "Username" placeholder to "Email" with `keyboardType="email-address"` and `autoComplete="email"`
- Added TOTP verification view (conditional render after login returns `requiresTotp`):
  - 6-digit code input with auto-advance and auto-submit on last digit
  - "Use backup code" toggle switching to single text input
  - Error display with haptic feedback and auto-reset
  - "Back to Sign In" button to return to login form
- Added "Forgot password?" and "Create account" navigation links

### New Auth Screens

- **RegisterScreen** — Email, display name (optional), password, confirm password; password strength validation using `validatePasswordStrength` from `@derekentringer/shared`; calls `authApi.register()`, sets authenticated on success
- **ForgotPasswordScreen** — Email input; calls `authApi.forgotPassword()`; shows success message ("Check your email for reset instructions")
- **ResetPasswordScreen** — Receives `token` via navigation params; new password + confirm with strength validation; calls `authApi.resetPassword()`; success state with "Sign In" navigation

### Security Screen

Three sections using existing `MenuSection`/`MenuRow` pattern:
- **Change Password** — Current password, new password, confirm password inputs with `validatePasswordStrength` strength indicator; calls `authApi.changePassword()`
- **Two-Factor Authentication** — Shows status from `user.totpEnabled`; if disabled: "Set Up 2FA" row navigates to `TotpSetupScreen`; if enabled: "Disable" button with `Alert.prompt` for current TOTP code
- **Sessions** — "Sign Out All Devices" row calls `authApi.revokeAllSessions()` then logs out locally

### TOTP Setup Screen

Step-by-step flow:
1. Calls `authApi.setupTotp()` → displays QR code (`Image` from `qrCodeDataUrl` data URI) and copyable manual secret text
2. "Next" button → 6-digit verification code input with auto-advance
3. Calls `authApi.verifyTotpSetup(code)` → displays backup codes list in monospace font
4. "Done" button → refreshes user data via `authApi.getMe()` and navigates back

### New API Functions

Added 10 new methods to `authApi` in `services/api.ts`:
- `getMe()` — `GET /auth/me`
- `verifyTotp(totpToken, code)` — `POST /auth/totp/verify`
- `setupTotp()` — `POST /auth/totp/setup`
- `verifyTotpSetup(code)` — `POST /auth/totp/verify-setup`
- `disableTotp(code)` — `DELETE /auth/totp`
- `changePassword(current, new)` — `POST /auth/change-password`
- `revokeAllSessions()` — `POST /auth/sessions/revoke-all`
- `register(email, password, displayName?)` — `POST /auth/register`
- `forgotPassword(email)` — `POST /auth/forgot-password`
- `resetPassword(token, newPassword)` — `POST /auth/reset-password`

### Navigation Updates

- Added `Register`, `ForgotPassword`, `ResetPassword` screens to AuthStack
- Added `Security` and `TotpSetup` to `MoreStackParamList` and MoreStack navigator
- Added "Security" menu row to MoreScreen (icon: `shield-lock-outline`, subtitle: "Password, 2FA, sessions")

### Shared Type Imports

New imports from `@derekentringer/shared`: `User`, `TotpSetupResponse`, `TotpVerifySetupResponse`, `RegisterRequest`, `validatePasswordStrength`

## Files Changed

| Action | File |
|--------|------|
| DELETE | `components/common/PinGateModal.tsx` |
| MODIFY | `services/api.ts` — remove PIN, add 10 auth API functions |
| MODIFY | `store/authStore.ts` — remove PIN state, add getMe/TOTP/setUser |
| MODIFY | `screens/LoginScreen.tsx` — email field, TOTP flow, nav links |
| MODIFY | `screens/AccountDetailScreen.tsx` — remove PIN gate |
| MODIFY | `screens/TransactionDetailScreen.tsx` — remove PIN gate |
| MODIFY | `screens/BillsScreen.tsx` — remove PIN gate |
| MODIFY | `screens/BillDetailScreen.tsx` — remove PIN gate |
| MODIFY | `screens/BudgetsScreen.tsx` — remove PIN gate |
| MODIFY | `screens/IncomeSourcesScreen.tsx` — remove PIN gate |
| MODIFY | `screens/MoreScreen.tsx` — add Security row |
| MODIFY | `api/accounts.ts` — remove pinToken |
| MODIFY | `api/transactions.ts` — remove pinToken |
| MODIFY | `api/bills.ts` — remove pinToken |
| MODIFY | `api/budgets.ts` — remove pinToken |
| MODIFY | `hooks/useAccounts.ts` — remove pinToken from mutation |
| MODIFY | `hooks/useTransactions.ts` — remove pinToken from mutation |
| MODIFY | `hooks/useBills.ts` — remove pinToken from mutation |
| MODIFY | `hooks/useBudgets.ts` — remove pinToken from mutation |
| MODIFY | `navigation/types.ts` — add Security, TotpSetup |
| MODIFY | `navigation/AppNavigator.tsx` — add all new screens |
| CREATE | `screens/RegisterScreen.tsx` |
| CREATE | `screens/ForgotPasswordScreen.tsx` |
| CREATE | `screens/ResetPasswordScreen.tsx` |
| CREATE | `screens/SecurityScreen.tsx` |
| CREATE | `screens/TotpSetupScreen.tsx` |

## Verification

1. `npx turbo run type-check` — all 9 packages pass
2. `npx turbo run test` — all 9 packages pass
3. Production APK built and installed on physical device via `npx expo run:android --variant release`
