# Phase 0 — Decisions & Inventory

**Status**: 🟠 In progress (decisions D.1–D.5 + D.7 resolved; D.6 N/A for single-user; inventory passes pending)
**Blocks**: every other phase
**Goal**: lock in the cross-cutting decisions that shape the entire migration, and produce a complete inventory of every NoteSync reference in the codebase + infrastructure so nothing is missed during the rename.

This phase is mostly thinking + spreadsheets, not code. Spend the time here so Phase 2 doesn't turn into whack-a-mole.

## Resolved decisions summary

| ID | Decision | Resolution |
|----|----------|------------|
| D.1 | Package naming | **Drop the `ns-` prefix** → `web`, `api`, `desktop`, `mobile`, `shared` |
| D.2 | Repo structure | **Monorepo** at `<pixelperfect-studios-org>/notate` with all 5 packages |
| D.3 | NPM workspace scope | **`@notate/*`** (workspace-internal only; no npm publish) |
| D.4 | Existing data | **Carry over** — single dev user, simple `pg_dump`/`pg_restore` |
| D.5 | GitHub | Org: **PixelPerfect Studios LLC**. Repo: **`notate`** |
| D.6 | WebAuthn passkeys | **N/A** — developer re-registers once, no user comms needed |
| D.7 | Shared package strategy | **Copy + prune**; inline `ns-shared` content into `@notate/shared` |
| D.8 | Bundle identifier | **`md.notate.app`** (reverse-DNS of `notate.md` with an `.app` label suffix) |

## Decisions to lock in

### D.1 — Package naming convention

The four NS packages are currently:

```
packages/ns-api
packages/ns-desktop
packages/ns-mobile
packages/ns-web
packages/ns-shared        ← NoteSync-specific shared types
packages/shared           ← cross-product shared (used by ns + fin)
```

Once they live in a Notate-only repo, the `ns-` prefix is redundant. Three options:

| Option | Names | Pros | Cons |
|--------|-------|------|------|
| A | Keep `ns-*` | Zero churn in import paths; easy diff | Confusing in a Notate repo; "ns" stops standing for anything |
| B | Rename to `notate-*` | Self-documenting | Redundant inside a `notate` repo |
| C | Drop prefix (`web`, `api`, `desktop`, `mobile`, `shared`) | Cleanest single-product layout | One-time global import-path refactor; ~hundreds of `@derekentringer/ns-*` imports change |

**Decision**: ✅ **C — drop the prefix**. The new repo only hosts one product; the prefix carries no information.

- [x] Decided: C
- [x] Documented in the Resolved decisions summary above

### D.2 — Repo structure

| Option | Layout | Pros | Cons |
|--------|--------|------|------|
| Monorepo | Single `notate` repo with all packages | Matches existing turborepo workflow; shared types stay first-party | One repo grows large |
| Split | One repo per platform (`notate-web`, `notate-api`, ...) | Common OSS pattern; each surface releasable independently | Need to publish shared types to npm or git-submodule them; significant friction |

**Decision**: ✅ **Monorepo** with all 5 packages — matches existing turborepo workflow.

- [x] Decided: monorepo

### D.3 — NPM workspace scope

Today the packages export under `@derekentringer/shared`, `@derekentringer/ns-shared`. After migration:

- **Option A** — `@notate/shared` (scoped, needs npm org or just used internally)
- **Option B** — Unscoped (`shared`, `notate-shared`, etc.) — only works for workspace-internal packages
- **Option C** — `@notate-app/shared` if `@notate` is taken

Workspace-internal packages can have any name; this only matters if any of these get published to npm. Today none of them do, so the choice is purely cosmetic.

**Decision**: ✅ **`@notate/*`** — workspace-internal scope, no publish required.

- [x] Decided: `@notate/*`

### D.4 — Existing user data

The Postgres database under the current `ns-api` Railway service holds all production user data: notes, folders, tags, images, sync cursors, refresh tokens, chat history, transcription jobs, image rows, etc.

| Option | What happens | Cost |
|--------|--------------|------|
| Carry over | `pg_dump` from old Railway DB → `pg_restore` into new Railway DB during Phase 5. Users keep all data. WebAuthn passkeys break (RP_ID change). | Higher — need a downtime window or replication strategy |
| Fresh start | New empty database. Users re-register and start over. | Lower — but throws away every existing note |

**Decision**: ✅ **Carry over**. Pre-launch with a single dev user; the migration is essentially "move my own data + dev notes to the new env." Phase 5 reduces to a `pg_dump` / `pg_restore` with a 5-minute personal write freeze — no downtime window required, no public coordination.

- [x] Decided: carry over
- [x] Downtime model: developer-only, ~5 minutes self-imposed write freeze during the dump+restore

### D.5 — GitHub org name

**Decision**: ✅ **PixelPerfect Studios LLC** is the org. Repo name: **`notate`**.

- [x] Decided: org = PixelPerfect Studios LLC; repo = `notate`
- [ ] Confirm the GitHub org slug (URL handle — likely `pixelperfect-studios` or similar without spaces)
- [ ] Confirm visibility setting at creation time (private until launch is fine; flip public per Phase 10 § H later)

### D.6 — WebAuthn passkey strategy

WebAuthn `RP_ID` is tied to the domain. A `notate.md` deployment will reject passkeys registered against `ns.derekentringer.com`. There's no workaround — this is by design in the WebAuthn spec.

