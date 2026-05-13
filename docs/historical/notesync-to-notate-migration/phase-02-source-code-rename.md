# Phase 2 — Source-Code Rename

**Status**: ✅ Complete (executed in standalone clone `~/Documents/dent/projects/notate`, 6 commits; type-check + build + test gates pass). Manual gates (Tauri dev launch, `expo run` builds, manual smoke test) deferred to Phase 6 deploy.
**Depends on**: Phase 0 (D.1 package naming convention, D.2 repo structure, D.3 npm scope, I.1–I.2 inventory)
**Blocks**: Phase 3 (extraction)
**Goal**: refactor every NoteSync reference inside the *current* monorepo on a long-lived feature branch, until type-check, tests, and a full local build all pass against the new naming. Phase 3 then copies these renamed packages into the new repo.

The principle: do the rename in the existing repo first, where the existing turbo / vitest / jest / ESLint setup will catch every dangling reference. Pulling code into a new repo *plus* renaming simultaneously is much harder to debug.

## Branching

**Executed strategy** (decided during walkthrough): standalone clone instead of long-lived branch, because:

- `packages/web` collision with the existing portfolio `web` package would have required temp names during the rename
- The renamed packages need to become the seed for the new Notate repo in Phase 3 — doing the rename in a directory that *is* the future repo's working copy is the natural sequencing
- The derekentringer-com repo stays clean for prod operations (no risk of accidental merges of half-renamed code)

```
git clone /path/to/derekentringer-com ~/Documents/dent/projects/notate
cd ~/Documents/dent/projects/notate
# rename freely with plain git commits — no upstream, no GitHub PRs
```

The notate clone has its own linear git history (6 commits, all referenced in the work-area sections below). When Phase 3 starts, `git remote set-url` this clone to the new `PixelPerfect-Studios-LLC/notate` GitHub repo and push.

## Work areas

### A. Package rename

Per Phase 0 D.1, assuming option C (drop the `ns-` prefix):

- [x] Rename directory `packages/ns-api` → `packages/api`
- [x] Rename directory `packages/ns-web` → `packages/web` *(collision with the existing portfolio `packages/web`!)* — see "Collision warning" below
- [x] Rename directory `packages/ns-desktop` → `packages/desktop`
- [x] Rename directory `packages/ns-mobile` → `packages/mobile`
- [x] Rename directory `packages/ns-shared` → merge into `packages/shared` (per D.7) or rename to `packages/notate-shared`
- [x] Update each package's `package.json` `name` field accordingly
- [x] Update root `package.json` `workspaces` glob if any explicit paths

**Collision warning**: the current monorepo already has a `packages/web` (the portfolio site). Renaming `ns-web` → `web` in this repo would conflict. Two paths:

1. Do the rename inside a *fork* of the repo (clone under a new local name, rename freely, ignore the conflict because Phase 3 only takes the renamed NS packages with us).
2. Use temporary names during this phase (`packages/web-notate`, etc.) and rename to the final names in Phase 3 after extraction.

**Recommended**: option 1 — fork locally, rename freely.

### B. Workspace package imports

Every `import` from `@derekentringer/ns-*` or `@derekentringer/shared/ns` needs updating:

- [x] `@derekentringer/ns-shared` → `@notate/shared` (or chosen scope per D.3)
- [x] `@derekentringer/shared` → `@notate/shared` (same)
- [x] `@derekentringer/shared/auth` → `@notate/shared/auth` (preserve subpath structure)
- [x] `@derekentringer/shared/ns` → drop entirely (re-export inlined into `@notate/shared`)
- [x] `@derekentringer/shared/token` → `@notate/shared/token`

Use `git grep -lE "@derekentringer/(ns-)?shared"` to find every file. Most updates are mechanical find-and-replace; verify type-check after.

### C. Code identifiers

Many TypeScript / Rust / Swift identifiers reference NoteSync by name:

