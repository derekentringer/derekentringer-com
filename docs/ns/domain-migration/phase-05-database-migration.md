# Phase 5 — Database Migration

**Status**: 🟢 Prep in progress (Path A — single-shot dump+restore, ~5 min self-imposed write freeze, no user comms; cutover executes during Phase 9 after Phase 6 deploys the new api)
**Depends on**: Phase 0 D.4 (carry-over decision), Phase 1 (new Postgres provisioned)
**Blocks**: Phase 6 (api needs DB to validate against), Phase 9 (cutover)
**Goal**: move every byte of production user data from the old Railway Postgres (under `derekentringer` Railway account, attached to current `ns-api`) to the new Railway Postgres (attached to the new Notate `api` service), with a verified-restore checkpoint and a final-cutover plan that minimizes write loss.

This phase is the highest-risk piece of the migration. Plan it carefully.

## Pre-migration

### Schema parity check (executed during Phase 5 prep)

- [ ] Apply all migrations to the new (empty) Railway Postgres using `prisma migrate deploy` from `packages/api/` in the notate clone — schema state matches old prod at cutover time
- [ ] Take a production backup just before the real cutover — Railway Postgres has automated backups, but a manual `pg_dump` is cheap insurance

### pgvector + extensions

- [ ] Confirm `pgvector` extension is available on the new Railway Postgres (`CREATE EXTENSION IF NOT EXISTS vector;` runs as part of migration 20260304000000_add_embeddings if not already present)
- [ ] `unaccent` may also be needed for FTS — verify after schema parity

## Migration approach options

### Option A — Single-shot dump-and-restore

**Selected** for execution. Single user (developer), no public coordination needed, so the "downtime window" reduces to a ~5-minute self-imposed write freeze. DB is ~1.13 GB (Phase 0 § I.5) so dump + restore finishes in minutes, not hours.

- [ ] Pick a quiet evening to do the cutover (no calendar event needed; the freeze is just "stop writing for 5 min")
- [ ] Stop writing to the old api manually — close the running clients (desktop, web, mobile) before starting the dump so nothing in-flight competes with the snapshot
- [ ] `pg_dump --format=custom --no-owner --no-acl <old-railway-url> > final.dump`
- [ ] `pg_restore --no-owner --no-acl --dbname=<new-railway-url> final.dump`
- [ ] Run the URL rewrite SQL from § D
- [ ] Verify row counts match across all tables
- [ ] DNS flip happens in Phase 9

### Option B — Logical replication

Considered and rejected. Notate has a single user (developer); a 5-minute write freeze is acceptable, so the complexity of streaming replication isn't justified.

## Tasks (assuming Option A)

### A. Pre-cutover dry run (after Phase 6 deploys the new api)

Before the real cutover, validate the procedure on a non-final dataset:

- [ ] Take a fresh `pg_dump` from old prod DB
- [ ] Restore into the new Railway Postgres (already has schema from prep; restore will overwrite tables — that's fine for the dry run)
- [ ] Smoke-test the deployed new api against this dataset: log in, list notes, image fetch, sync round-trip from one client
- [ ] Capture any restore-time errors (FK violations, missing extensions, encoding issues) and resolve before the real run
- [ ] The dry-run data gets clobbered by the real cutover later, so no need to preserve it

### B. Real cutover (executes during Phase 9)

Order of operations during the cutover window:

- [ ] Close all running clients (desktop, web, mobile) so no in-flight writes compete with the dump
- [ ] `pg_dump --format=custom --no-owner --no-acl <old-railway-url> > final.dump`
- [ ] `pg_restore --no-owner --no-acl --dbname=<new-railway-url> final.dump`
- [ ] Run § D URL rewrite SQL against the new DB
- [ ] Compare row counts across every table (old vs new) — they should match exactly
- [ ] Compare `MAX(updatedAt)` on representative tables (`notes`, `folders`, `images`, `refresh_tokens`) — should match
- [ ] If counts and timestamps match: proceed to Phase 7 DNS flip
- [ ] If they don't match: roll back (don't flip DNS, investigate, re-attempt)

### C. Sequence + auto-increment hygiene

Postgres sequences need bumping post-restore:

- [ ] After `pg_restore`, run `SELECT setval(...)` for every sequence so the new DB doesn't try to create rows with already-used IDs
- [ ] Most ORM-generated tables use UUIDs (no sequences) but check `_prisma_migrations` and any explicit serial columns

### D. R2 image migration

The R2 image bucket (`notesync-images`) holds every uploaded image referenced by markdown URLs in the Note content. Per Phase 1, copy strategy:

- [ ] `aws s3 sync s3://notesync-images s3://notate-images` (using R2's S3-compatible API; ~16 MB per Phase 0 § I.5, completes in seconds)
- [ ] Verify object count + total bytes match between buckets
- [ ] **Database URL rewrite** — old image URLs reference `notesync-images.derekentringer.com`; the new bucket is served from `img.notate.md`. Two tables need updating:

  ```sql
  -- Markdown bodies with embedded image references
  UPDATE notes
    SET content = REPLACE(content, 'notesync-images.derekentringer.com', 'img.notate.md')
    WHERE content LIKE '%notesync-images.derekentringer.com%';

  -- Canonical image record URLs (Image.r2Url field)
  UPDATE images
    SET "r2Url" = REPLACE("r2Url", 'notesync-images.derekentringer.com', 'img.notate.md')
    WHERE "r2Url" LIKE '%notesync-images.derekentringer.com%';
  ```

- [ ] Run on the *new* Postgres after the dump+restore in § A/B — operating on the migrated copy avoids mutating the old prod DB.

> **Decision (Phase 1)**: rewrite-only, no 301 redirect. Single-user system, no SEO / cached-HTML tail to worry about. Once both tables are mutated, the old `notesync-images.derekentringer.com` DNS can be left to expire at cutover.

## Verification gates

- [ ] Row count parity for every table (old vs new)
- [ ] Spot-check developer's own data — full note list, folder tree, tags, recent versions intact
- [ ] Sync cursors are present (otherwise next sync will full-scan)
- [ ] R2 bucket parity: `aws s3 ls --recursive` count match
- [ ] No image URL in any Note content **or** `images.r2Url` row references the old domain after the rewrite

## Rollback plan

If verification fails during the cutover window:

- [ ] Don't flip DNS in Phase 7 — old `ns-api` continues serving on the existing domain
- [ ] Investigate root cause without time pressure (no users to communicate with; can take days if needed)
- [ ] Schedule a second cutover attempt

The old DB stays untouched during the cutover (we only read from it for the dump). Rollback is just "don't flip DNS, fix the new env, try again."

## Done criteria

- [ ] Dry run completes without errors
- [ ] Real cutover row counts match
- [ ] R2 buckets in sync
- [ ] Image URLs rewritten in Note content
- [ ] Phase 7 DNS flip is unblocked
