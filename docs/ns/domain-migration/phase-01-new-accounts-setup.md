# Phase 1 — New Accounts & Infrastructure Setup

**Status**: 🟡 Not started
**Depends on**: Phase 0 (D.5 GitHub org name, D.4 user-data decision)
**Blocks**: Phase 6 (service deployment), Phase 7 (DNS)
**Goal**: Stand up every external service account the new Notate stack will need, in parallel with the existing production environment. Nothing in this phase touches users — it's all setup work that can happen at any pace.

The principle: at the end of Phase 1, the new Railway / Cloudflare / R2 / Anthropic accounts exist, are funded, and have empty placeholder records ready to receive deploys. The actual deployments happen in Phase 6.

## Tasks

### Domain

- [ ] Verify `notate.md` is registered (registrar: GoDaddy / Cloudflare Registrar / etc.)
- [ ] Confirm renewal payment method is on file
- [ ] Move DNS to Cloudflare nameservers (matches existing `derekentringer.com` setup)
- [ ] Note the Cloudflare zone ID for later use

### GitHub

- [ ] Create the GitHub org named per Phase 0 D.5
- [ ] Create the empty `notate` repo under that org (private until launch per Phase 0)
- [ ] Add SSH deploy key for Railway if needed
- [ ] Configure branch protection on `main` (PR review optional for solo work; CI required is essential)
- [ ] Set up `develop` and `main` branches matching the `derekentringer-com` gitflow

### Railway

- [ ] Create a new Railway account *or* a new project under the existing account dedicated to Notate (decide based on whether billing should split)
- [ ] Provision a new PostgreSQL plugin (target for Phase 5 dump-restore)
- [ ] Note the connection string for later
- [ ] Add custom-domain placeholders for `notate.md` and `api.notate.md` (DNS not pointed yet — happens in Phase 7)
- [ ] Pre-create env-var groups: `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, etc. (values defer to Phase 6)

### Cloudflare R2

- [ ] Create new R2 bucket — naming per the new convention (e.g. `notate-images`)
- [ ] Generate R2 API token (account ID, access key, secret) — these become `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` in the new ns-api env
- [ ] Set up R2 public custom domain (e.g. `img.notate.md`) — DNS pointed in Phase 7
- [ ] Decide whether to **copy** the existing `notesync-images` bucket contents (preserves all current image links in notes) or **start fresh** and accept some 404s on old images

> **Hard recommendation**: copy. Existing notes contain `![](https://notesync-images.derekentringer.com/...)` markdown references that would 404 forever otherwise. The R2 copy is a one-time `aws s3 sync` + a 301 redirect strategy.

### Cloudflare (DNS / proxying)

- [ ] Confirm `notate.md` zone is active in Cloudflare
- [ ] No DNS records yet — those go in Phase 7

### Resend (email)

- [ ] Create a new Resend account or new project under existing
- [ ] Add `notate.md` as a sending domain
- [ ] Add the DKIM / SPF / DMARC records to Cloudflare (resends will email this)
- [ ] Re-create email templates: password reset, welcome, etc., with "Notate" branding
- [ ] Generate `RESEND_API_KEY` for the new ns-api env

### Anthropic (Claude)

- [ ] Decide: keep using the existing API key (cheaper, simpler) vs. provision a fresh key under a Notate-specific Anthropic console account (cleaner billing audit)
- [ ] If new: capture `ANTHROPIC_API_KEY`
- [ ] Confirm the model setting (`CLAUDE_MODEL` env var) carries over

### OpenAI / Whisper

- [ ] Same call as Anthropic — keep existing key vs. new account
- [ ] Confirm Whisper provider config: `WHISPER_PROVIDER` (openai / groq / custom), `WHISPER_API_URL`, `WHISPER_API_KEY`, `WHISPER_MODEL`
- [ ] If new account: also pre-provision Groq if that's the intended provider

### Voyage AI (embeddings)

- [ ] Same call: existing key vs. new
- [ ] Capture `VOYAGE_API_KEY`

### Mobile / Desktop signing

- [ ] **Apple Developer**: an iOS App Store submission requires a paid Apple Developer account ($99/yr). Sideload-only via ad-hoc IPA continues to work without it. Decision: keep sideload-only (current state) or invest in App Store path.
- [ ] **Android Play Console**: $25 one-time. Same call.
- [ ] **macOS notarization**: requires the Apple Developer account too. Current state is ad-hoc signing (`APPLE_SIGNING_IDENTITY=-`); notarization is a future polish item.
- [ ] **Windows code signing**: certificates start at ~$200/yr; current state is unsigned (SmartScreen warning). Keep unsigned for personal use unless distribution scales.

> Recommendation: defer all paid signing accounts until **after** the migration. Ship sideload-only on the new domain first.

### Firebase Cloud Messaging (mobile push)

- [ ] Per `docs/ns/mobile-parity-arch/phase-g-bg-sync.md`, Phase G isn't shipped yet — FCM isn't wired in production today. Defer the FCM setup until Phase G actually lands.
- [ ] If/when needed: create new Firebase project under a Notate-specific Google account, generate `google-services.json`, register the new Android `app.json` package id.

## Done criteria

- [ ] Every account above is created (or explicitly deferred)
- [ ] Every credential the new ns-api needs is captured in a secrets vault (1Password, Bitwarden, Railway secrets, etc.) — *not committed to git*
- [ ] No DNS pointed at the new accounts yet (cutover-readiness without commitment)