- [x] React component `NsLogo` → `NotateLogo`
- [x] Tauri Rust crate name in `src-tauri/Cargo.toml`: currently `NoteSync` → `Notate`
- [x] Mobile build-info module names
- [x] localStorage / SecureStore keys: `ns-editor-settings` → `notate-editor-settings` (data-loss risk — see "Storage key migration" below)
- [x] Database name (desktop SQLite): `notesync.db` / `notesync_localhost.db` (in `dbName.ts`) → `notate.db` / `notate_localhost.db`

**Storage key migration**: changing a localStorage key drops every existing user's settings. Mitigate with a one-time migration on app start: if `notate-editor-settings` is missing and `ns-editor-settings` exists, copy the value over. Same for the desktop SQLite file. *Only relevant for users who used the staging build before cutover; production users hit fresh storage on `notate.md` anyway.*

### D. UI strings

Per inventory I.1, every visible "NoteSync" string changes:

- [x] `packages/web/index.html` — `<title>`, meta tags
- [x] `packages/web/public/site.webmanifest` — `name`, `short_name`
- [x] `packages/web/src/pages/LoginPage.tsx` — branding
- [x] `packages/web/src/components/AboutDialog.tsx` (or equivalent)
- [x] `packages/desktop/src-tauri/tauri.conf.json` — `productName`
- [x] `packages/desktop/src-tauri/Info.plist` — usage description strings
- [x] `packages/mobile/app.json` — `expo.name`
- [x] Email templates (handled in Phase 1 + Phase 6)
- [x] Copy in confirmation dialogs, toasts, error messages, etc. (`git grep "NoteSync"` finds all)

### E. Bundle identifiers

Per Phase 0 D.8 / D.9: the new identifiers are **`md.notate.app`** (prod) and **`md.notate.app.dev`** (dev variant for side-by-side installs).

- [x] `packages/desktop/src-tauri/tauri.conf.json` → base identifier: `com.derekentringer.notesync` → `md.notate.app`
- [x] `packages/desktop/src-tauri/tauri.dev.conf.json` → dev-override identifier: `com.derekentringer.notesync.dev` → `md.notate.app.dev`
- [x] `packages/mobile/app.config.ts` → both prod (`md.notate.app`) and dev (`md.notate.app.dev`) branches updated
- [x] **Critical**: bundle ID changes are non-reversible for existing app installs. Existing TestFlight / sideload installs on the old ID become orphaned. Pre-launch single-user posture means the developer just reinstalls both variants once on each device — no user comms layer required.

### F. URL constants

Every hardcoded `ns.derekentringer.com` / `ns-api.derekentringer.com` reference:

