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

**Decision (Phase 4)**: Notate is a paid product, so the repo stays **private** indefinitely. No post-launch flip to public.

Knock-on effects of staying private on a GitHub free org plan:

- [x] Repo visibility remains private — confirmed
- [ ] Branch protection rules — **not available** on private repos under the free plan. Either accept self-discipline (only merge green PRs) or upgrade to GitHub Team ($4/user/mo) to unlock protection. Decision currently: self-discipline.
- [ ] If at some point a public-facing landing page / marketing site is needed, that lives separately (e.g., notate.md served by Railway via `packages/web`), not as the GitHub repo's public face.

### I. Communicate the all-clear

- [ ] Final email to users: "Migration complete, everything stable, here's what's new"
- [ ] Update the post-cutover banner to a permanent "Welcome to Notate" or remove entirely
- [ ] Post any post-mortem learnings on a public blog if open-sourcing

### J. Store launch & signing setup (post-stability milestone)

Per Phase 1 § Mobile/Desktop signing, all paid signing/distribution accounts were deferred until after migration + the 30-day stability period in § A. Once the new stack has been exercised end-to-end against real-world usage and we're confident in production behavior, this is the milestone to invest in store distribution.

Detailed plan deferred until ready to execute — the items below are a placeholder skeleton:

- [ ] **Apple Developer Program** ($99/yr) — enroll the Notate / PixelPerfect Studios LLC entity; generates the certs needed for macOS notarization, iOS App Store, and TestFlight.
- [ ] **macOS notarization** — replace `APPLE_SIGNING_IDENTITY=-` with real Developer ID Application cert; update `tauri:build:prod` to run `notarytool submit` + staple after build. Result: no Gatekeeper warning on first launch.
- [ ] **iOS App Store submission** — generate distribution provisioning profile, build via `expo build:ios` with the new bundle ID, submit via TestFlight first, then App Store review.
- [ ] **Google Play Console** ($25 one-time) — register the LLC, generate Play upload key, build signed AAB via `expo build:android`, submit for review (closed testing track first, then production).
- [ ] **Windows code signing** (~$200/yr or EV cert at ~$400/yr) — only worthwhile if Notate gains non-personal users. Skip unless distribution demand justifies it.
- [ ] **Update CLAUDE.md / BUILD.md** — replace "ad-hoc / sideload-only" notes with the signed-distribution flow once the certs are in place.
- [ ] **Communicate** — new download links for store versions; sideload paths continue to work for users who want them.

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
