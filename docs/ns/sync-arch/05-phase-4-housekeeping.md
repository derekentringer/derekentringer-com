# Phase 4 — Housekeeping

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
