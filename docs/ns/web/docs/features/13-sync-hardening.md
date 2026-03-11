# 13 — Sync Hardening (SSE, Sort, & Sync Fixes)

**Status:** Complete
**Phase:** Reliability
**Priority:** High
**Completed:** v1.64.0

## Summary

Fixes SSE reconnection storms, hardens the sync push/pull pipeline, adds sort persistence and case-insensitive title sorting, and tightens the SSE hub's connection management. Changes span the web client, API server, shared types, and database schema.

---

## Phase 1: SSE Stability

### 1. Eliminate SSE reconnection storms

**File**: `packages/ns-web/src/pages/NotesPage.tsx`

The SSE `useEffect` captured callback functions (`loadNotes`, `loadFolders`, `loadFavoriteNotes`, `debouncedSearch`) in its closure. Every time sort order changed, a folder was selected, or the user typed in search, the dependency array triggered a teardown and reconnect cycle, causing rapid SSE disconnection/reconnection storms.

**Fix**:
- Introduced refs (`loadNotesRef`, `loadFoldersRef`, `loadFavoriteNotesRef`, `loadNoteTitlesRef`, `loadTrashRef`, `debouncedSearchRef`, `sidebarViewRef`) that are kept in sync via `useEffect`
- SSE `useEffect` dependency array changed from `[loadNotes, loadFolders, loadFavoriteNotes, debouncedSearch]` to `[]` -- connects once on mount, never tears down on sort/folder/search changes
- SSE handler now also refreshes note titles (`loadNoteTitlesRef`) and conditionally trash (`loadTrashRef`) when the trash view is active
- Fallback 120s poll also uses refs for stable callbacks

### 2. Pre-connect token refresh

**Files**: `packages/ns-web/src/api/sse.ts`, `packages/ns-web/src/api/client.ts`

If the JWT was about to expire when establishing an SSE connection, the EventSource would connect with a nearly-expired token and then fail shortly after.

**Fix**:
- `sse.ts`: Before connecting EventSource, decodes the JWT and checks if it expires within 60 seconds
- If expiring, proactively calls `refreshAccessToken()` before opening the connection
- `client.ts`: Added `refreshAccessToken()` export wrapping the existing `doRefresh()` function

---

## Phase 2: Sort Fixes

### 3. Sort persistence to localStorage

**File**: `packages/ns-web/src/pages/NotesPage.tsx`

Notes list sort (`sortBy`, `sortOrder`) was not persisted -- switching pages or refreshing the browser reset to defaults.

**Fix**:
- `sortBy` and `sortOrder` state initialized from localStorage keys `ns-sort-by` and `ns-sort-order`, matching the existing favorites sort persistence pattern
- Added `validateSortField()` and `validateSortOrder()` helpers that validate loaded values against allowed values, falling back to defaults on invalid data
- Both notes sort and favorites sort values validated on load

### 4. Case-insensitive title sort

**File**: `packages/ns-api/src/store/noteStore.ts`

Title sort used Prisma's `orderBy: { title: ... }` which is case-sensitive in PostgreSQL, causing "Zebra" to sort before "apple".

**Fix**:
- `listNotes()`: when `sortBy === "title"`, uses raw SQL `ORDER BY LOWER("title")` instead of Prisma `orderBy`
- `listFavoriteNotes()`: same raw SQL path for title sort
- Both use an explicit column list (`NOTE_COLUMNS` constant) instead of `SELECT *` to avoid issues with unsupported column types (e.g., `vector(512)` embedding column)
- Keyword search already used explicit column lists; this aligns the title sort paths

### 5. Default sort alignment

**File**: `packages/ns-api/src/store/noteStore.ts`

`listFavoriteNotes()` defaulted to `title`/`asc` sort, while the client defaults to `updatedAt`/`desc`.

**Fix**: Changed `listFavoriteNotes()` defaults to `updatedAt`/`desc` to match client expectations.

### 6. New note sort fix

**File**: `packages/ns-web/src/pages/NotesPage.tsx`

`handleCreate` prepended the newly created note with `[note, ...prev]` without re-sorting, so the new note always appeared at the top regardless of sort order.

**Fix**: `handleCreate` now calls `loadNotes()` after creating a note to ensure proper sort order.

---

## Phase 3: Sync Hardening

### 7. Atomic sync push with LWW tracking

**File**: `packages/ns-api/src/routes/sync.ts`

Sync push applied changes one at a time without a transaction, and LWW (last-write-wins) rejections were silently counted as applied.

**Fix**:
- Sync push wrapped in `prisma.$transaction()` for atomicity
- `applyNoteChange()` and `applyFolderChange()` now return `boolean` indicating whether the change was actually applied
- LWW rejection counted as `skipped` (not `applied`)
- Response now includes `{ applied, rejected, skipped }`

