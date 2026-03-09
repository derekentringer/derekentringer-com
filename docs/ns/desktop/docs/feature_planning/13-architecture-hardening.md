# 13 — Architecture Hardening

**Status:** Not Started
**Phase:** 9 — Hardening
**Priority:** Low

## Summary

Systematic hardening of the desktop app's error handling, retry logic, token security, and input validation. Addresses the same categories as the ns-web architecture hardening for feature parity.

## Requirements

- **Error handling**:
  - Error toast on note save failures (auto-save and manual save)
  - Graceful error handling on note switch when previous note has unsaved changes
  - `console.error` logging on fire-and-forget operations (sync, link updates, version captures)
  - User-visible error messages for network failures, auth errors, and database errors
- **Retry logic**:
  - Sync queue: retry transient errors (network timeouts, 5xx responses) up to 3 times with exponential backoff
  - Permanent errors (4xx responses): skip and log, don't retry indefinitely
  - Failed sync items surfaced in a "Sync Issues" section for user review
- **Token security**:
  - Refresh token reuse detection: if a refresh token is used twice, invalidate the entire session family
  - Access tokens stored in memory only (not persisted to disk)
  - Refresh tokens stored in Tauri secure storage (OS keychain integration)
  - Clear all tokens on logout
- **CSRF defense**:
  - `X-Requested-With` header on auth refresh requests (defense-in-depth)
  - Validate origin on sensitive requests
- **Input validation**:
  - Audio upload magic byte validation (WebM, MP4, MP3, WAV, OGG) before sending to API
  - Note content size limits to prevent excessive SQLite writes
  - Sanitize note titles (strip control characters, enforce max length)
- **Custom scrollbar styling**:
  - Thin themed scrollbars matching dark/light themes
  - `scrollbar-width`/`scrollbar-color` for standards-compliant browsers
  - `::-webkit-scrollbar` for WebKit-based views (Tauri uses WebKit on macOS)

## Technical Considerations

- Error boundaries: React error boundaries for component-level crash recovery
- Toast system: lightweight toast/notification component for transient errors and success messages
- Retry implementation: exponential backoff with jitter (1s, 2s, 4s base delays)
- Tauri secure storage: `tauri-plugin-store` with encryption, or direct OS keychain access
- Scrollbar CSS: Tauri's webview inherits OS scrollbar styles by default; custom CSS overrides needed

## Dependencies

- [01 — Note Editor](01-note-editor.md) — error handling on save flows
- [08 — Auth](08-auth.md) — token security improvements
- [09 — Sync Engine](09-sync-engine.md) — retry logic for sync queue
- [10 — AI Features](10-ai-features.md) — audio validation

## Open Questions

- Should error logs be persisted to a local file for debugging, or kept in-memory only?
- How aggressive should sync retry be before giving up (3 retries? 5?)?
- Should the app show a "maintenance mode" banner when the API is repeatedly unreachable?
