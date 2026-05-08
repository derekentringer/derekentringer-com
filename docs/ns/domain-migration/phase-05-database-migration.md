# Phase 5 — Database Migration

**Status**: 🟡 Not started
**Depends on**: Phase 0 D.4 (carry-over decision), Phase 1 (new Postgres provisioned)
**Blocks**: Phase 6 (api needs DB to validate against), Phase 9 (cutover)
**Goal**: move every byte of production user data from the old Railway Postgres (under `derekentringer` Railway account, attached to current `ns-api`) to the new Railway Postgres (attached to the new Notate `api` service), with a verified-restore checkpoint and a final-cutover plan that minimizes write loss.

This phase is the highest-risk piece of the migration. Plan it carefully.

## Pre-migration

### Schema parity check

- [ ] Both old and new Postgres run the same Prisma schema version. Migrations must be in sync before the dump.
- [ ] Run `prisma migrate deploy` against both databases to confirm.
- [ ] Take a production backup *before any migration steps* — Railway's Postgres plugin keeps automated backups, but a manual `pg_dump` to S3 / local is cheap insurance.

### pgvector + extensions

- [ ] The NS Postgres uses `pgvector` for embeddings. Confirm the new Railway Postgres has pgvector available (Railway's Postgres plugin supports it on most plans).
- [ ] Any other extensions in use (`pg_trgm` for tsvector?) need to exist on the new instance before restore.

## Migration approach options

### Option A — Single-shot dump-and-restore

The simplest path: scheduled downtime window, freeze writes on the old API, dump + restore, swap DNS.

- [ ] Choose a downtime window (e.g., Sunday morning, 1–2 hours)
- [ ] Announce to users via in-app banner + email 48h prior
- [ ] Read-only mode: temporarily set the old `ns-api` to a read-only Postgres role (or just disable POST/PATCH/DELETE routes via a feature flag)
- [ ] `pg_dump` from old DB → SQL file (or `pg_dump | pg_restore` direct pipe)
- [ ] `pg_restore` into new DB
- [ ] Verify row counts match across all tables
- [ ] Run a sample-row diff on Note / User / Image / NoteVersion / TranscriptionJob tables
- [ ] DNS flip happens in Phase 9

**Pros**: simple, predictable, easy to verify.
**Cons**: requires downtime; users can't read or write during the window.

### Option B — Logical replication

Set up streaming replication from old → new, run them in lockstep, flip writes over with near-zero downtime.

- [ ] Configure `pglogical` or native logical replication on the old DB as publisher
- [ ] Subscribe the new DB
- [ ] Replication catches up
- [ ] At cutover: pause writes on old, wait for replication to drain, swap DNS, point new app at new DB

**Pros**: minimal downtime (seconds, not hours)
**Cons**: significantly more complex; Railway Postgres may not allow `wal_level=logical` modifications without support intervention; failure modes during cutover are subtle.

### Recommendation

**Option A** for first attempt. Notate's user base is small; a 1-hour Sunday-morning window is acceptable. Reserve Option B for a future scale where downtime cost > complexity cost.

## Tasks (assuming Option A)

### A. Pre-cutover dry run

A week or two before the real cutover:

- [ ] Take a production `pg_dump` from old DB
- [ ] Restore it into the new Railway Postgres
- [ ] Deploy the new `api` service against this restored DB (Phase 6 work — overlaps with this phase)
- [ ] Smoke-test reads against `staging.notate.md`: log in with a test user, list notes, sync, image fetch
- [ ] Capture any restore-time errors (FK violations, missing extensions, encoding issues)
- [ ] Resolve any issues before the real run

### B. Real cutover (this is the bulk of Phase 9 too)

Order of operations during the cutover window:

- [ ] Announce downtime start
- [ ] Set old `ns-api` to read-only mode (env flag or middleware)
- [ ] Wait 60s for in-flight writes to drain
- [ ] `pg_dump --format=custom --no-owner --no-acl old_db > final.dump`
- [ ] `pg_restore --no-owner --no-acl --dbname=new_db final.dump`
- [ ] Compare row counts between old and new across every table
- [ ] Compare last-write timestamps on representative tables (Note.updatedAt, RefreshToken.createdAt) — they should match exactly
- [ ] If counts and timestamps match: proceed to Phase 7 DNS flip
- [ ] If they don't match: roll back (re-enable writes on old, abort cutover)

### C. Sequence + auto-increment hygiene

Postgres sequences need bumping post-restore:

- [ ] After `pg_restore`, run `SELECT setval(...)` for every sequence so the new DB doesn't try to create rows with already-used IDs
- [ ] Most ORM-generated tables use UUIDs (no sequences) but check `_prisma_migrations` and any explicit serial columns

### D. R2 image migration

The R2 image bucket (`notesync-images`) holds every uploaded image referenced by markdown URLs in the Note content. Per Phase 1, copy strategy:

- [ ] `aws s3 sync s3://notesync-images s3://notate-images` (using R2's S3-compatible API)
- [ ] Verify object count + total bytes match
- [ ] **Update markdown content** — every `![](https://notesync-images.derekentringer.com/...)` in user notes still points to the old domain
- [ ] Two ways to handle the URL update:
  1. **301 redirect** old domain to new domain via Cloudflare — markdown stays as-is; old URLs forward forever
  2. **Database rewrite** — UPDATE Notes SET content = REPLACE(content, 'notesync-images.derekentringer.com', 'images.notate.md')

> **Recommendation**: do *both*. Database rewrite cleans up new content; 301 redirect catches the long tail of cached HTML, search engines, and any missed references.

## Verification gates

- [ ] Row count parity for every table (old vs new)
- [ ] Sample 10 random users — their note list, folder tree, tags match exactly between old and new
- [ ] Sync cursors are present (otherwise next sync will full-scan)
- [ ] R2 bucket parity: `aws s3 ls --recursive` count match
- [ ] No image URL in any Note content references the old domain (after rewrite + redirect both apply)

## Rollback plan

If verification fails during the cutover window:

- [ ] Re-enable writes on old `ns-api`
- [ ] Take the new Railway Postgres offline (don't accept new writes)
- [ ] Investigate root cause without time pressure
- [ ] Schedule a second cutover attempt

The old DB stays untouched during the cutover (we only read from it for the dump). Rollback is just "don't flip DNS, fix the new env, try again."

## Done criteria

- [ ] Dry run completes without errors
- [ ] Real cutover row counts match
- [ ] R2 buckets in sync
- [ ] Image URLs rewritten in Note content
- [ ] Phase 7 DNS flip is unblocked