Options:

- **Forced re-registration**: users sign in with password (or email reset) on first visit to `notate.md`, then re-add their passkey. Communicate via the email Phase 9 sends.
- **Disable WebAuthn for the migration window**: temporarily turn off the passkey UI, switch back on after most users have re-registered.

**Decision**: ✅ **N/A** for the migration itself — pre-launch, the only user is the developer. After cutover, sign in once with the password, re-add the passkey under Settings → Security. No copy / banner needed.

When Notate goes public later, the public migration plan would need the in-app banner approach above; preserved here as future reference.

- [x] Decided: developer self-service re-registration; no comms layer required

### D.7 — Shared package strategy

`packages/shared` is consumed by both NS and Fin packages. After migration, NS leaves the monorepo; the shared package needs to be either copied or split.

Looking at the export tree (`packages/shared/package.json`):

| Subpath | Used by | Migration plan |
|---------|---------|----------------|
| `.` (`@derekentringer/shared`) | NS + Fin | Copy to new repo as `packages/shared`. Old monorepo keeps its copy for Fin. |
| `./auth` | NS + Fin | Same. |
| `./auth/pinVerify` | Fin | **Stays** in old monorepo, drop from new repo's copy. |
| `./finance` | Fin | **Stays** in old monorepo, drop from new repo's copy. |
| `./ns` | NS only (re-exports `ns-shared`) | Inline `ns-shared` content directly into the new shared package; drop the `/ns` subpath. |
| `./token` | NS + Fin | Same. |

**Decision**: ✅ **Copy + prune**. The two repos diverge naturally after the split — there's no value in keeping shared-package coupling between Notate and the personal portfolio.

- [x] Decided: copy + prune
- [ ] Confirm prune-list above against actual current usage (Phase 3 task)
- [ ] Plan the inlining of `ns-shared` into the new `shared` package (Phase 3 task)

## Inventory pass

Goal: produce a comprehensive list so Phase 2 has a checklist instead of a discovery phase.

### I.1 — Code references to "NoteSync" / "ns-"

- [ ] `git grep -i "notesync" -- packages/` and capture the output
- [ ] `git grep -i "ns-api\|ns-web\|ns-mobile\|ns-desktop\|ns-shared" -- packages/`
- [ ] `git grep -i "ns\." -- packages/` (matches `ns.derekentringer.com`)
- [ ] `git grep -i "@derekentringer/" -- packages/ns-*/` (workspace imports)
- [ ] Catalog all UI strings containing "NoteSync" (login page, settings, about dialogs, email templates, etc.)

### I.2 — Bundle identifiers

- [ ] `packages/ns-desktop/src-tauri/tauri.conf.json` → `bundle.identifier`: `com.derekentringer.notesync` → **`md.notate.app`**
- [ ] `packages/ns-mobile/app.json` → `expo.ios.bundleIdentifier`: `com.derekentringer.notesync` → **`md.notate.app`**
- [ ] `packages/ns-mobile/app.json` → `expo.android.package`: `com.derekentringer.notesync` → **`md.notate.app`**
- [x] Decided: **`md.notate.app`**. The `.app` segment is a label, not a TLD reference; both Apple and Google accept this format. Domain-ownership questions during App Store review (if Notate ever publishes) are satisfied because the org owns `notate.md`.

### I.3 — Service account inventory

For each service, list: account login, what's deployed, env vars, custom domains, billing.

- [ ] Railway — `ns-api`, `ns-web`, Postgres plugin
- [ ] Cloudflare — DNS for `ns.derekentringer.com` + `ns-api.derekentringer.com`, R2 bucket `notesync-images`, R2 public domain `notesync-images.derekentringer.com`
- [ ] Resend — sender domain, email templates referencing "NoteSync"
- [ ] Anthropic — API key + model usage
- [ ] OpenAI — API key for Whisper (or Groq if switched per the `whisperProvider` config)
- [ ] Voyage AI — embedding API key
- [ ] GoDaddy — `derekentringer.com` registrar (relevant only for the redirect plan)

### I.4 — Documentation references

- [ ] `CLAUDE.md` — every section that mentions NoteSync, `ns-*` package names, or `ns.derekentringer.com`
- [ ] `docs/ns/web/docs/PROGRESS.md` — branding mentions
- [ ] `docs/ns/desktop/docs/PROGRESS.md` — same
- [ ] `docs/ns/mobile/docs/PROGRESS.md` — same
- [ ] All architecture docs under `docs/ns/architecture/`, `docs/ns/sync-arch/`, `docs/ns/audio-arch/`, `docs/ns/ai-assist-arch/`, `docs/ns/mobile-parity-arch/`

### I.5 — Production data inventory

- [ ] Postgres table sizes (largest first; informs dump/restore time estimate)
- [ ] R2 bucket size (`notesync-images`) — affects copy time if re-keyed under new bucket
- [ ] Active user count (drives the WebAuthn re-registration messaging plan)

## Output

A single tracked spreadsheet (or Markdown table at the bottom of this file) summarizing every decision and every inventoried item, used as the input to Phases 1 / 2 / 3.

## Done criteria

- [x] All seven decisions (D.1 – D.7) have a recorded answer
- [ ] All five inventory passes (I.1 – I.5) are complete
- [x] No open `<TBD>` markers in any other phase doc
