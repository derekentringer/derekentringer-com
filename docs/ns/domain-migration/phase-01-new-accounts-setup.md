# Phase 1 — New Accounts & Infrastructure Setup

**Status**: ✅ Complete (walkthrough finished; see § Done criteria)
**Depends on**: Phase 0 (D.5 GitHub org name, D.4 user-data decision)
**Blocks**: Phase 6 (service deployment), Phase 7 (DNS)
**Goal**: Stand up every external service account the new Notate stack will need, in parallel with the existing production environment. Nothing in this phase touches users — it's all setup work that can happen at any pace.

The principle: at the end of Phase 1, the new Railway / Cloudflare / R2 / Anthropic accounts exist, are funded, and have empty placeholder records ready to receive deploys. The actual deployments happen in Phase 6.

## Tasks

### Domain

- [x] Verify `notate.md` is registered — registrar: **nic.md**
- [x] Confirm renewal payment method is on file — auto-renew configured at nic.md
- [x] Move DNS to Cloudflare nameservers (matches existing `derekentringer.com` setup) — zone active in Cloudflare
- [x] Note the Cloudflare zone ID for later use — captured in secrets vault (not committed)

### GitHub

- [x] Create the GitHub org named per Phase 0 D.5 — slug: **`PixelPerfect-Studios-LLC`**
- [x] Create the empty `notate` repo under that org (private until launch per Phase 0) — https://github.com/PixelPerfect-Studios-LLC/notate
- [ ] Add SSH deploy key for Railway if needed (defer to Phase 6; Railway uses GitHub OAuth, no manual deploy key needed unless we're doing CI-only deploys)
- [ ] Configure branch protection on `main` (PR review optional for solo work; CI required is essential — defer until CI exists in Phase 3)
- [ ] Set up `develop` and `main` branches matching the `derekentringer-com` gitflow (defer to Phase 3 when initial code is pushed; can't create branches on an empty repo)

### Railway

- [x] Create a new Railway account *or* a new project under the existing account dedicated to Notate (decide based on whether billing should split) — **new Notate-specific account, Pro plan**
- [x] Provision a new PostgreSQL plugin (target for Phase 5 dump-restore) — provisioned inside project `notate.md`
- [x] Note the connection string for later — `DATABASE_URL` captured in secrets vault
- [ ] Add custom-domain placeholders for `notate.md` and `api.notate.md` — **deferred to Phase 6/7**; can't attach domains until web/api services exist (deployed from GitHub in Phase 6)
- [x] Pre-create env-var groups: `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, etc. (values defer to Phase 6) — **Path A: defer all env vars to Phase 6** (set on each service at deploy time; no shared variables pre-created)

### Cloudflare R2

- [x] Create new R2 bucket — **`notate-images`** created
- [x] Generate R2 API token (account ID, access key, secret) — captured in secrets vault; values become `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` in the new api env
- [x] Set up R2 public custom domain — **`img.notate.md`** bound to bucket (Order A: domain + DNS record created together via R2 Settings → Connect Domain since `notate.md` zone is in the same Cloudflare account)
- [x] Decide whether to **copy** the existing `notesync-images` bucket contents (preserves all current image links in notes) or **start fresh** and accept some 404s on old images — **copy** (overrides earlier Phase 0 decision to start fresh)

> **Decision**: copy old `notesync-images` → new `notate-images` in Phase 5 via `aws s3 sync`, and rewrite all image URLs in the new Postgres from `https://notesync-images.derekentringer.com/...` → `https://img.notate.md/...` (Phase 5 § D). With both the bucket contents and the URL strings migrated, the old `notesync-images.derekentringer.com` DNS can be left to die at cutover — no 301 redirect needed, no broken image references in the new env.

### Cloudflare (DNS / proxying)

- [x] Confirm `notate.md` zone is active in Cloudflare — confirmed via Zone ID
- [x] No DNS records yet — those go in Phase 7 (one exception: `img.notate.md` CNAME auto-created by R2 Connect Domain; web/api records still deferred)

### Resend (email)

- [x] Create a new Notate-specific Resend account (free tier per Phase 0)
- [x] Add `notate.md` as a sending domain
- [x] Add the DKIM / SPF / DMARC records to Cloudflare (DNS-only / gray cloud — never proxy mail records); domain verified
- [x] ~~Re-create email templates~~ — **deferred to Phase 2** (source-code rewrite in `packages/ns-api/src/services/emailService.ts`: subject `"Reset your NoteSync password"` → Notate, body `<h2>NoteSync</h2>` → Notate). Resend has no stored templates; HTML is constructed inline.
- [x] Generate `RESEND_API_KEY` for the new api env (scoped to `notate.md` sending access only; least privilege) — captured in secrets vault

### Anthropic (Claude)

- [x] Decide: keep using the existing API key vs. provision a fresh key — **new Notate-specific Anthropic account** (per Phase 0)
- [x] If new: capture `ANTHROPIC_API_KEY` — generated, captured in secrets vault, billing funded
- [x] Confirm the model setting (`CLAUDE_MODEL` env var) carries over — set explicitly to `claude-sonnet-4-6` on the new env (matches current prod default in `packages/ns-api/src/config.ts:85`)

### OpenAI / Whisper

- [x] Same call as Anthropic — keep existing key vs. new account — **new Notate-specific accounts for BOTH OpenAI and Groq**
- [x] Confirm Whisper provider config — **launch on OpenAI**: `WHISPER_PROVIDER=openai`, `OPENAI_API_KEY=<sk-...>` (the new Notate OpenAI key). `WHISPER_API_URL` / `WHISPER_API_KEY` / `WHISPER_MODEL` all auto-resolve to the OpenAI defaults; no override needed.
- [x] If new account: also pre-provision Groq — Groq account created, but **Groq is not accepting new dev API keys at this time**. Notate launches on OpenAI Whisper. When Groq reopens, swap is a one-flip env change: set `WHISPER_PROVIDER=groq`, replace `OPENAI_API_KEY` with the Groq key (under `WHISPER_API_KEY` or `GROQ_API_KEY`), redeploy — no code change. **Both keys captured in secrets vault** so the swap is unblocked the moment Groq reopens.

### Voyage AI (embeddings)

- [x] Same call: existing key vs. new — **new Notate-specific Voyage account** (per Phase 0)
- [x] Capture `VOYAGE_API_KEY` — captured in secrets vault; free-tier signup credits cover personal volumes for months
- [x] Confirm model — `voyage-3-lite` (currently hardcoded in `packages/ns-api/src/services/embeddingService.ts:4`); will be made env-configurable in Phase 2 § J for future-proofing

### Mobile / Desktop signing

**Decision (Phase 1)**: defer all four signing/distribution accounts until **after migration + post-migration stability testing**. Notate launches on the new domain with the same sideload / ad-hoc / unsigned distribution model as current NoteSync — no UX regression vs. today, and zero migration risk added by signing concerns. Store-launch + signing setup becomes a separate post-Phase 10 milestone (see Phase 10 § J).

- [x] **Apple Developer** ($99/yr) — **deferred**. Continue sideload-only via ad-hoc IPA + ad-hoc macOS signing. Will subscribe + notarize when ready to submit iOS to App Store.
- [x] **Android Play Console** ($25 one-time) — **deferred**. Continue sideload-only APK distribution. Will subscribe when ready to submit to Play Store.
- [x] **macOS notarization** — **deferred** (depends on Apple Developer). Current ad-hoc signing (`APPLE_SIGNING_IDENTITY=-`) carries over to Notate's macOS builds; Gatekeeper warning persists until notarization.
- [x] **Windows code signing** (~$200/yr) — **deferred**. Continue unsigned MSI/NSIS distribution. SmartScreen warning persists; user dismisses once per machine.

### Firebase Cloud Messaging (mobile push)

- [x] Per `docs/ns/mobile-parity-arch/phase-g-bg-sync.md`, Phase G isn't shipped yet — FCM isn't wired in production today (confirmed: `grep firebase|FCM|google-services` in `packages/ns-mobile/` returns zero hits). **Deferred** until Phase G actually lands.
- [x] If/when needed: create new Firebase project under a Notate-specific Google account, generate `google-services.json`, register the new Android `app.json` package id. **Defer to Phase G implementation** (whenever that ships).

## Done criteria

- [x] Every account above is created (or explicitly deferred) — Domain, Cloudflare, Railway, R2, Resend, Anthropic, OpenAI, Groq, Voyage AI, GitHub all created; signing/Firebase explicitly deferred to Phase 10 § J / Phase G respectively
- [x] Every credential the new api needs is captured in a secrets vault — *not committed to git*
- [x] No prod DNS pointed at the new accounts yet — only `img.notate.md` CNAME exists (R2 bucket-internal, points at empty bucket); apex + api records still defer to Phase 7
