# Phase 3 — Monorepo Extraction

**Status**: 🟡 Not started
**Depends on**: Phase 1 (GitHub repo created), Phase 2 (rename verified)
**Blocks**: Phase 4 (CI), Phase 6 (deploy)
**Goal**: lift the four renamed NS packages plus their share of `packages/shared` out of the local fork and into the new `notate` repo, with a clean root-level `package.json` / `turbo.json` / `tsconfig.json` and zero references back to the old monorepo.

This phase is fundamentally a `cp -r` exercise wrapped in workspace + tooling adjustments. Most of the friction is in the shared-package split.

## Pre-extraction checklist

- [ ] Phase 2's `develop-notate-rename` branch passes all four verification gates
- [ ] Phase 1's empty `notate` repo exists on GitHub with `main` + `develop` branches
- [ ] Decide whether to preserve git history (`git filter-repo` to extract subtrees) or start fresh (`git init` in the new repo)

> **Recommendation**: start fresh. Preserving history across a cross-repo move adds a lot of complexity for limited value on a personal project. The renamed monorepo can stay as a tag for archival reference if needed.

## Tasks

### A. Bootstrap the new repo

- [ ] `git clone` the empty `notate` repo locally
- [ ] Copy from the renamed monorepo into the new repo:
  - [ ] `packages/api/`
  - [ ] `packages/web/`
  - [ ] `packages/desktop/`
  - [ ] `packages/mobile/`
  - [ ] `packages/shared/` (with the prune below applied)
- [ ] Copy root config:
  - [ ] `package.json` — strip workspaces glob to just `packages/*`, drop scripts that referenced `fin-*` / portfolio packages, drop unrelated dev-deps
  - [ ] `turbo.json` — keep as-is (its config is path-relative)
  - [ ] `tsconfig.json` (or `tsconfig.base.json`) — keep
  - [ ] `.gitignore` — keep
  - [ ] `.eslintrc` / `eslint.config.*` — keep
  - [ ] `.prettierrc` (if any) — keep
- [ ] Drop `CLAUDE.md` from the root (the new repo gets a fresh, scoped `CLAUDE.md` covering only the Notate stack — see task D below)
- [ ] Remove the `.github/` workflows for portfolio-only jobs; keep / rewrite the NS-relevant ones (Phase 4 covers this)

### B. Shared package prune

Per Phase 0 D.7, the new `packages/shared` should drop:

- [ ] `src/auth/pinVerify.ts` (and the `./auth/pinVerify` export entry)
- [ ] `src/finance/` directory (and the `./finance` export entry)
- [ ] `src/ns/` directory (re-exports from `ns-shared`) — instead, **inline** the contents of `packages/ns-shared/` into `packages/shared/src/ns/types.ts` directly, then drop the `./ns` subpath entirely so consumers import from `@notate/shared` at the top level

After the prune, verify:

- [ ] `packages/shared/package.json` `exports` map matches what's actually present
- [ ] No package imports a removed subpath
- [ ] `tsc --noEmit` clean from the shared package outward

### C. Workspace-internal package names

Match Phase 0 D.3 decision. If `@notate/*`:

- [ ] Each package's `package.json` `name` field becomes `@notate/api`, `@notate/web`, `@notate/desktop`, `@notate/mobile`, `@notate/shared`
- [ ] Update all internal `dependencies` / `devDependencies` references between workspace packages
- [ ] If the npm scope `@notate` is unavailable, fall back to `@notate-app/*` or another scope from Phase 0

### D. New root-level `CLAUDE.md`

- [ ] Write a fresh `CLAUDE.md` covering only the Notate stack — drop the `derekentringer-com` portfolio sections, the fin-* sections, the NoteSync history references
- [ ] Preserve relevant operational notes: dev-server startup, release flow, build commands, Railway deployment specifics
- [ ] Update domain references throughout (`notate.md`, `api.notate.md`, `images.notate.md`)

### E. Re-anchor docs

- [ ] Copy `docs/ns/` → `docs/` in the new repo (drop the `ns/` namespace since it's the only product)
- [ ] Update internal cross-references in docs (`../web/docs/...` paths shift)
- [ ] Update the `domain-migration/` directory itself with a "this migration is complete" status block once Phase 9 finishes — the doc set lives on as historical record

### F. Initial commit + push

- [ ] `git add . && git commit -m "Initial commit: Notate, extracted from derekentringer-com monorepo"`
- [ ] `git push origin main`
- [ ] Create the `develop` branch and set it as the default
- [ ] All future Phase 4+ work happens on feature branches into `develop`

## Verification gates

- [ ] `npm install` from the new repo root succeeds
- [ ] `npx turbo run type-check` passes
- [ ] `npx turbo run test` passes
- [ ] `npx turbo run build` passes
- [ ] Desktop app builds locally (`packages/desktop && npm run tauri:build`)
- [ ] Mobile app builds locally (`packages/mobile && npx expo run:android`)

## Done criteria

- [ ] All A–F tasks complete
- [ ] All verification gates green
- [ ] The new repo's CI (Phase 4) is the only remaining gate before deploy is possible

## What does NOT happen in this phase

- No DNS changes (Phase 7)
- No data migration (Phase 5)
- No production deploys (Phase 6)
- No client app re-signing or re-distribution (Phase 8)

The new repo exists, builds, tests pass, and is sitting on GitHub waiting for the rest of the migration to catch up.
