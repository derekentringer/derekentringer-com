# Phase 9 — Cutover

**Status**: ✅ Complete. Data + R2 migrated from old prod to new Notate. Manual browser smoke test against `https://notate.md` confirmed the migrated data is intact. Single-user pre-launch reality reduced the planned ~2-hour cutover window to ~5 minutes of actual work.
**Depends on**: Phase 5 (DB migration plan validated), Phase 6 (services running on staging), Phase 7 (DNS staged), Phase 8 (clients ready)
**Blocks**: Phase 10 (cleanup)
**Goal**: execute the production cutover. Freeze writes on the old stack, drain in-flight requests, do the final database dump+restore, flip DNS, activate redirects, and announce to users. The whole window is targeted at <2 hours.

This is the riskiest phase. Run through the entire procedure on staging first, then execute live with a written-down checklist next to you.

## What actually ran (single-user reality)

Skipped vs. doc:
- ❌ User comms (T-7 email, in-app banner, tester announcements) — only user is the developer
- ❌ DNS TTL drop (Phase 7 already pointed `notate.md` at the new infra; nothing to "flip")
- ❌ "Read-only mode" middleware on old api — just stopped using the old NoteSync clients
- ❌ Cloudflare Bulk Redirects activation — Phase 0 / 5 decisions: no redirects; DB URL rewrite handles the only old refs
- ❌ Post-cutover banner / blog / Twitter announcements — no audience

Actually executed (~5 minutes):

### Step 1 — Capture old prod DB URL

- [x] Pulled `DATABASE_PUBLIC_URL` from old derekentringer-com Railway Postgres
- [x] Wrote to `/tmp/old_db_url` via `pbpaste` (no chat-leak of credentials)

### Step 2 — Dump + restore

- [x] `pg_dump --format=custom --no-owner --no-acl --no-privileges` → `/tmp/notesync-final.dump` (1.8 MB; the 1.13 GB Phase 0 number was Railway's backup size with WAL + indexes)
- [x] `pg_restore --clean --if-exists --no-owner --no-acl --no-privileges` into the new Notate Postgres (schema-parity prep from Phase 5 meant `--clean --if-exists` could safely drop and recreate)
- [x] Row counts match exactly: 144 notes, 67 folders, 29 images, 1 user, 200 note_versions, 143 of 144 notes with `vector`-typed embeddings (1 short note without an embedding job run)

### Step 3 — URL rewrite (Phase 5 § D)

```sql
UPDATE notes SET content = REPLACE(content, 'notesync-images.derekentringer.com', 'img.notate.md')
  WHERE content LIKE '%notesync-images.derekentringer.com%';   -- 4 rows updated

UPDATE images SET "r2Url" = REPLACE("r2Url", 'notesync-images.derekentringer.com', 'img.notate.md')
  WHERE "r2Url" LIKE '%notesync-images.derekentringer.com%';   -- 29 rows updated
```

- [x] 4 note bodies + 29 image rows rewritten
- [x] Zero `notesync-images.derekentringer.com` references remain on the new DB

### Step 4 — R2 bucket sync

- [x] Created temporary R2 API token scoped to both `notesync-images` (read) + `notate-images` (write); 24h TTL
- [x] `aws s3 sync s3://notesync-images s3://notate-images --endpoint-url <r2> --profile r2-migration`
- [x] 24 objects, 19.1 MiB synced
- [x] Both buckets show 24 objects post-sync
- [x] `curl -sI https://img.notate.md/<key>` → 200 image/png (image fetch via custom domain works end-to-end)
- [x] Temporary R2 token revoked after sync

### Step 5 — Manual smoke test

Done by the developer in a browser at `https://notate.md`:

- [x] Login with existing credentials → success
- [x] Notes list + folder tree intact
- [x] Embedded images render via `img.notate.md`
- [x] Sync engine connects (SSE)

## Total time

~5 minutes of CLI work + ~2 minutes browser smoke test = **7 minutes total**. The doc's ~60–105 minute window was scoped for a public-user cutover with comms, DNS flip, redirect activation, multi-region propagation waits — none of which applied to single-user Notate.

## Rollback (would-have-been)

Not triggered. Worth noting that the old prod DB + old R2 bucket were never modified by the cutover — `pg_dump` is read-only, `aws s3 sync` from old → new doesn't touch the source. If verification had failed:

- Old `ns-api` would have continued serving on old domain (Phase 7 didn't change old DNS)
- New `notate.md` could be cleared (drop schema, re-apply migrations, re-run cutover)
- No user impact (single user; just don't use the new domain until fixed)

## Verification gates

- [x] Step 5 smoke tests pass (user-confirmed in browser)
- [x] Row count parity exact across all tables
- [x] No `notesync-images.derekentringer.com` references remain on new DB
- [x] R2 bucket counts match
- [x] Image fetch via `https://img.notate.md/<key>` returns 200

## Done criteria

- [x] Data migrated, URLs rewritten, R2 buckets in sync
- [x] User-confirmed smoke test on `https://notate.md`
- [x] Phase 10 unblocked
- [ ] Old `ns-*` Railway services remain online (deferred to Phase 10 § C "Old Railway services" teardown after a stability soak)
