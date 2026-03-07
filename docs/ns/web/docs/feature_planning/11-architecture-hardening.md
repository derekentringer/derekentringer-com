# 11 — Architecture Hardening (Data Safety & Security)

**Status:** Complete
**Phase:** Architecture Review
**Priority:** High
**Completed:** v1.53.0

## Summary

Six high-priority fixes from the NoteSync architecture review, addressing silent data loss risks and security hardening across the web app, API, and offline cache.

## Fixes

### Phase 1: Data Safety

1. **Fix silent data loss on note switch** — Show error toast when background save fails during note switch instead of silently swallowing errors
2. **Offline queue retry for transient errors** — Distinguish transient (5xx/network) from permanent (4xx) errors; re-enqueue transient failures with retry count (max 3); break processing loop on transient errors
3. **Log fire-and-forget errors** — Replace `.catch(() => {})` on `syncNoteLinks` and `captureVersion` with `console.error` logging

### Phase 2: Security Hardening

4. **Refresh token reuse detection** — Soft-delete tokens on revoke; detect reuse of revoked tokens and revoke ALL user sessions (stolen token family invalidation)
5. **CSRF defense-in-depth on refresh endpoint** — Require `X-Requested-With` header on `/auth/refresh`
6. **Audio upload MIME validation via magic bytes** — Validate file content magic bytes (WebM, MP4, MP3, WAV, OGG) in addition to client-declared MIME type

## Files Changed

| File | Action |
|------|--------|
| `packages/ns-web/src/pages/NotesPage.tsx` | Modified — error toast on note switch save failure |
| `packages/ns-web/src/lib/db.ts` | Modified — added `retryCount` to OfflineQueueEntry |
| `packages/ns-web/src/lib/offlineQueue.ts` | Modified — added `requeue()` function |
| `packages/ns-web/src/hooks/useOfflineCache.ts` | Modified — retry transient errors, skip permanent |
| `packages/ns-web/src/api/client.ts` | Modified — added X-Requested-With header to refresh |
| `packages/ns-api/src/store/noteStore.ts` | Modified — console.error on fire-and-forget errors |
| `packages/ns-api/prisma/schema.prisma` | Modified — added `revoked` field to RefreshToken |
| `packages/ns-api/src/store/refreshTokenStore.ts` | Modified — soft-delete, reuse detection |
| `packages/ns-api/src/routes/auth.ts` | Modified — token reuse handling, CSRF header check |
| `packages/ns-api/src/routes/ai.ts` | Modified — magic byte validation |
| `packages/ns-api/prisma/migrations/20260309000000_add_refresh_token_revoked/` | Created |

## Tests Updated

- `offlineQueue.test.ts` — added requeue test
- `useOfflineCache.test.ts` — split into transient (requeue+break) and permanent (skip+continue) tests
- `auth.test.ts` — added CSRF header tests, token reuse detection test
- `aiRoutes.test.ts` — updated transcribe tests with magic bytes, added validation failure test