### 8. Pull cursor accuracy

**File**: `packages/ns-api/src/routes/sync.ts`

Pull cursor was set to `new Date()` at response time, which could skip changes that arrived between the query and the cursor update.

**Fix**: Pull cursor now uses `MAX(updatedAt)` from the returned data, ensuring no changes are missed between query execution and cursor assignment.

### 9. SyncPushResponse type update

**File**: `packages/ns-shared/src/types.ts`

**Fix**: Added `skipped: number` to the `SyncPushResponse` type to reflect the new LWW skip counting.

---

## Phase 4: SSE Hub & Infrastructure

### 10. Dead stream cleanup in SSE hub

**File**: `packages/ns-api/src/lib/sseHub.ts`

When `notify()` caught a write error on a dead stream, it left the connection in place to be cleaned up by the 60-second `sweepDead()` interval. During high-frequency events, dead connections accumulated.

**Fix**: `notify()` catch block now immediately calls `conn.stream.end()` and `conns.delete(conn)` to clean dead streams on first failure.

### 11. Per-user connection limit

**File**: `packages/ns-api/src/lib/sseHub.ts`

No limit on concurrent SSE connections per user. Multiple browser tabs or reconnection bugs could accumulate unbounded connections.

**Fix**: Added `MAX_CONNECTIONS_PER_USER = 5` constant. `addConnection()` evicts the oldest connection when the limit is reached.

### 12. Database indexes for updatedAt

**Files**: `packages/ns-api/prisma/schema.prisma`, `packages/ns-api/prisma/migrations/20260311000001_add_updated_at_indexes/`

Sync pull queries filter and sort by `updatedAt` but had no index, causing sequential scans.

**Fix**: Added `@@index([updatedAt])` on both `Note` and `Folder` models.

### 13. Stale sync cursor cleanup

**File**: `packages/ns-api/src/store/syncStore.ts`

The `SyncCursor` table grows unboundedly as users sync over time.

**Fix**: Added `cleanupStaleCursors(days = 90)` function to delete cursors older than the specified threshold.

### 14. Search SQL column alignment

**File**: `packages/ns-api/src/store/noteStore.ts`

`keywordSearch`, `semanticSearch`, and `hybridSearch` SELECT lists were missing `"favoriteSortOrder"` and `"folderId"` columns.

**Fix**: Added both columns to all three search function SELECT lists.

---

## Files Changed

| File | Action |
|------|--------|
| `packages/ns-web/src/pages/NotesPage.tsx` | Modified -- SSE refs, sort persistence, handleCreate re-sort |
| `packages/ns-web/src/api/sse.ts` | Modified -- pre-connect JWT expiry check |
| `packages/ns-web/src/api/client.ts` | Modified -- `refreshAccessToken()` export |
| `packages/ns-api/src/routes/sync.ts` | Modified -- transaction, LWW return boolean, cursor fix |
| `packages/ns-api/src/lib/sseHub.ts` | Modified -- dead stream cleanup in notify, connection limit |
| `packages/ns-api/prisma/schema.prisma` | Modified -- `@@index([updatedAt])` on Note and Folder |
| `packages/ns-api/prisma/migrations/20260311000001_add_updated_at_indexes/migration.sql` | Created |
| `packages/ns-api/src/store/noteStore.ts` | Modified -- case-insensitive title sort, default sort, search columns, `NOTE_COLUMNS` constant |
| `packages/ns-api/src/store/syncStore.ts` | Modified -- `cleanupStaleCursors()` function |
| `packages/ns-shared/src/types.ts` | Modified -- `skipped` in SyncPushResponse |

## Tests

| Test file | Changes |
|-----------|---------|
| `sync.test.ts` | LWW rejection expects `skipped: 1`, all push tests check `skipped` field |
| `sseHub.test.ts` | +1 test: connection limit eviction; +1 test: dead stream cleanup in notify |
| `notes.test.ts` | Title sort test mocks `$queryRawUnsafe` for raw SQL path |
| `noteStore.test.ts` | Raw SQL title sort path test |

## Dependencies

- [01 -- Auth](01-auth.md) -- token refresh for SSE pre-connect check
- [02 -- Note Management](02-note-management.md) -- note CRUD, sort, and listing
- [03 -- Search & Organization](03-search-and-organization.md) -- search SQL column lists
- [09 -- Favorites](09-favorites.md) -- favorite sort persistence pattern, `listFavoriteNotes` defaults
- [11 -- Architecture Hardening](11-architecture-hardening.md) -- builds on prior reliability work
