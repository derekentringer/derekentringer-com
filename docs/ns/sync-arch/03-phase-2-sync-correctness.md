# Phase 2 — Cross-Platform Sync Correctness

**Status**: ✅ Complete (commits `c527f6d`…`f0ed4b7` on `develop-sync-arch-hardening`)

## Goal

Fix three real bugs in the `/sync/push` and `/sync/pull` protocol that can silently lose or misapply data. These are rare but realistic conditions: constraint violations mid-batch, ties on `updatedAt`, and client clock skew.

## Why this matters

All three are silent failures. Users don't see errors — data just doesn't converge. The bugs are hidden behind the mock-based test suite, which is why Phase 0 is a prerequisite.

## Items

### 2.1 — Push transaction abort cascade

**Location**: `packages/ns-api/src/routes/sync.ts:84-145`

**Problem**: The entire batch is wrapped in a single `prisma.$transaction(async (tx) => { ... })`. Inside the loop, each change is wrapped in try/catch. When Postgres raises a constraint violation (FK, unique), the underlying connection enters `in_failed_sql_transaction` state. Every subsequent statement in the same tx fails with `25P02` until `ROLLBACK`. The catch block swallows those cascade errors and marks them as `rejected`, producing a misleading rejection reason and silently dropping the other 49 otherwise-valid changes in the same batch.

**Fix options** (pick one):

1. **Per-change transaction** — drop the outer `$transaction`; run each change in its own tx. Simpler. Loses atomic-batch semantics, which no client currently depends on.
2. **SAVEPOINT per iteration** — keep the outer tx; issue `SAVEPOINT s_i` before each change, `RELEASE` on success, `ROLLBACK TO` on caught error. Preserves batch atomicity.

Recommend option 1 unless we have a specific need for all-or-nothing.

**Verification**: Phase 0 test — craft a batch where change[5] violates a unique constraint; assert changes 0–4 and 6–N all applied.

### 2.2 — Pull cursor keyset pagination

**Location**: `packages/ns-api/src/routes/sync.ts:255-274` and `packages/ns-api/src/store/syncStore.ts`

**Problem**: The pull query uses `updatedAt > cursor` with `ORDER BY updatedAt ASC`. Rows sharing an `updatedAt` value can straddle `BATCH_LIMIT=100`. First pull returns rows 1–100 with max `updatedAt = T`. Cursor set to `T`. Second pull's predicate `> T` skips any additional rows also at `updatedAt = T`. Permanent skip.

**Fix**:

- Order by `(updatedAt ASC, id ASC)` — composite ordering
- Cursor is a tuple: `{ lastSyncedAt: T, lastId: "..." }`
- Predicate: `(updatedAt > T) OR (updatedAt = T AND id > lastId)`
- Extend `SyncCursor` Prisma model with `lastId String?` (nullable for backward compat)
- Extend wire type `SyncCursor` with `lastId?: string`

Apply consistently to `getNotesChangedSince`, `getFoldersChangedSince`, `getImagesChangedSince`.

**Verification**: Phase 0 test — insert 150 rows with identical `updatedAt`; assert all 150 are pulled across two batches with no skips.

### 2.3 — Server-authoritative LWW (clock skew)

**Location**: `packages/ns-api/src/routes/sync.ts` (`applyNoteChange`, `applyFolderChange`, `applyImageChange`)

**Problem**: LWW compared `change.timestamp` (client-supplied wall-clock) to `existing.updatedAt` (server wall-clock). A slow-clock client's causally-later writes got silently rejected as `timestamp_conflict` and lost.

**Fix (shipped)**: Remove the client-timestamp gate entirely. Prisma `@updatedAt` stamps on write, so LWW is now decided by server-side arrival order rather than untrusted client clocks. The `force` flag is retained — it still serves the FK-retry path on constraint violations.

**Tradeoff**: A queued stale retry that flushes after weeks of other edits on other devices will overwrite newer server state. The prior behavior silently dropped slow-clock clients' valid writes — which is worse for users and harder to surface than an occasional stale overwrite (which the existing rejection/force-push UX can mediate). A future iteration can add per-device Lamport `(deviceId, seq)` tie-breaks and server-returned `appliedTimestamps` for client adoption.

**Verification**: `phase2-reference.test.ts` 2.3 — device B with a 1h slow clock pushes an update; server applies it. (Formerly `it.fails`.)

## Edge cases covered

- FK violation in the middle of a 50-change batch → other 49 changes still apply
- 150 rows with identical `updatedAt` → all 150 pulled, no skip
- Retry after network drop → same `change.id` arrives twice → idempotent upsert (already correct; add assertion test)
- Clock-skewed device edits same note as a correct-clock device → server arbitrates, neither silently loses

## Done criteria

- All three Phase 0 reference tests (`tx_abort.test.ts`, `cursor_ties.test.ts`, `clock_skew.test.ts`) now pass
- No regression in existing sync tests
- `SyncCursor` and `SyncPushResponse` wire changes rolled out to desktop + mobile clients

## Out of scope

- Operational CRDTs or full CRDT reconciliation (overkill for this use case)
- Vector clocks (Lamport-style `deviceId + seq` is sufficient)
- Changing REST note endpoints — this phase only touches `/sync/*`

## Dependencies

Phase 0 test harness must be in place to verify correctness.
