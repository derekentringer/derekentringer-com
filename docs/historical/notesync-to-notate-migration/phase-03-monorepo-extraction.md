# Phase 3 — Monorepo Extraction

**Status**: ✅ Complete (pushed to https://github.com/PixelPerfect-Studios-LLC/notate as a single squashed initial commit; default branch set to `develop`)
**Depends on**: Phase 1 (GitHub repo created), Phase 2 (rename verified)
**Blocks**: Phase 4 (CI), Phase 6 (deploy)
**Goal**: lift the four renamed NS packages plus their share of `packages/shared` out of the local fork and into the new `notate` repo, with a clean root-level `package.json` / `turbo.json` / `tsconfig.json` and zero references back to the old monorepo.

This phase is fundamentally a `cp -r` exercise wrapped in workspace + tooling adjustments. Most of the friction is in the shared-package split.

## Pre-extraction checklist

- [x] Phase 2's `develop-notate-rename` branch passes all four verification gates
- [x] Phase 1's empty `notate` repo exists on GitHub with `main` + `develop` branches
- [x] Decide whether to preserve git history (`git filter-repo` to extract subtrees) or start fresh (`git init` in the new repo)

> **Recommendation**: start fresh. Preserving history across a cross-repo move adds a lot of complexity for limited value on a personal project. The renamed monorepo can stay as a tag for archival reference if needed.

## Tasks

### A. Bootstrap the new repo

**Strategy executed**: skipped the "clone empty repo + copy files in" model in favor of "rename the existing clone in place, then orphan-commit + repoint origin to the new GitHub repo." Cleaner because the post-Phase-2 clone is already the desired state.

- [x] `git clone` the empty `notate` repo locally — *N/A*: amended approach, kept the Phase-2 clone and force-pushed
- [x] Copy from the renamed monorepo into the new repo:
  - [x] `packages/api/` — already in place from Phase 2
  - [x] `packages/web/` — already in place from Phase 2
  - [x] `packages/desktop/` — already in place from Phase 2
  - [x] `packages/mobile/` — already in place from Phase 2
  - [x] `packages/shared/` — pruned per § B below
- [x] Copy root config:
  - [x] `package.json` — name flipped to `notate`; workspaces glob is `packages/*`; no fin-* scripts present
  - [x] `turbo.json` — unchanged
  - [x] `tsconfig.base.json` — unchanged
  - [x] `.gitignore` — buildInfo path updated for renamed mobile dir
  - [x] `eslint.config.*` — unchanged
  - [x] `.prettierrc` — N/A (not present)
- [x] Drop `CLAUDE.md` from the root — replaced via rewrite (functionally equivalent to drop + add)
- [x] Remove the `.github/` workflows for portfolio-only jobs — `ci.yml` simplified to `main` + `develop` triggers; no portfolio-specific jobs existed to remove

### B. Shared package prune

Per Phase 0 D.7, the new `packages/shared` should drop:

- [x] `src/auth/pinVerify.ts` (and the `./auth/pinVerify` export entry)
- [x] `src/finance/` directory (and the `./finance` export entry)
- [x] `src/ns/` directory (re-exports from `ns-shared`) — instead, **inline** the contents of `packages/ns-shared/` into `packages/shared/src/ns/types.ts` directly, then drop the `./ns` subpath entirely so consumers import from `@notate/shared` at the top level

After the prune, verify:

- [x] `packages/shared/package.json` `exports` map matches what's actually present
- [x] No package imports a removed subpath
- [x] `tsc --noEmit` clean from the shared package outward

### C. Workspace-internal package names

Match Phase 0 D.3 decision. If `@notate/*`:

- [x] Each package's `package.json` `name` field becomes `@notate/api`, `@notate/web`, `@notate/desktop`, `@notate/mobile`, `@notate/shared`
- [x] Update all internal `dependencies` / `devDependencies` references between workspace packages
- [x] If the npm scope `@notate` is unavailable, fall back to `@notate-app/*` or another scope from Phase 0

### D. New root-level `CLAUDE.md`

- [x] Write a fresh `CLAUDE.md` covering only the Notate stack — drop the `derekentringer-com` portfolio sections, the fin-* sections, the NoteSync history references
- [x] Preserve relevant operational notes: dev-server startup, release flow, build commands, Railway deployment specifics
- [x] Update domain references throughout (`notate.md`, `api.notate.md`, `img.notate.md`)

### E. Re-anchor docs

- [x] Copy `docs/ns/` → `docs/` in the new repo (drop the `ns/` namespace since it's the only product)
- [x] Update internal cross-references in docs (`../web/docs/...` paths shift)
- [ ] Update the `domain-migration/` directory itself with a "this migration is complete" status block once Phase 9 finishes — the doc set lives on as historical record (**deferred to Phase 9**)

### F. Initial commit + push

- [x] `git checkout --orphan` + single squashed commit `Initial commit: Notate, extracted from derekentringer-com monorepo` (authored as `Derek Entringer <derek@notate.md>` after per-repo identity flip)
- [x] `git push origin main` (force-push to replace GitHub's auto-init README stub)
- [x] Create the `develop` branch and set it as the default — both branches point at the same initial commit
- [ ] All future Phase 4+ work happens on feature branches into `develop` (work-in-progress)

## Verification gates

- [x] `npm install` from the new repo root succeeds
- [x] `npx turbo run type-check` passes (6/6 packages)
- [x] `npx turbo run test` passes (1043/1044, same `AudioRecorder.integration.test.tsx` flake seen elsewhere in this codebase; standalone re-run clean)
- [x] `npx turbo run build` passes (5/5 build tasks)
- [ ] Desktop app builds locally (`packages/desktop && npm run tauri:build`) — **manual, deferred to Phase 6**
- [ ] Mobile app builds locally (`packages/mobile && npx expo run:android`) — **manual, deferred to Phase 6**

## Done criteria

- [x] All A–F tasks complete (Phase-9 historical-status block in § E + ongoing-work bullet in § F are intentionally tracked separately)
- [x] All automatable verification gates green (`type-check`, `test`, `build`); manual gates (Tauri / expo builds) deferred to Phase 6
- [x] The new repo's CI (Phase 4) is the only remaining gate before deploy is possible

## What does NOT happen in this phase

- No DNS changes (Phase 7)
- No data migration (Phase 5)
- No production deploys (Phase 6)
- No client app re-signing or re-distribution (Phase 8)

The new repo exists, builds, tests pass, and is sitting on GitHub waiting for the rest of the migration to catch up.
