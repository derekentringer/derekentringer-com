# Phase 4 — CI/CD + Tooling Parity

**Status**: ✅ Complete (CI green on first PR against the new Notate repo — https://github.com/PixelPerfect-Studios-LLC/notate/pull/1). Branch protection deferred (private repo on free plan; relying on self-discipline per the user — Notate is a paid product so the repo stays private indefinitely).
**Depends on**: Phase 3 (new repo populated)
**Blocks**: Phase 6 (deploys gated on CI green)
**Goal**: bring the new `notate` repo's CI/CD up to parity with the existing `derekentringer-com` setup, scoped to the Notate stack. Type-check + tests on every PR, build verification, dependency hygiene.

This phase is mostly copy-and-adjust from the existing `.github/workflows/` and Turborepo config.

## Tasks

### A. GitHub Actions

- [x] `.github/workflows/ci.yml` carried over from Phase 2 — single `build` job runs `npm ci` → `npm audit` → `type-check` → `build` → `lint` → `test`
- [x] `actions/setup-node@v4` with `cache: npm` provides the npm cache (no separate `actions/cache` step needed)
- [x] Triggers on PRs *and* pushes to `main` + `develop` (matches the derekentringer-com pattern)
- [ ] Branch protection on `main` — **deferred**. GitHub Free orgs can't apply branch protection rules to private repos (API returns "Upgrade to GitHub Pro or make this repository public to enable this feature"). Notate stays private per Phase 10 § H; relying on self-discipline (no merging red PRs). Revisit if the org upgrades to Team plan.

### B. Dependabot / Renovate (optional)

- [x] **Deferred** — not active in derekentringer-com today; same default carries over.

### C. Turborepo cache

- [x] `turbo.json` carried over from Phase 3 — unchanged, path-relative config still valid
- [ ] Vercel Remote Cache — **deferred** (single-developer; local cache + CI's npm cache are sufficient)

### D. Pre-commit hooks (if any)

- [x] No husky / lint-staged in derekentringer-com (`grep husky package.json` is empty, no `.husky/` dir). Nothing to mirror.

### E. Release tooling

- [x] `scripts/release.mjs` carried over in Phase 2 § A; brand/path seds rewrote `packages/ns-web` → `packages/web`, log messages updated. No leftover `ns-` / `notesync` refs (`grep -nE 'ns-|notesync|derekentringer' scripts/release.mjs` is empty).
- [x] Tag prefix unchanged (`v<semver>`).
- [x] Desktop `predev` / `tauri:version-sync*` hooks reference `packages/desktop/scripts/...` — paths regenerate from the renamed dir name.

### F. Local environment

- [x] `packages/api/.env.example` rebuilt to enumerate every env var `config.ts` actually reads — see https://github.com/PixelPerfect-Studios-LLC/notate/pull/1
- [x] `CORS_ORIGIN` default includes all Tauri origins (`tauri://localhost`, `https://tauri.localhost`, `http://tauri.localhost` for Windows)
- [x] Mobile `devHost.ts` `PROD_API_URL` updated in Phase 2 § F
- [x] Local setup documented in the new `CLAUDE.md` (kill-ports invocation + start-server order)

## Verification gates

- [x] First PR opened against the new repo's `develop` triggered CI and went green — https://github.com/PixelPerfect-Studios-LLC/notate/pull/1, merged
- [ ] CI badge in repo `README.md` — **deferred** (private repo; badge would 404 for anyone without access)
- [x] Local dev workflow matches the existing one — `npx turbo run dev` from root brings up api :3004 + web :3005; `npm run dev` from `packages/desktop` launches Tauri; `npx expo run:android` from `packages/mobile` builds mobile. All documented in the new `CLAUDE.md`.

## Done criteria

- [x] CI workflow is green on a sample PR
- [ ] Branch protection enforced on `main` — **deferred**; private repo on GitHub Free org can't apply protection rules. Self-discipline (no merging red PRs) is the practice. See § A.
- [ ] Release script smoke-tested — **deferred** to Phase 6 (the first real release happens after deploy)
- [ ] Dev environment instructions tested by a fresh clone — **deferred** to Phase 6 (real on-the-ground verification happens when we deploy + run local dev against the new prod URL)

## What does NOT happen here

No production deploy yet — Railway services remain empty placeholders from Phase 1. CI is purely repo-internal until Phase 6 wires Railway to the new repo's main branch.
