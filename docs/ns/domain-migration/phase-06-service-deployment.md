# Phase 6 — Service Deployment

**Status**: 🟡 Not started
**Depends on**: Phase 1 (Railway services provisioned), Phase 3 (repo populated), Phase 4 (CI green), Phase 5 dry run (DB available)
**Blocks**: Phase 7 (DNS flip), Phase 9 (cutover)
**Goal**: deploy the new `api` and `web` services to the new Railway environment, validate end-to-end against the migrated database on a staging subdomain (`staging.notate.md`), and prove the new stack runs cleanly under load before any DNS changes.

This phase is the trial run. By the end of it, the new stack should be functionally identical to production — just on a different domain.

## Tasks

### A. Connect Railway to the new repo

- [ ] Link the new `notate` GitHub repo to the Notate Railway project
- [ ] Create the `api` service:
  - [ ] Source: `notate` repo, root directory `packages/api`, branch `main`
  - [ ] Build: Railpack (auto-detects Node)
  - [ ] Start command: `npm run db:migrate:deploy --workspace=@notate/api && npm run start --workspace=@notate/api`
  - [ ] Attach the Postgres plugin from Phase 1
- [ ] Create the `web` service:
  - [ ] Source: `notate` repo, root directory `packages/web`, branch `main`
  - [ ] Start command: `npm run start --workspace=@notate/web`
  - [ ] (Static `serve` with SPA fallback, matches existing pattern)
- [ ] Link the Postgres plugin's `DATABASE_URL` env var into `api`

### B. Environment variables

For the `api` service, mirror the existing `ns-api` env (per `CLAUDE.md` § NoteSync API):

- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` — generate fresh (don't reuse old)
- [ ] `REFRESH_TOKEN_SECRET` — generate fresh
- [ ] `CORS_ORIGIN=https://notate.md,https://staging.notate.md` (during staging; tighten to just `https://notate.md` after Phase 9)
- [ ] `DATABASE_URL` (auto from plugin)
- [ ] `OPENAI_API_KEY` (or `WHISPER_*` group per Phase 1's provider decision)
- [ ] `RESEND_API_KEY` (from Phase 1's Resend setup)
- [ ] `APP_URL=https://notate.md`
- [ ] `RP_ID=notate.md` (WebAuthn — Phase 0 D.6 callout)
- [ ] `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME=notate-images`
- [ ] `R2_PUBLIC_URL=https://img.notate.md`
- [ ] `ANTHROPIC_API_KEY`
- [ ] `VOYAGE_API_KEY`
- [ ] `CLAUDE_MODEL=claude-sonnet-4-6` (or current production value)

For the `web` service:

- [ ] `VITE_API_URL=https://api.notate.md` — *build-time*, baked into the static bundle. Set it as a Railway build-time env, not just runtime.

### C. Staging subdomain

- [ ] Add a Railway custom domain on `web` for `staging.notate.md`
- [ ] Add a Railway custom domain on `api` for `staging-api.notate.md`
- [ ] Add the matching DNS records in Cloudflare (CNAME → Railway-provided target)
- [ ] Wait for SSL certs to provision (Cloudflare + Railway both need to validate)

### D. Smoke test against staging

With Phase 5's dry-run database loaded, run end-to-end:

- [ ] Open `https://staging.notate.md` in a fresh browser profile (no cached cookies)
- [ ] Log in with a known production user (the dry-run DB carries them over)
- [ ] Verify note list loads (check sync engine SSE in the browser dev tools)
- [ ] Open a note with embedded images — verify images load from `img.notate.md`
- [ ] Create a new note, edit, verify it persists across reloads
- [ ] Test sync: open the same account on a second browser, verify new note appears
- [ ] Test password reset email — confirm Resend sends from `notate.md`
- [ ] Test WebAuthn — passkeys registered on `ns.derekentringer.com` will be rejected (this is expected; per Phase 0 D.6)
- [ ] Test audio recording flow end-to-end (upload to R2, transcription job, structured note creation)
- [ ] Run a load test if possible (Vegeta / k6 / wrk hitting `/notes` endpoints)

### E. Mobile / desktop staging override

For the iOS / Android / desktop apps to talk to staging, you can either:

- Build with `VITE_API_URL=https://staging-api.notate.md`
- Or, in dev, hand-edit `devHost.ts`'s `PROD_API_URL` constant temporarily

- [ ] Build a staging APK / IPA / DMG pointing at `staging-api.notate.md`
- [ ] Smoke-test sign-in, note CRUD, sync, audio recording on each platform

### F. Observability

- [ ] Confirm Railway logs are flowing for both services
- [ ] Set up uptime monitoring (UptimeRobot, BetterStack, etc.) hitting `https://staging.notate.md/health` and `https://staging-api.notate.md/health`
- [ ] Configure Railway alerts on deploy failures

## Verification gates

- [ ] Staging environment fully functional end-to-end on web + mobile + desktop
- [ ] No 5xx errors in Railway logs over a 24h soak period
- [ ] Sync engine SSE stays connected (no reconnect storms)
- [ ] Image upload + R2 fetch round-trips work
- [ ] Email send tests show Resend deliverability OK from `notate.md`

## Done criteria

- [ ] All A–F tasks complete
- [ ] All verification gates pass
- [ ] The staging environment is "production-ready" — only DNS prevents real users from finding it

## What does NOT happen here

- No production cutover yet (`notate.md` apex still resolves to nothing public)
- No mobile / desktop production builds shipped to test users yet (Phase 8)
- The old `ns.derekentringer.com` stack continues serving real users untouched
