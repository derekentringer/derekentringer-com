# Phase 4 — Housekeeping

**Status**: ✅ Complete (commits `c2b183e`…`d07a7d3` on `develop-sync-arch-hardening`)

## Goal

Small independent changes that reduce future regression risk: add the composite indexes the pull query needs, fix known code/comment drift, and document the hardened invariants so future changes don't silently erode them.

## Items

### 4.1 — Composite indexes

**Location**: `packages/ns-api/prisma/schema.prisma`

Today: `notes.@@index([userId])` and `notes.@@index([updatedAt])` (lines 88, 94) — separate indexes. The pull query filters `userId` AND ranges on `updatedAt`; Postgres will use one or the other, not both efficiently.

**Change**:

```prisma
@@index([userId, updatedAt])   // on Note, Folder, Image
```

Keep the single-column `@@index([updatedAt])` only if other queries need it (they don't currently). The composite covers both.

Rolls out via a Prisma migration. Safe to deploy independently — no app code changes required.

**Impact**: Not strictly hardening, but slow queries under load manifest as sync timeouts that present as intermittent failures. High leverage per minute of effort.

### 4.2 — Fix `DIR_RECONCILE_INTERVAL_MS` comment drift

**Location**: `packages/ns-desktop/src/lib/localFileService.ts:380`

Comment says "5s"; value is 10000 (10s). Update comment to match.

### 4.3 — Sync invariants doc

**Location**: new file `docs/ns/sync-arch/invariants.md` (or `packages/ns-api/src/routes/sync-invariants.md` co-located with code — pick one)

After Phases 1–3 land, document the hardened invariants in one place so future contributors can reason about changes without archaeology. Cover at minimum:

- **LWW tie-break**: `(timestamp, deviceId, seq)` ordering; server-stamped timestamps on write
- **Managed-locally flag semantics**: set by desktop, read by server + web; hard-delete branching; backfill rules; lifecycle on unmanage
- **Referential-deferral contract**: which tables can hold orphan refs (`notes.folder_id`, `images.note_id`); deferral behavior; retry / expiry
- **Delete matrix**: hard vs. soft for each entity × each origin (REST / sync / file-watcher-triggered)
- **Cursor pagination**: `(updatedAt, id)` keyset; per-type safe-advance; `hasMore` semantics
- **SSE notify rules**: originator excluded
- **FK-less tables**: which columns come from sync payloads; why they can't have FKs; which derived tables still do

### 4.4 — CLAUDE.md pointer

Add a short link in project root `CLAUDE.md` under the NoteSync section pointing to `docs/ns/sync-arch/README.md` so future assistants load this context.

### 4.5 — Tombstone sweep

Phase 1.5 introduced `EntityTombstone` rows for every hard-deleted folder and every `isLocalFile` note. Tombstones accumulate until every device has had a chance to observe them on `/sync/pull`.

**Sweep strategy (option a — deterministic, self-cleaning)**:

Run periodically (daily cron or on-demand from an admin endpoint):

```sql
DELETE FROM entity_tombstones t
WHERE NOT EXISTS (
  SELECT 1 FROM sync_cursors c
  WHERE c.userId = t.userId
    AND c.lastSyncedAt <= t.deletedAt
);
```

A tombstone is safe to drop only once every active `sync_cursor` row for the user has advanced past `deletedAt`. Stale cursors (device uninstalled, browser localStorage cleared) block the sweep; the existing `cleanupStaleCursors(days = 90)` handles that by deleting cursors that haven't been updated in 90 days. The sweep should run AFTER `cleanupStaleCursors` so expired cursors don't hold tombstones forever.

**Implementation shape**:

- New `sweepTombstones()` helper in `packages/ns-api/src/store/syncStore.ts`.
- Cron-style trigger: either a scheduled Railway task or an admin-only route `POST /admin/maintenance/sweep-tombstones` that admins can invoke.
- Log the count of rows removed per sweep; alert if a single sweep removes >10k rows (unexpected accumulation signals a bug).

## Edge cases covered

None new — this phase documents and indexes, doesn't fix bugs.

## Done criteria

- Composite indexes deployed; verify pull latency on prod data (EXPLAIN plan should show index scan)
- Comment fixed
- Invariants doc committed and linked from `README.md`
- `CLAUDE.md` updated

## Out of scope

- Code cleanup unrelated to sync (separate effort)
- Schema optimizations beyond the one composite index (perf phase)

## Dependencies

Composite indexes: none.
Invariants doc: ideally after Phases 1–3 land so it reflects final state.
