# Phase 4 — CI/CD + Tooling Parity

**Status**: 🟡 Not started
**Depends on**: Phase 3 (new repo populated)
**Blocks**: Phase 6 (deploys gated on CI green)
**Goal**: bring the new `notate` repo's CI/CD up to parity with the existing `derekentringer-com` setup, scoped to the Notate stack. Type-check + tests on every PR, build verification, dependency hygiene.

This phase is mostly copy-and-adjust from the existing `.github/workflows/` and Turborepo config.

## Tasks

### A. GitHub Actions

The current `derekentringer-com` workflow at `.github/workflows/ci.yml` runs `type-check` + `build` on PRs and pushes to `main`. Mirror that for `notate`:

- [ ] Create `.github/workflows/ci.yml` with jobs:
  - [ ] `install` — checkout, setup-node 20.x, `npm ci`
  - [ ] `type-check` — `npx turbo run type-check`
  - [ ] `test` — `npx turbo run test`
  - [ ] `build` — `npx turbo run build`
- [ ] Configure caching (`actions/cache` for `node_modules` + Turborepo cache)
- [ ] Trigger on: PRs to `develop` and `main`, pushes to `main`
- [ ] Branch protection on `main`: require CI green before merge

### B. Dependabot / Renovate (optional)

- [ ] Decide whether to enable automated dep updates (defer if not active on `derekentringer-com` today)

### C. Turborepo cache

- [ ] Existing `turbo.json` carries over from Phase 3 — confirm cache invalidation rules still make sense
- [ ] Optional: hook up Vercel Remote Cache for shared CI cache (free tier OK for small team)

### D. Pre-commit hooks (if any)

- [ ] Check `derekentringer-com` for husky / lint-staged config; mirror if present

### E. Release tooling

The `npm run release` script at the `derekentringer-com` root handles ns-web `package.json` bumps + git tag + main→develop sync. It needs adapting:

- [ ] Copy `scripts/release.sh` (or whatever filename) to the new repo
- [ ] Update package paths from `packages/ns-web` to `packages/web`
- [ ] Update tag-prefix conventions if any (currently `v<semver>`)
- [ ] Confirm the `predev` Tauri version-sync hook still works in the new layout (`packages/desktop/scripts/...`)

### F. Local environment

- [ ] Update `packages/api/.env.example` with new domain defaults (`CORS_ORIGIN=http://localhost:3005,http://localhost:3006,tauri://localhost,https://tauri.localhost,http://tauri.localhost`)
- [ ] Update mobile `devHost.ts` `PROD_API_URL` (per Phase 2 task F, but verify here once more)
- [ ] Document the local setup in the new `CLAUDE.md` (kill ports, start servers in order)

## Verification gates

- [ ] First PR opened against the new repo's `develop` triggers CI and goes green
- [ ] CI badge in repo `README.md` (optional)
- [ ] Local dev workflow matches the existing one — `npx turbo run dev` from the root brings up api + web; `npm run dev` from the desktop package launches Tauri; `npx expo run:android` builds mobile

## Done criteria

- [ ] CI workflow is green on a sample PR
- [ ] Branch protection enforced on `main`
- [ ] Release script smoke-tested (in dry-run / branch sandbox if possible)
- [ ] Dev environment instructions tested by a fresh clone

## What does NOT happen here

No production deploy yet — Railway services remain empty placeholders from Phase 1. CI is purely repo-internal until Phase 6 wires Railway to the new repo's main branch.
