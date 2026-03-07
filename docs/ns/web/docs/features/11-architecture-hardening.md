# 11 — Architecture Hardening (Data Safety & Security)

**Status:** Complete
**Phase:** Architecture Review
**Priority:** High
**Completed:** v1.53.0

## Summary

Six high-priority fixes from the NoteSync architecture review (see [ARCHITECTURE-REVIEW.md](../ARCHITECTURE-REVIEW.md)), addressing silent data loss risks and security hardening across the web app, API, and offline cache.

---

## Phase 1: Data Safety

### 1. Fix silent data loss on note switch

**File**: `packages/ns-web/src/pages/NotesPage.tsx`

The `selectNote()` function performed a fire-and-forget save with `.catch(() => {})`. If the save failed, the user lost their changes silently.

**Fix**: Shows an error toast via the existing `showError()` function when the background save fails.

### 2. Offline queue retry for transient errors

**Files**: `packages/ns-web/src/lib/db.ts`, `packages/ns-web/src/lib/offlineQueue.ts`, `packages/ns-web/src/hooks/useOfflineCache.ts`

The `flushQueue()` catch block silently skipped ALL failed entries with no distinction between transient and permanent errors.

**Fix**:
- Added `retryCount?: number` to `OfflineQueueEntry` interface in `db.ts`
- Added `requeue()` function to `offlineQueue.ts` that re-enqueues entries
- Updated `useOfflineCache.ts` flush logic:
  - **Transient errors** (5xx status codes, network failures): re-enqueue with incremented `retryCount` and break the processing loop (server is unhealthy)
  - **Permanent errors** (4xx status codes): log warning and skip
  - Max 3 retries per entry — after that, skip and log warning

### 3. Log fire-and-forget errors

**File**: `packages/ns-api/src/store/noteStore.ts`

Four `.catch(() => {})` calls on `syncNoteLinks` and `captureVersion` in `createNote()` and `updateNote()` silently swallowed errors.

**Fix**: Replaced all four with `console.error` logging so failures are visible in server logs.

---

## Phase 2: Security Hardening

### 4. Refresh token reuse detection

**Files**: `packages/ns-api/prisma/schema.prisma`, `packages/ns-api/src/store/refreshTokenStore.ts`, `packages/ns-api/src/routes/auth.ts`

Refresh tokens were hard-deleted on revocation, making it impossible to detect stolen token reuse.

**Fix**:
- Added `revoked Boolean @default(false)` to RefreshToken model
- `revokeRefreshToken()` now sets `revoked = true` instead of deleting (soft-delete)
- `lookupRefreshToken()` returns `{ userId, revoked: true }` for revoked tokens
- `/auth/refresh` handler: if `stored.revoked` is true, logs a warning and calls `revokeAllRefreshTokens(userId)` to invalidate the entire token family, then returns 401
- `cleanupExpiredTokens()` still hard-deletes expired tokens for cleanup
- Migration: `20260309000000_add_refresh_token_revoked` — `ALTER TABLE "refresh_tokens" ADD COLUMN "revoked" BOOLEAN NOT NULL DEFAULT false`

### 5. CSRF defense-in-depth on refresh endpoint

**Files**: `packages/ns-web/src/api/client.ts`, `packages/ns-api/src/routes/auth.ts`

The `/auth/refresh` endpoint used httpOnly cookies but had no defense-in-depth against CSRF attacks.

**Fix**:
- **Client**: Added `X-Requested-With: XMLHttpRequest` header to the refresh fetch call in `doRefresh()`
- **Server**: `/auth/refresh` handler checks for `x-requested-with` header at the top; returns 403 with "Missing required header" if absent

### 6. Audio upload MIME validation via magic bytes

**File**: `packages/ns-api/src/routes/ai.ts`

The `/ai/transcribe` endpoint only checked the client-declared MIME type, allowing non-audio files to be sent to Whisper.

**Fix**: Added `validateAudioMagicBytes(buffer, mimetype)` helper that checks file content magic bytes:
- **WebM**: `0x1A 0x45 0xDF 0xA3` (EBML header)
- **MP4**: "ftyp" at offset 4
- **MP3**: ID3 tag (`0x49 0x44 0x33`) or MPEG sync word (`0xFF` with `0xE0` mask)
- **WAV**: "RIFF" at offset 0 + "WAVE" at offset 8
- **OGG**: "OggS" at offset 0

Returns 400 with "File content does not match declared audio type" on mismatch.

---

## Files Changed

| File | Action |
|------|--------|
| `packages/ns-web/src/pages/NotesPage.tsx` | Modified — error toast on note switch save failure |
| `packages/ns-web/src/lib/db.ts` | Modified — added `retryCount` to OfflineQueueEntry |
| `packages/ns-web/src/lib/offlineQueue.ts` | Modified — added `requeue()` function |
| `packages/ns-web/src/hooks/useOfflineCache.ts` | Modified — transient retry logic with break, permanent skip |
| `packages/ns-web/src/api/client.ts` | Modified — X-Requested-With header on refresh |
| `packages/ns-api/src/store/noteStore.ts` | Modified — console.error on fire-and-forget |
| `packages/ns-api/prisma/schema.prisma` | Modified — `revoked` field on RefreshToken |
| `packages/ns-api/src/store/refreshTokenStore.ts` | Modified — soft-delete, reuse detection return type |
| `packages/ns-api/src/routes/auth.ts` | Modified — token reuse handling, CSRF header check |
| `packages/ns-api/src/routes/ai.ts` | Modified — validateAudioMagicBytes helper + validation call |
| `packages/ns-api/prisma/migrations/20260309000000_add_refresh_token_revoked/migration.sql` | Created |

## Tests

| Test file | Changes |
|-----------|---------|
| `offlineQueue.test.ts` | +1 test: requeue preserves retryCount |
| `useOfflineCache.test.ts` | Replaced 1 test with 2: transient errors requeue+break, permanent errors skip+continue |
| `auth.test.ts` | +2 tests: 403 without X-Requested-With, 401 on token reuse with session revocation; existing refresh tests updated with header |
| `aiRoutes.test.ts` | +1 test: magic byte validation failure; existing transcribe tests updated with WebM magic bytes |

## Dependencies

- [01 — Auth](01-auth.md) — refresh token changes
- [05 — Offline Cache](05-offline-cache.md) — queue retry logic
- [04 — AI Features](04-ai-features.md) — audio magic byte validation
- [10 — Multi-User Auth](10-multi-user-auth.md) — token reuse detection builds on multi-user refresh tokens
