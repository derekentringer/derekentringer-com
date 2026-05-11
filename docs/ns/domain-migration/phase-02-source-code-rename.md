# Phase 2 — Source-Code Rename

**Status**: 🟡 Not started
**Depends on**: Phase 0 (D.1 package naming convention, D.2 repo structure, D.3 npm scope, I.1–I.2 inventory)
**Blocks**: Phase 3 (extraction)
**Goal**: refactor every NoteSync reference inside the *current* monorepo on a long-lived feature branch, until type-check, tests, and a full local build all pass against the new naming. Phase 3 then copies these renamed packages into the new repo.

The principle: do the rename in the existing repo first, where the existing turbo / vitest / jest / ESLint setup will catch every dangling reference. Pulling code into a new repo *plus* renaming simultaneously is much harder to debug.

## Branching

Create a long-lived branch off `develop`:

```
git checkout develop
git pull
git checkout -b develop-notate-rename
```

Each work area below gets a short-lived feature branch into `develop-notate-rename` so changes can ship in pieces.

## Work areas

### A. Package rename

Per Phase 0 D.1, assuming option C (drop the `ns-` prefix):

- [ ] Rename directory `packages/ns-api` → `packages/api`
- [ ] Rename directory `packages/ns-web` → `packages/web` *(collision with the existing portfolio `packages/web`!)* — see "Collision warning" below
- [ ] Rename directory `packages/ns-desktop` → `packages/desktop`
- [ ] Rename directory `packages/ns-mobile` → `packages/mobile`
- [ ] Rename directory `packages/ns-shared` → merge into `packages/shared` (per D.7) or rename to `packages/notate-shared`
- [ ] Update each package's `package.json` `name` field accordingly
- [ ] Update root `package.json` `workspaces` glob if any explicit paths

**Collision warning**: the current monorepo already has a `packages/web` (the portfolio site). Renaming `ns-web` → `web` in this repo would conflict. Two paths:

1. Do the rename inside a *fork* of the repo (clone under a new local name, rename freely, ignore the conflict because Phase 3 only takes the renamed NS packages with us).
2. Use temporary names during this phase (`packages/web-notate`, etc.) and rename to the final names in Phase 3 after extraction.

**Recommended**: option 1 — fork locally, rename freely.

### B. Workspace package imports

Every `import` from `@derekentringer/ns-*` or `@derekentringer/shared/ns` needs updating:

- [ ] `@derekentringer/ns-shared` → `@notate/shared` (or chosen scope per D.3)
- [ ] `@derekentringer/shared` → `@notate/shared` (same)
- [ ] `@derekentringer/shared/auth` → `@notate/shared/auth` (preserve subpath structure)
- [ ] `@derekentringer/shared/ns` → drop entirely (re-export inlined into `@notate/shared`)
- [ ] `@derekentringer/shared/token` → `@notate/shared/token`

Use `git grep -lE "@derekentringer/(ns-)?shared"` to find every file. Most updates are mechanical find-and-replace; verify type-check after.

### C. Code identifiers

Many TypeScript / Rust / Swift identifiers reference NoteSync by name:

- [ ] React component `NsLogo` → `NotateLogo`
- [ ] Tauri Rust crate name in `src-tauri/Cargo.toml`: currently `NoteSync` → `Notate`
- [ ] Mobile build-info module names
- [ ] localStorage / SecureStore keys: `ns-editor-settings` → `notate-editor-settings` (data-loss risk — see "Storage key migration" below)
- [ ] Database name (desktop SQLite): `notesync.db` / `notesync_localhost.db` (in `dbName.ts`) → `notate.db` / `notate_localhost.db`

**Storage key migration**: changing a localStorage key drops every existing user's settings. Mitigate with a one-time migration on app start: if `notate-editor-settings` is missing and `ns-editor-settings` exists, copy the value over. Same for the desktop SQLite file. *Only relevant for users who used the staging build before cutover; production users hit fresh storage on `notate.md` anyway.*

### D. UI strings

Per inventory I.1, every visible "NoteSync" string changes:

