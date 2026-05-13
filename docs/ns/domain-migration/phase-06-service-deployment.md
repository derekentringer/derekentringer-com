# Phase 6 — Service Deployment

**Status**: 🟢 Services live on Railway default URLs (`*.up.railway.app`); end-to-end smoke tested. Custom domains (`notate.md`, `api.notate.md`) deferred to Phase 7.

**Live URLs**:
- api: https://api-production-99f1.up.railway.app
- web: https://web-production-335a3.up.railway.app
**Depends on**: Phase 1 (Railway services provisioned), Phase 3 (repo populated), Phase 4 (CI green), Phase 5 dry run (DB available)
**Blocks**: Phase 7 (DNS flip), Phase 9 (cutover)
**Goal**: deploy the new `api` and `web` services to the new Railway environment, validate end-to-end against the migrated database on a staging subdomain (`staging.notate.md`), and prove the new stack runs cleanly under load before any DNS changes.

This phase is the trial run. By the end of it, the new stack should be functionally identical to production — just on a different domain.

## Tasks

### A. Connect Railway to the new repo

- [x] Link the new `notate` GitHub repo to the Notate Railway project — required authorizing the Railway GitHub App in the PixelPerfect-Studios-LLC org
- [x] Create the `api` service:
  - [x] Source: `notate` repo, branch `main` (**not** `develop` — Railway's default needs flipping to match gitflow)
  - [x] **Root Directory: leave empty** (the Phase 6 doc originally said `packages/api`; that's wrong — breaks the `--workspace=` flag because npm needs to see `workspaces` config at the cwd. Root-empty + `--workspace=@notate/api` is correct.)
  - [x] Build: Railpack (auto-detects Node + workspace, runs `npm run build` from root which fans out via turbo — slow because it builds desktop + web too, harmless)
  - [x] Start command: `npm run db:migrate:deploy --workspace=@notate/api && npm run start --workspace=@notate/api` (set via dashboard initially; locked into `packages/api/railway.json` post-PR for version control)
  - [x] Attach Postgres via `DATABASE_URL=${{Postgres.DATABASE_URL}}` reference variable
- [x] Create the `web` service:
  - [x] Source: `notate` repo, branch `main`
  - [x] Root Directory empty
  - [x] Start command: `npm run start --workspace=@notate/web` (locked into `packages/web/railway.json`)
- [x] Postgres → api wiring via Railway reference variable (`${{Postgres.DATABASE_URL}}`)

> **Gotchas captured during execution**:
>
> 1. Clicking "+ New" from Railway's *workspace root* creates a brand-new project. Must click INTO the target project first, then "+ New".
> 2. Railway's default branch picker often defaults to `develop` even when the repo's GitHub default is `develop`; gitflow wants `main` here. Verify per service.
> 3. First deploy will FAIL with "No start command detected" if Start Command isn't set. Setting Root Directory to a subdir breaks the `--workspace=` flag.
> 4. Public domain port: when "Generate Domain" runs *before* the container's first successful listen, Railway picks the wrong target port (the code's fallback default, e.g., 3004 instead of Railway's injected 8080). Result: `502 Application failed to respond` until the port is corrected manually in Networking settings OR the domain is regenerated post-deploy.

### B. Environment variables

All set on the `api` service:

- [x] `NODE_ENV=production`
- [x] `JWT_SECRET` — freshly generated (not reused from old prod)
- [x] `REFRESH_TOKEN_SECRET` — freshly generated
- [x] `CORS_ORIGIN=https://${{web.RAILWAY_PUBLIC_DOMAIN}},tauri://localhost,https://tauri.localhost,http://tauri.localhost` (resolves to web's Railway URL via reference variable; updates automatically at Phase 7 cutover)
- [x] `DATABASE_URL=${{Postgres.DATABASE_URL}}` (Railway reference; uses internal `postgres.railway.internal:5432`)
- [x] `OPENAI_API_KEY` (launch on OpenAI Whisper per Phase 1; swap to Groq when their dev accounts reopen)
- [x] `RESEND_API_KEY`
- [x] `APP_URL=https://${{web.RAILWAY_PUBLIC_DOMAIN}}` (reference variable; updates at Phase 7)
- [x] `RP_ID=notate.md` (WebAuthn — set even though WebAuthn isn't wired in api yet)
- [x] `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (from secrets vault)
- [x] `R2_BUCKET_NAME=notate-images`, `R2_PUBLIC_URL=https://img.notate.md`
- [x] `ANTHROPIC_API_KEY`
- [x] `VOYAGE_API_KEY`
- [x] `CLAUDE_MODEL=claude-sonnet-4-6`, `VOYAGE_MODEL=voyage-3-lite`
- [x] `WHISPER_PROVIDER=openai` (Groq deferred per Phase 1)
- [x] `RAILWAY_CONFIG_FILE=packages/api/railway.json` (per-service config-as-code pointer)

Dismissed Railway "Suggested Variables" (all 6 are optional with sane defaults in `config.ts`): `WHISPER_MODEL`, `WHISPER_API_KEY`, `WHISPER_API_URL`, `TRANSCRIPTION_MAX_AUDIO_BYTES`, `TRANSCRIPTION_MAX_CONCURRENT_GLOBAL`, `TRANSCRIPTION_MAX_CONCURRENT_PER_USER`.

For the `web` service:

- [x] `VITE_API_URL=https://${{api.RAILWAY_PUBLIC_DOMAIN}}` — build-time, baked into the bundle; resolves to api's Railway URL via reference variable, updates at Phase 7 cutover
- [x] `RAILWAY_CONFIG_FILE=packages/web/railway.json`

### C. ~~Staging subdomain~~ — skipped (Path A)

Decision (Phase 6 walkthrough): use Railway's default `*.up.railway.app` URLs for testing instead of staging subdomains. No real users to insulate; saves two DNS records that would get torn down at Phase 7 cutover.

### D. Smoke test

Ran from CLI against the Railway default URLs:

- [x] `curl https://api-production-99f1.up.railway.app/health` → 200 `{"status":"ok"}`
- [x] `curl https://web-production-335a3.up.railway.app/` → 200 (static SPA serves)
- [x] Web bundle has correct `VITE_API_URL` baked in (`https://api-production-99f1.up.railway.app` appears in `assets/index-*.js`)
- [x] CORS preflight `OPTIONS /auth/login` from web origin → 204 with `access-control-allow-origin: https://web-production-335a3.up.railway.app`
- [ ] Real-user smoke test (log in, list notes, sync, image fetch) — **deferred** until Phase 7 wires the proper `notate.md` domain, OR the user opens the Railway URL in a browser and exercises it now (optional pre-Phase-7 check)
- [ ] Email send test (Resend deliverability from `notate.md`) — deferred until a user triggers password-reset flow
- [ ] Audio recording end-to-end (upload to R2, transcription, structured note) — deferred to manual testing

### E. ~~Mobile / desktop staging override~~ — skipped (Option 2)

Decision (Phase 6 walkthrough): Phase 8 will rebuild all clients with the final `api.notate.md` URL. No point doing it twice against `*.up.railway.app` first.

### F. Observability

- [x] Railway logs flowing for both services (`railway logs --service <name>`)
- [x] Railway built-in deploy notifications on failure (default)
- [ ] External uptime monitoring (UptimeRobot etc.) — **deferred** to post-launch milestone per Phase 6 walkthrough decision

## Verification gates

- [x] api `/health` returns 200 over the Railway public URL
- [x] web serves SPA + bundle has correct api URL baked in
- [x] CORS preflight from web → api succeeds with proper Access-Control headers
- [x] Postgres connectivity proven (api boot ran `prisma migrate deploy` cleanly with "30 migrations found; No pending migrations to apply")
- [ ] No 5xx errors in Railway logs over a 24h soak period — **measured during Phase 7 / 8 / 9** as real traffic flows
- [ ] Sync engine SSE stays connected — exercised when web client logs in (deferred)
- [ ] Image upload + R2 fetch round-trips — exercised by a user (deferred)
- [ ] Email send via Resend from `notate.md` — exercised by password-reset flow (deferred)

## Done criteria

- [x] All A–F tasks complete (E + part of D intentionally deferred per walkthrough decisions)
- [x] Automatable verification gates pass; manual gates intentionally deferred to phases where real traffic exists
- [x] Environment is "production-ready" — only DNS prevents real users from finding it

## What does NOT happen here

- No production cutover yet (`notate.md` apex still resolves to nothing public)
- No mobile / desktop production builds shipped to test users yet (Phase 8)
- The old `ns.derekentringer.com` stack continues serving real users untouched
