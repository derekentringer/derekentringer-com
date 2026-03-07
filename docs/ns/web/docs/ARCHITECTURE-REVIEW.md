# NoteSync Architecture Review & Refactoring Plan

**Date**: 2026-03-06
**Severity Summary**: 0 critical, 3 high, 12 medium, 4 low

---

## Phase 1: Data Safety (High Priority) — COMPLETE (v1.53.0)

These fix silent data loss risks — the most impactful issues for a note-taking app.

### 1. Fix silent data loss on note switch (Finding #19) — DONE
- `.catch(() => {})` on `selectNote()` replaced with `showError()` toast so users see when background save fails

### 2. Offline queue retry for transient errors (Finding #23) — DONE
- Added `retryCount` to `OfflineQueueEntry` interface
- Added `requeue()` function to offline queue
- `flushQueue()` now distinguishes transient (5xx, network) vs permanent (4xx) errors
- Transient errors re-enqueue with incremented retry count (max 3) and break the loop
- Permanent errors log a warning and skip

### 3. Log fire-and-forget errors (Finding #20) — DONE
- All 4 `.catch(() => {})` calls on `syncNoteLinks` and `captureVersion` in `noteStore.ts` replaced with `console.error` logging

---

## Phase 2: Security Hardening (High Priority) — COMPLETE (v1.53.0)

### 4. Refresh token reuse detection (Finding #1) — DONE
- Added `revoked Boolean @default(false)` to RefreshToken model
- `revokeRefreshToken()` now soft-deletes (sets `revoked = true`) instead of hard-deleting
- `lookupRefreshToken()` returns `{ revoked: true }` for revoked tokens
- `/auth/refresh` handler detects revoked tokens and revokes ALL user sessions (stolen token family invalidation)
- Migration: `20260309000000_add_refresh_token_revoked`

### 5. CSRF defense-in-depth on refresh endpoint (Finding #2) — DONE
- `/auth/refresh` requires `X-Requested-With` header, returns 403 if missing
- `client.ts` sends `X-Requested-With: XMLHttpRequest` on refresh calls

### 6. Audio upload MIME validation (Finding #6) — DONE
- Added `validateAudioMagicBytes()` helper supporting WebM, MP4, MP3, WAV, OGG
- Validates magic bytes after MIME type check, returns 400 if bytes don't match declared type

---

## Phase 3: Performance & Correctness (Medium Priority)

### 7. Fix semanticSearch count mismatch (Finding #12/#24)
- Apply similarity threshold to the count query so pagination totals are accurate

### 8. Optimize tag operations (Finding #8)
- Use JSONB containment queries instead of loading all notes into memory
- Batch updates with raw SQL instead of N individual updates

### 9. Add GIN index on `tags` column (Finding #16)
- `CREATE INDEX idx_notes_tags ON notes USING GIN (tags)`
- Verify `search_vector` GIN index and `embedding` vector index exist (Finding #17)

### 10. Cache version interval setting (Finding #10)
- In-memory cache with TTL for `versionIntervalMinutes` to avoid a DB read on every save

---

## Phase 4: Code Quality (Medium Priority)

### 11. Extract NotesPage state into custom hooks (Finding #18)
- `useNoteEditor()` — title, content, isDirty, isSaving, save logic
- `useNoteList()` — notes, search, sort, pagination, folder filter
- `useTrash()` — trash notes, bulk operations
- `useFolderState()` — folder tree, active folder
- `useEditorTabs()` — openTabs, previewTabId, tab handlers (added in v1.54.0, increases extraction priority)

### 12. Fix createNote sort order race condition (Finding #21)
- Use a single INSERT with subquery for atomic sort order assignment

### 13. Paginate or search-filter `listNoteTitles` (Finding #9)
- Add `?q=` search param with a limit for wiki-link autocomplete

---

## Phase 5: Nice-to-haves (Low Priority)

### 14. Add dedicated `/notes/count` endpoint (Finding #22)

### 15. Optimize offline queue polling (Finding #11)

### 16. Batch reorder operations with raw SQL (Finding #15)

### 17. Add embedding processor concurrency guard (Finding #14)

---

## Not Addressed (Acceptable as-is)

- **Access token in memory** (Finding #3) — standard SPA tradeoff, already mitigated by short TTL + httpOnly refresh cookie + strict CSP
- **Prompt injection** (Finding #4) — single-user app, user would inject against themselves
- **SQL parameterization** (Finding #5) — already correctly done throughout
- **Hardcoded admin ID** (Finding #7) — fine for single-user app
