# 01 — Authentication

**Status:** Planned
**Phase:** 1 — Foundation
**Priority:** High

## Summary

Login/logout flow with JWT token management. Tokens stored in OS keychain with config file fallback. Auto-refresh on 401.

## Commands

```bash
ns login                                    # Interactive: prompt for email + password
ns login --email user@example.com           # Non-interactive with password prompt
ns login --server https://custom-api.com    # Custom server URL
ns logout                                   # Clear stored credentials
ns whoami                                   # Show current user, email, server
```

## Token Storage

**Primary**: OS keychain via `keyring` package (mirrors desktop app's Rust keyring)
- macOS: Keychain
- Linux: libsecret
- Windows: Credential Vault

**Fallback**: `~/.config/notesync-cli/credentials.json` with `0600` permissions

```typescript
// Stored data
{
  "server": "https://ns-api.derekentringer.com",
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "email": "user@example.com"
}
```

## Auto-Refresh

The API client intercepts 401 responses and:
1. Uses the refresh token to get a new access token (`POST /auth/refresh`)
2. Retries the original request with the new token
3. If refresh fails, prompts user to `ns login` again

## TOTP / 2FA Support

If the user has TOTP enabled:
```bash
ns login --email user@example.com
Password: ********
TOTP code: 123456
✓ Logged in as user@example.com
```

## Tasks

- [ ] Create `lib/auth.ts` — token storage (keychain + fallback)
- [ ] Create `commands/auth.ts` — login, logout, whoami
- [ ] Integrate auth into `lib/api.ts` — auto-inject Bearer token
- [ ] Add 401 auto-refresh logic
- [ ] Add TOTP prompt support
- [ ] Test login flow end-to-end