- [ ] `packages/web/index.html` — `<title>`, meta tags
- [ ] `packages/web/public/site.webmanifest` — `name`, `short_name`
- [ ] `packages/web/src/pages/LoginPage.tsx` — branding
- [ ] `packages/web/src/components/AboutDialog.tsx` (or equivalent)
- [ ] `packages/desktop/src-tauri/tauri.conf.json` — `productName`
- [ ] `packages/desktop/src-tauri/Info.plist` — usage description strings
- [ ] `packages/mobile/app.json` — `expo.name`
- [ ] Email templates (handled in Phase 1 + Phase 6)
- [ ] Copy in confirmation dialogs, toasts, error messages, etc. (`git grep "NoteSync"` finds all)

### E. Bundle identifiers

Per Phase 0 D.8 / D.9: the new identifiers are **`md.notate.app`** (prod) and **`md.notate.app.dev`** (dev variant for side-by-side installs).

- [ ] `packages/desktop/src-tauri/tauri.conf.json` → base identifier: `com.derekentringer.notesync` → `md.notate.app`
- [ ] `packages/desktop/src-tauri/tauri.dev.conf.json` → dev-override identifier: `com.derekentringer.notesync.dev` → `md.notate.app.dev`
- [ ] `packages/mobile/app.config.ts` → both prod (`md.notate.app`) and dev (`md.notate.app.dev`) branches updated
- [ ] **Critical**: bundle ID changes are non-reversible for existing app installs. Existing TestFlight / sideload installs on the old ID become orphaned. Pre-launch single-user posture means the developer just reinstalls both variants once on each device — no user comms layer required.

### F. URL constants

Every hardcoded `ns.derekentringer.com` / `ns-api.derekentringer.com` reference:

- [ ] `packages/api/src/config.ts` — defaults (`CORS_ORIGIN`, `APP_URL`)
- [ ] `packages/web/.env.production` — `VITE_API_URL`
- [ ] `packages/desktop/package.json` build scripts — `VITE_API_URL` baked into Tauri builds (per CLAUDE.md, this is set explicitly via `cross-env` in every `tauri:build*` script — must update every script)
- [ ] `packages/mobile/src/lib/devHost.ts` — `PROD_API_URL` constant
- [ ] R2 public URL: `notesync-images.derekentringer.com` → `img.notate.md`
- [ ] Email links (handled by Phase 1's Resend setup + an `APP_URL` env override)

### G. Documentation

- [ ] `CLAUDE.md` — top-to-bottom rewrite of all references (drop `ns.derekentringer.com`, `notesync-images.derekentringer.com`, `ns-api`/`ns-web`/etc. package names, `com.derekentringer.notesync` bundle ids)
- [ ] `docs/ns/**/*.md` — broad search-and-replace, then a manual review of architecture docs that may have screenshots / specific URL references

### H. Test fixtures + snapshots

- [ ] Search for "notesync" / "NoteSync" in fixture files (`*.test.ts`, `__tests__/`, `e2e/`, etc.)
- [ ] Update any snapshot tests that contain old branding text

## Verification gates

Before merging `develop-notate-rename` to a Phase 3 staging area, all of the following must pass on the renamed branch:

- [ ] `npx turbo run type-check` — every package types
- [ ] `npx turbo run test` — every package's test suite green
- [ ] `npx turbo run build` — every package builds
- [ ] Local Tauri dev build of the desktop app launches and connects to a local API
- [ ] `expo run:android` and `expo run:ios` builds succeed (no native rebuild needed unless bundle IDs changed — if they did, run `expo prebuild --platform <p> --clean` after the bundle ID update)
- [ ] Manual smoke test: log in to the local stack with the renamed apps, create a note, sync between platforms

## Done criteria

- [ ] Every checkbox in A–H above is checked
- [ ] All four verification gates pass
- [ ] No `git grep -i "notesync"` hits remain in any package source (only allowed: historical mentions in archive docs / changelog entries)
- [ ] No `git grep "@derekentringer/"` hits remain in renamed packages

## Estimated cost

Mechanical renames are tedious but low-risk. Expect 1–3 days of focused work, most of it driven by the verification gate cycle. Bundle ID changes for mobile require a native rebuild + reinstall on test devices.
