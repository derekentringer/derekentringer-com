# 08 — Auth

**Status:** Complete
**Phase:** 6 — Auth & Sync
**Priority:** Medium
**Completed:** v1.61.0

## Summary

Login-required authentication for the desktop app, using shared accounts across web, desktop, and mobile platforms. All auth routes through ns-api. Supports registration, password reset, TOTP 2FA, and WebAuthn passkeys. Matches the ns-web auth model for feature parity.

## Requirements

- **Login required**:
  - App launches to a login screen; no access to notes without authentication
  - Email + password login form with NoteSync branding
  - JWT access + refresh tokens stored locally for session persistence
  - Auto-login on app launch if stored tokens are still valid
  - Logout clears local tokens and returns to login screen
- **Shared accounts**:
  - Same user account works on web, desktop, and mobile
  - Account created on any platform is usable on all others
  - Per-user data isolation (each user sees only their own notes)
- **Registration**:
  - Registration form with email, password, and password confirmation
  - Email must be on the admin-managed approved list (same as ns-web)
  - Password strength validation with visual strength indicator (shared rules with ns-web)
- **Password reset**:
  - "Forgot password?" link on login screen
  - Reset email sent via Resend (through ns-api)
  - Reset link opens in system browser → ns-web password reset page
- **TOTP 2FA**:
  - Setup flow: generate secret, display QR code, verify with 6-digit code
  - Login flow: after email+password, prompt for TOTP code if 2FA is enabled
  - Backup codes for recovery
  - Disable 2FA option in settings
- **WebAuthn passkeys**:
  - Register passkeys (e.g., Touch ID, Windows Hello) for passwordless login
  - Login flow: offer passkey option on login screen
  - Multiple passkeys per account
  - RP ID configured via environment variable (matches production domain)
- **Change password**:
  - In-app change password form (current password + new password)
  - Password strength indicator on new password field
  - Revokes other sessions on password change (keeps current session active)
- **Admin panel**:
  - Admin page accessible to admin-role users
  - User management: list users, admin password reset, delete user
  - Approved emails: manage registration whitelist
  - Global AI toggle: enable/disable all AI features for all users
- **Token management**:
  - Access token: short-lived (15 min), sent as Bearer header
  - Refresh token: long-lived, stored securely (Tauri secure storage or encrypted in SQLite)
  - Auto-refresh on 401 response with retry
  - Refresh token reuse detection (if a token is used twice, invalidate the session family)

## Technical Considerations

- All auth endpoints already exist on ns-api — desktop is a new client, not a new auth system
- Token storage: use Tauri's `tauri-plugin-store` or a dedicated encrypted SQLite table
- WebAuthn: Tauri may need native integration for biometric prompts (platform authenticator)
- Password reset flows through ns-web in the browser (desktop just opens the URL)
- Offline behavior: app works offline after initial login; tokens are validated locally by checking expiry
- CORS: ns-api must allow the desktop origin (Tauri uses `tauri://localhost` or custom scheme)

## Dependencies

- [00 — Project Scaffolding](../features/00-project-scaffolding.md) — needs app shell
- [09 — Sync Engine](09-sync-engine.md) — auth tokens are required for sync API calls

## Open Questions

- Should the desktop app support account creation, or redirect to ns-web for registration?
- How to handle token expiry during long offline periods (require re-login)?
- Should passkey registration happen in-app or redirect to ns-web settings?
