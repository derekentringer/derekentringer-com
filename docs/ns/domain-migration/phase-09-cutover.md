# Phase 9 — Cutover

**Status**: 🟡 Not started
**Depends on**: Phase 5 (DB migration plan validated), Phase 6 (services running on staging), Phase 7 (DNS staged), Phase 8 (clients ready)
**Blocks**: Phase 10 (cleanup)
**Goal**: execute the production cutover. Freeze writes on the old stack, drain in-flight requests, do the final database dump+restore, flip DNS, activate redirects, and announce to users. The whole window is targeted at <2 hours.

This is the riskiest phase. Run through the entire procedure on staging first, then execute live with a written-down checklist next to you.

## Pre-cutover checklist (T-7 days)

- [ ] Phase 0–8 complete and verified
- [ ] Cutover window scheduled (recommend Sunday 06:00 local — lowest active-user count)
- [ ] Tester email sent (Phase 8 § E)
- [ ] In-app banner deployed to the existing `ns-web` 7 days ahead: "NoteSync is becoming Notate. Migrating to notate.md on [date]. After cutover, please re-add your passkeys."
- [ ] Email blast to all registered users (Resend campaign on the *old* APP_URL) with the same announcement
- [ ] DNS TTLs dropped to 300s on every old-domain record (Phase 7 § E)
- [ ] Cutover-day runbook printed / pinned

## T-1 day

- [ ] Final dry-run dump+restore on the dry-run DB; confirm row counts + smoke test (Phase 5 § A)
- [ ] Confirm staging is still green
- [ ] Confirm new app builds (Phase 8) are downloadable from the public download page
- [ ] Triple-check the DNS records ready to flip in Cloudflare (don't activate yet)

## T-0 (cutover window)

### Step 1 — Announce + freeze (target: 5 minutes)

- [ ] Post the "downtime starting" banner on the existing `ns-web`
- [ ] Set the existing `ns-api` to **read-only** mode (toggle the env flag or middleware that returns 503 on POST/PATCH/DELETE)
- [ ] Wait 60–120 seconds for any in-flight writes to drain

### Step 2 — Final dump + restore (target: 30–60 minutes depending on DB size)

- [ ] `pg_dump` the old Postgres → custom-format dump
- [ ] `pg_restore` into the new Postgres
- [ ] Run sequence resets (Phase 5 § C)
- [ ] Run the markdown image-URL rewrite (Phase 5 § D)
- [ ] Verify row counts match across every table
- [ ] Verify spot-check users: their notes list / folder tree / tags / image refs match exactly between old and new

### Step 3 — R2 final sync (target: 5–10 minutes)

- [ ] `aws s3 sync s3://notesync-images s3://notate-images` one more time to catch any uploads from the past dry-run-to-cutover gap
- [ ] Verify object count parity

### Step 4 — DNS flip (target: 5 minutes; propagation 5–15 minutes)

- [ ] In Cloudflare, switch `ns.derekentringer.com` from the old Railway target to "redirect-only" (Cloudflare Bulk Redirects activated, no Railway traffic)
- [ ] Confirm `notate.md` (apex), `api.notate.md`, `img.notate.md` resolve from multiple regions (`dnschecker.org`)
- [ ] Activate the Cloudflare Bulk Redirects ruleset (Phase 7 § F)
- [ ] Test `https://ns.derekentringer.com/notes/some-id` 301s to `https://notate.md/notes/some-id`

### Step 5 — Smoke test (target: 10 minutes)

Quick functional pass against the live new domain:

- [ ] `https://notate.md` loads, login works
- [ ] Sign in with a known production user, see their real notes
- [ ] Create a new note, sync it across platforms (using the new mobile / desktop builds from Phase 8)
- [ ] Image upload + display
- [ ] Audio recording + transcription job
- [ ] Email password reset (verify Resend sends from `notate.md`)
- [ ] WebAuthn re-registration flow on a fresh browser (expected to fail at first, then succeed after re-register)

### Step 6 — Announce + lift the freeze (target: 5 minutes)

- [ ] Update the in-app banner from "downtime in progress" to "Welcome to Notate! [details]"
- [ ] Post on Twitter / blog / wherever the user community hangs out
- [ ] Re-enable writes on the *new* api (it was already write-enabled — the old api stays read-only forever as a redirect zombie)

## Total target window

- Step 1: 5 min
- Step 2: 30–60 min
- Step 3: 10 min
- Step 4: 15 min
- Step 5: 10 min
- Step 6: 5 min

**Worst case: ~105 minutes. Realistic: ~60 minutes.**

## Rollback procedure

Trigger if step 2's row-count check fails, or step 5 finds a critical regression:

- [ ] Re-enable writes on the old `ns-api` (lift the read-only flag)
- [ ] Revert the DNS records (Cloudflare flip back to old Railway target)
- [ ] Deactivate the Bulk Redirects ruleset
- [ ] Take the new `notate.md` services offline (don't accept writes against a partial-restore DB)
- [ ] Email users: "Migration aborted, NoteSync remains live, we'll reschedule"
- [ ] Investigate root cause without time pressure
- [ ] Schedule next attempt 1–2 weeks out

The old DB is untouched throughout (we only dump from it; we don't modify it). Rollback is "don't keep going forward" — there's nothing destructive to undo.

## Communication templates

### Pre-cutover email (T-7 days)

> **NoteSync is becoming Notate.**
>
> On [date] at [time], we're moving the app from `ns.derekentringer.com` to `notate.md`. Same app, same data, new name + domain.
>
> **Downtime**: roughly 1 hour during the migration window. The web app will be read-only briefly.
>
> **What you need to do**:
> 1. After the migration, sign in once with your password on `notate.md`.
> 2. Re-add your passkey from the security settings page (passkeys are tied to a domain, so they don't carry over).
> 3. Download the new mobile / desktop apps from `notate.md/download`.
>
> Old links and bookmarks redirect automatically. Your data is unchanged.

### Post-cutover banner

> **You're now on Notate.** All your notes carried over. Don't forget to re-add your passkey under Settings → Security.

## Verification gates

- [ ] Step 5 smoke tests all pass
- [ ] No 5xx errors on `api.notate.md` in the first 30 minutes post-cutover
- [ ] Sample 10 random users reach out / log in successfully
- [ ] Old domain redirects work end-to-end
- [ ] WebAuthn re-registration works for at least one test user

## Done criteria

- [ ] Cutover window closes with all gates green
- [ ] Old `ns-*` Railway services are read-only (or already shut down)
- [ ] Phase 10 unblocked