- [x] `packages/api/src/config.ts` — defaults (`CORS_ORIGIN`, `APP_URL`)
- [x] `packages/web/.env.production` — `VITE_API_URL`
- [x] `packages/desktop/package.json` build scripts — `VITE_API_URL` baked into Tauri builds (per CLAUDE.md, this is set explicitly via `cross-env` in every `tauri:build*` script — must update every script)
- [x] `packages/mobile/src/lib/devHost.ts` — `PROD_API_URL` constant
- [x] R2 public URL: `notesync-images.derekentringer.com` → `img.notate.md`
- [x] Email links (handled by Phase 1's Resend setup + an `APP_URL` env override)

### G. Documentation

- [x] `CLAUDE.md` — top-to-bottom rewrite of all references (drop `ns.derekentringer.com`, `notesync-images.derekentringer.com`, `ns-api`/`ns-web`/etc. package names, `com.derekentringer.notesync` bundle ids)
- [x] `docs/ns/**/*.md` — broad search-and-replace, then a manual review of architecture docs that may have screenshots / specific URL references

### H. Test fixtures + snapshots

- [x] Search for "notesync" / "NoteSync" in fixture files (`*.test.ts`, `__tests__/`, `e2e/`, etc.)
- [x] Update any snapshot tests that contain old branding text

### I. Provider cleanup — deferred to Groq cutover

Per Phase 1 § OpenAI/Whisper, Notate launches on **OpenAI Whisper** (Groq is not accepting new dev API keys at this time). So during Phase 2 / Phase 6, we keep `OPENAI_API_KEY` in `packages/api/src/config.ts`'s `required` array and on the prod env — it's actively used.

When Groq reopens dev accounts, run this cleanup as part of the provider swap (separate small PR, not part of the migration):

- [ ] Set `WHISPER_PROVIDER=groq` + `WHISPER_API_KEY=<groq key>` on the prod env (the key is already captured in the secrets vault from Phase 1).
- [ ] Remove `OPENAI_API_KEY` from the `required` array in `packages/api/src/config.ts` (lines ~12–24) so the boot-time check stops demanding it.
- [ ] Remove the `openaiApiKey: process.env.OPENAI_API_KEY || ""` field from the returned config object (`grep -r openaiApiKey src/` returns zero hits, so this is safe).
- [ ] Optionally simplify the `whisperApiUrl` / `whisperApiKey` / `whisperModel` ternaries — keep the OpenAI branches if you want the env-var seam to allow one-flip *back* to OpenAI for testing; remove them if you want minimal config.
- [ ] Delete `OPENAI_API_KEY` from the prod env on Railway after deploy + confirm transcription works on Groq.

### J. Voyage model env-var seam

`packages/api/src/services/embeddingService.ts` (post-rename) currently hardcodes the embedding model:

```ts
const VOYAGE_MODEL = "voyage-3-lite";
```

Convert to an env-driven seam matching the `CLAUDE_MODEL` / `WHISPER_MODEL` pattern so future model swaps don't require a code deploy:

- [x] Change to `const VOYAGE_MODEL = process.env.VOYAGE_MODEL || "voyage-3-lite";`
- [x] Add `voyageModel` to `Config` interface and to the returned config object in `packages/api/src/config.ts`, reading `process.env.VOYAGE_MODEL || "voyage-3-lite"`.
- [x] Update `embeddingService.ts` to read from `getConfig().voyageModel` instead of the local const (so all model references route through one source).
- [x] Update the test in `packages/api/src/__tests__/embeddingService.test.ts:37` — it currently expects `"voyage-3-lite"` literally; either keep it asserting the default or make it env-driven too.
- [x] **Critical**: do NOT actually change the model at deploy time. Vector dimensions differ between Voyage models, and existing embeddings in the migrated Postgres are tied to `voyage-3-lite`. Any model swap would require re-embedding every note. The env var is *capability*, not an active change.

## Verification gates

Run on the standalone `notate` clone:

- [x] `npx turbo run type-check` — all 6 packages pass
- [x] `npx turbo run test` — 1043 passed / 1 skipped; the one turbo-parallel failure (`AudioRecorder.integration.test.tsx`) is a known flake (also seen on derekentringer-com CI) that passes standalone
- [x] `npx turbo run build` — all 5 build tasks succeed (mobile has no `build` script which is expected for Expo)
- [ ] Local Tauri dev build of the desktop app launches and connects to a local API — **manual, deferred to Phase 6 deploy testing**
- [ ] `expo run:android` and `expo run:ios` builds succeed — **manual, deferred to Phase 6 deploy testing**
- [ ] Manual smoke test: log in to the local stack with the renamed apps, create a note, sync between platforms — **manual, deferred to Phase 6 deploy testing**

## Done criteria

- [x] Every checkbox in A–J above is checked (except § I, intentionally deferred to Groq cutover)
- [x] All three automatable verification gates pass; manual gates are intentionally deferred to the actual deploy in Phase 6
- [x] No `git grep -i "notesync"` hits remain in any package source (only allowed: historical mentions in `docs/historical/notesync-to-notate-migration/` which describe the rename itself, plus the `packages/ns-*/ARCHIVED.md` redirect stubs)
- [x] No `git grep "@derekentringer/"` hits remain in renamed packages

## Estimated cost

Mechanical renames are tedious but low-risk. Expect 1–3 days of focused work, most of it driven by the verification gate cycle. Bundle ID changes for mobile require a native rebuild + reinstall on test devices.
