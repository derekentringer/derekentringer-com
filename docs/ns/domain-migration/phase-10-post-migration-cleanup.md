# Phase 10 — Post-Migration Cleanup

**Status**: 🟡 Not started
**Depends on**: Phase 9 (cutover succeeded, no rollback)
**Blocks**: nothing
**Goal**: tear down the old NoteSync infrastructure once enough time has passed to confirm the new stack is stable, archive code that's no longer needed, and update tracking docs to reflect the migration is done.

This phase is unhurried. Wait at least **30 days** post-cutover before deleting anything irreversible — you want to be sure the new stack is healthy under real-world load patterns, including the long tail of user behavior that takes weeks to surface.

## Tasks

### A. Wait period (target: 30 days post-cutover)

- [ ] Daily check-in on the new stack's Railway logs for the first 7 days
- [ ] Weekly check-in for the next 3 weeks
- [ ] Track any user-reported bugs that turn out to be migration-related
- [ ] Confirm sync engine is stable — no abnormal rejection rates, no SSE disconnect storms

### B. Old monorepo NS-package archival

The `ns-*` packages still exist in `derekentringer/derekentringer-com` even though they're no longer deployed. Decide how to handle:

- [ ] **Option A**: keep them in place as historical reference. Mark each `package.json` with `"private": true`, add a top-level `ARCHIVED.md` pointing readers to the new repo. Costs nothing, preserves git history in-place.
- [ ] **Option B**: delete the packages entirely from `derekentringer-com`. Keep history accessible via the git tag from before deletion. Cleaner but loses convenient browsability.

> **Recommendation**: Option A. Disk and storage are free; navigation friction is real.

If Option A:

- [ ] Add `packages/ns-api/ARCHIVED.md`, `ns-web/ARCHIVED.md`, etc. with redirects to the `notate` repo
- [ ] Open a PR removing the NS workspace globs from root `package.json` (if not already done as part of the rename)
- [ ] Update `CLAUDE.md` in `derekentringer-com` to drop the NoteSync sections (these references shouldn't apply to this repo anymore)

### C. Old Railway services

After the 30-day wait:

- [ ] Take a final `pg_dump` of the old Postgres for cold-storage backup (in case something still surfaces a need for it)
- [ ] Delete the old `ns-api` Railway service
- [ ] Delete the old `ns-web` Railway service
- [ ] Delete the old Postgres plugin (after confirming the dump is safe)
- [ ] Net result: ~$15/month saved in Railway costs

### D. Old Cloudflare records

- [ ] Delete the `ns.derekentringer.com` DNS records (no longer needed once redirects propagate to the long tail)
- [ ] Delete `ns-api.derekentringer.com` records
- [ ] Delete `notesync-images.derekentringer.com` records
- [ ] **Leave the Cloudflare Bulk Redirects rules active** — they're cheap and catch any cached bookmarks for years to come

### E. Old R2 bucket

After confirming all images are in the new bucket and the old domain redirects are working:

- [ ] Take an inventory backup of the old `notesync-images` bucket key list (cheap insurance)
- [ ] Delete the old R2 bucket
- [ ] Costs saved: ~$0.015/GB/month — minor but tidy

### F. Old service accounts

- [ ] Resend: revoke `RESEND_API_KEY` that was used by old `ns-api`
- [ ] Anthropic / OpenAI / Voyage: revoke any keys that the new stack doesn't use
- [ ] Don't delete the accounts themselves if they're still serving fin-* on `derekentringer-com`

### G. Documentation final-state update

- [ ] Update `docs/ns/domain-migration/README.md` with a "Migration complete on [date]" status block at the top
- [ ] Mark every phase doc 🔷 Shipped
- [ ] Move the entire `domain-migration/` directory to `docs/historical/notesync-to-notate-migration/` in the new `notate` repo (preserves the audit trail; keeps the live docs tree clean)
- [ ] Update `docs/PROGRESS.md` (in the new repo) to reflect that the migration is complete, not part of active development

### H. Repository visibility

If Phase 0 D.5 had the new `notate` repo as private:

- [ ] Decide whether to make it public now (open-source the project)
- [ ] If public: review for any committed secrets via `git-secrets` / `truffleHog`; if any found, rotate those credentials *and* rewrite git history before flipping to public
- [ ] Add a public `README.md` covering project overview, setup, contributing
- [ ] Add a `LICENSE` file (MIT / AGPL / Sustainable Use License — separate decision)

### I. Communicate the all-clear

- [ ] Final email to users: "Migration complete, everything stable, here's what's new"
- [ ] Update the post-cutover banner to a permanent "Welcome to Notate" or remove entirely
- [ ] Post any post-mortem learnings on a public blog if open-sourcing

## Verification gates

- [ ] 30-day post-cutover stability period elapsed without rollback
- [ ] All A–F cleanup tasks complete
- [ ] No active resources on the old accounts that still cost money
- [ ] Migration documentation moved to historical location

## Done criteria

- [ ] Old infrastructure fully torn down or archived
- [ ] New repo's docs reflect a steady-state Notate, not a project mid-migration
- [ ] Total monthly cost reduced by old-Railway savings
- [ ] No lingering references to NoteSync naming in any *active* code path

## What this phase does NOT do

- Doesn't touch `fin-*` packages or `derekentringer.com` portfolio infra (those keep operating as before)
- Doesn't migrate the `derekentringer-com` repo itself (it lives on, just with the NS packages archived inside it)
- Doesn't trigger any user-facing changes (everything user-visible was done in Phase 9)
