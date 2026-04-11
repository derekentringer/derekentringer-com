# NoteSync — Master Roadmap

This roadmap sequences all work across every package into the three business phases. Each item links to its detailed feature plan where one exists.

## Current State (as of April 2026)

### What's Built
- **Web app**: Full-featured — editor, AI assistant (16 tools, slash commands), audio transcription, meeting assistant, live preview, sync, search, wiki-links, version history, mermaid diagrams, image support
- **Desktop app**: Feature parity with web — offline SQLite, native CoreAudio meeting recording, ad-hoc signed universal binary
- **Mobile app**: Core CRUD only — notes, folders, tags, search, sync. No AI, no audio.
- **API**: Full REST API — auth (TOTP, passkeys, password reset), notes CRUD, sync (SSE push/pull), AI endpoints, image upload (R2), embeddings, chat history
- **Architecture diagrams**: 14 Mermaid diagrams documenting full system
- **Business docs**: Pricing model, cost analysis, 3-year projections, launch phases

### What's Missing for Launch
- Payment processing (Stripe)
- Landing page / marketing site
- Pricing page
- Terms of Service / Privacy Policy
- Onboarding flow (new user experience)
- Email verification
- Feature gating (free vs paid)

---

## Phase 1: Launch & Validation (Months 1-6)

**Goal**: Ship a sellable product. Get 500 users, 15 paying.

### Pre-Launch Sprint (Weeks 1-4)

| # | Task | Package | Effort | Depends On |
|---|---|---|---|---|
| 1.1 | Draft Terms of Service | legal | 2 hrs | — |
| 1.2 | Draft Privacy Policy | legal | 2 hrs | — |
| 1.3 | Stripe integration — checkout, webhooks, subscription management | ns-api | 3-5 days | — |
| 1.4 | Feature gating middleware — check user tier on protected routes | ns-api | 1 day | 1.3 |
| 1.5 | Free tier limits — enforce note count, disable AI/sync for free users | ns-api, ns-web | 2 days | 1.4 |
| 1.6 | Landing page — hero, features, pricing, CTA | ns-web (or separate) | 3-5 days | 1.3 |
| 1.7 | Pricing page — tier comparison, Stripe checkout links | ns-web | 1-2 days | 1.3, 1.6 |
| 1.8 | Email verification — send confirmation on register, verify endpoint | ns-api | 1-2 days | — |
| 1.9 | Onboarding flow — welcome modal, sample notes, feature hints | ns-web | 2-3 days | — |
| 1.10 | Analytics — basic event tracking (signup, upgrade, feature usage) | ns-web, ns-api | 1 day | — |

**Deliverable**: A product you can charge for with legal protection and a public-facing website.

### Launch Sprint (Weeks 4-6)

| # | Task | Package | Effort | Depends On |
|---|---|---|---|---|
| 1.11 | Beta test with 20-30 users — collect feedback | all | 1-2 weeks | 1.1-1.10 |
| 1.12 | Fix critical bugs from beta feedback | all | 1 week | 1.11 |
| 1.13 | Product Hunt launch prep — demo video, screenshots, copy | marketing | 2-3 days | 1.12 |
| 1.14 | Launch on Product Hunt | marketing | 1 day | 1.13 |
| 1.15 | Hacker News "Show HN" post | marketing | 1 day | 1.14 |
| 1.16 | Reddit posts (r/ObsidianMD, r/selfhosted, r/productivity) | marketing | 1 day | 1.14 |

### Post-Launch Iteration (Months 2-6)

| # | Task | Package | Effort | Depends On |
|---|---|---|---|---|
| 1.17 | Desktop auto-update (Tauri updater) | ns-desktop | 2-3 days | — |
| 1.18 | Desktop signed builds (Apple Developer cert, not just ad-hoc) | ns-desktop | 1-2 days | — |
| 1.19 | Onboarding improvements from user feedback | ns-web, ns-desktop | ongoing | 1.11 |
| 1.20 | Blog — "Why I built NoteSync", "NoteSync vs Obsidian", SEO pages | marketing | 1-2/month | — |
| 1.21 | Plugin developer documentation (basic — how to build a plugin) | docs | 2-3 days | — |
| 1.22 | 3-5 example community plugins (built by you, to seed ecosystem) | plugins | 1 week | 1.21 |
| 1.23 | Desktop feature: Stripe upgrade flow (in-app billing) | ns-desktop | 1-2 days | 1.3 |

### Phase 1 — NOT building

These are explicitly deferred to reduce scope:

- ❌ BYOK key management UI (Phase 2)
- ❌ Credit system / metering (Phase 3)
- ❌ CLI (Phase 2)
- ❌ Plugin marketplace (Phase 3)
- ❌ Team features (Phase 3)
- ❌ Mobile AI / audio (Phase 2)
- ❌ Plugin extraction (Phase 3)

### Phase 1 Decision Gate

| Metric | Target | Proceed if |
|---|---|---|
| Registered users | 500 | ≥ 300 |
| Paying users | 15 | ≥ 8 |
| Free→Paid conversion | 3% | ≥ 2% |
| Monthly churn (paid) | <5% | <7% |
| Community plugins | 1+ | Any organic activity |

---

## Phase 2: Growth & BYOK (Months 7-18)

**Goal**: Add BYOK tier, launch CLI, grow to 120 paying users and $866 MRR.

### BYOK Infrastructure (Months 7-9)

| # | Task | Package | Effort | Depends On |
|---|---|---|---|---|
| 2.1 | BYOK key storage — encrypted API key fields per user | ns-api | 2 days | — |
| 2.2 | Settings UI — AI Providers page (enter/manage API keys) | ns-web, ns-desktop | 2-3 days | 2.1 |
| 2.3 | Provider routing — if user has own key, bypass NoteSync AI | ns-api | 2-3 days | 2.1 |
| 2.4 | BYOK Stripe tier — $5/mo plan, same features minus NoteSync AI credits | ns-api | 1 day | 1.3, 2.1 |
| 2.5 | Pricing page update — two-tier comparison (Managed vs BYOK) | ns-web | 1 day | 2.4 |
| 2.6 | Downgrade flow — Managed → BYOK (keep sync, enter own keys) | ns-web, ns-api | 1-2 days | 2.4 |

### CLI (Months 8-12)

| # | Task | Package | Effort | Ref |
|---|---|---|---|---|
| 2.7 | CLI scaffolding — commander, tsup, ESM, config | ns-cli | 2-3 days | [CLI 00](../cli/docs/feature_planning/00-project-scaffolding.md) |
| 2.8 | CLI auth — login, logout, whoami, keychain storage | ns-cli | 2 days | [CLI 01](../cli/docs/feature_planning/01-auth.md) |
| 2.9 | CLI notes — list, get, create, edit, delete, move, tag, search | ns-cli | 3-5 days | [CLI 02](../cli/docs/feature_planning/02-notes-crud.md) |
| 2.10 | CLI folders, tags, stats | ns-cli | 1-2 days | [CLI 03](../cli/docs/feature_planning/03-folders-tags.md) |
| 2.11 | CLI AI — `ns ask` with streaming, `ns summarize`, `ns gentags` | ns-cli | 2-3 days | [CLI 05](../cli/docs/feature_planning/05-ai-assistant.md) |
| 2.12 | CLI search — keyword, semantic, hybrid modes | ns-cli | 1 day | [CLI 04](../cli/docs/feature_planning/04-search.md) |
| 2.13 | CLI npm publish — `@derekentringer/ns-cli` | ns-cli | 1 day | 2.7-2.12 |

### Mobile AI (Months 10-15)

| # | Task | Package | Effort |
|---|---|---|---|
| 2.14 | Mobile AI chat — Q&A against notes | ns-mobile | 3-5 days |
| 2.15 | Mobile audio recording — mic capture + Whisper transcription | ns-mobile | 3-5 days |
| 2.16 | Mobile meeting assistant — live transcription, related notes | ns-mobile | 3-5 days |
| 2.17 | Mobile polish — markdown rendering parity, performance | ns-mobile | ongoing |

### Growth Features (Months 7-18)

| # | Task | Package | Effort |
|---|---|---|---|
| 2.18 | Annual billing — 25% discount ($72/yr Managed, $48/yr BYOK) | ns-api, Stripe | 1 day |
| 2.19 | Student discount — 50% off with .edu email verification | ns-api | 1-2 days |
| 2.20 | Referral tracking — basic "referred by" field (no formal program) | ns-api | 1 day |
| 2.21 | Plugin dev docs — full API reference, tutorials, example repo | docs | 1 week |
| 2.22 | Plugin scaffolding CLI — `npx create-notesync-plugin` | create-notesync-plugin | 2-3 days |
| 2.23 | Blog — monthly posts, CLI announcement, BYOK announcement | marketing | ongoing |
| 2.24 | CLI transcribe — `ns transcribe recording.wav --mode meeting` | ns-cli | 2-3 days |
| 2.25 | CLI import/export — `ns notes export/import` | ns-cli | 2-3 days |

### Phase 2 Decision Gate

| Metric | Target | Proceed if |
|---|---|---|
| Paying users | 120 | ≥ 80 |
| MRR | $866 | ≥ $500 |
| BYOK adoption | 40% of paid | ≥ 20% |
| Community plugins | 10+ | ≥ 5 |
| CLI downloads | 100+ | Any traction |
| Churn | <4% | <5% |

---

## Phase 3: Ecosystem & Scale (Months 19-36)

**Goal**: Build the platform. Credit system, plugin marketplace, team features. 600 paying users, $4,490 MRR.

### Credit System (Months 19-22)

| # | Task | Package | Effort | Ref |
|---|---|---|---|---|
| 3.1 | Credit database schema — balance, usage log, purchases | ns-api | 1-2 days | [Credit System](../plugins/docs/feature_planning/14-credit-system.md) |
| 3.2 | CreditMeter service — deduct, check, refund | ns-api | 2-3 days | 3.1 |
| 3.3 | Wrap first-party AI providers with metering | ns-api | 1-2 days | 3.2 |
| 3.4 | Credit API — GET /credits, GET /credits/usage | ns-api | 1 day | 3.1 |
| 3.5 | Settings UI — credit balance, usage chart, purchase button | ns-web, ns-desktop | 2-3 days | 3.4 |
| 3.6 | Stripe credit packs — $5/100 credits purchase flow | ns-api, Stripe | 1-2 days | 3.1 |
| 3.7 | Monthly credit reset — cron job or on-demand check | ns-api | 1 day | 3.1 |
| 3.8 | Exhaustion UX — warnings, limit messaging, upgrade prompts | ns-web, ns-desktop | 1-2 days | 3.5 |

### Plugin API & Extraction (Months 20-26)

| # | Task | Package | Effort | Ref |
|---|---|---|---|---|
| 3.9 | Plugin API package — `@notesync/plugin-api` types + interfaces | ns-plugin-api | 3-5 days | [Plugin API](../plugins/docs/feature_planning/00-plugin-api-package.md) |
| 3.10 | Server plugin loader — discovery, lifecycle, Fastify contexts | ns-api | 3-5 days | [Server Loader](../plugins/docs/feature_planning/01-server-plugin-loader.md) |
| 3.11 | Hook system — events, hooks, middleware, auto-cleanup | ns-api | 3-5 days | [Hooks](../plugins/docs/feature_planning/02-hook-system.md) |
| 3.12 | Extract: Transcription plugin | ns-plugin-transcription | 3-5 days | [Transcription](../plugins/docs/feature_planning/03-transcription-plugin.md) |
| 3.13 | Extract: AI Tools plugin | ns-plugin-ai-tools | 3-5 days | [AI Tools](../plugins/docs/feature_planning/04-ai-tools-plugin.md) |
| 3.14 | Extract: Embeddings plugin | ns-plugin-embeddings | 2-3 days | [Embeddings](../plugins/docs/feature_planning/05-embeddings-plugin.md) |
| 3.15 | Extract: Image Analysis plugin | ns-plugin-image-analysis | 1-2 days | [Image](../plugins/docs/feature_planning/06-image-analysis-plugin.md) |
| 3.16 | Extract: Import/Export plugin | ns-plugin-import-export | 2-3 days | [Import/Export](../plugins/docs/feature_planning/07-import-export-plugin.md) |

### Client Plugin System (Months 24-28)

| # | Task | Package | Effort | Ref |
|---|---|---|---|---|
| 3.17 | Client plugin manager — dynamic ES module loading | ns-web, ns-desktop | 3-5 days | [Client Manager](../plugins/docs/feature_planning/08-client-plugin-manager.md) |
| 3.18 | UI Slot system — 13 injection points with ErrorBoundary | ns-web, ns-desktop | 2-3 days | [Slots](../plugins/docs/feature_planning/09-ui-slot-system.md) |
| 3.19 | Plugin settings UI — enable/disable, per-plugin config | ns-web, ns-desktop | 2-3 days | 3.17 |

### Plugin Marketplace (Months 26-30)

| # | Task | Package | Effort | Ref |
|---|---|---|---|---|
| 3.20 | Plugin directory API — list, install, uninstall, settings | ns-api | 2-3 days | [Marketplace](../plugins/docs/feature_planning/12-plugin-marketplace.md) |
| 3.21 | In-app plugin browser — search, install, manage | ns-web, ns-desktop | 3-5 days | 3.20 |
| 3.22 | CLI plugin commands — `ns plugins install/list/enable/disable` | ns-cli | 1-2 days | 3.20 |
| 3.23 | Plugin testing framework — `@notesync/plugin-testing` | ns-plugin-testing | 2-3 days | [Testing](../plugins/docs/feature_planning/11-plugin-testing.md) |
| 3.24 | Plugin scaffolding — `npx create-notesync-plugin` templates | create-notesync-plugin | 2-3 days | [Scaffolding](../plugins/docs/feature_planning/10-plugin-scaffolding.md) |
| 3.25 | Plugin directory website — public listing, READMEs, install counts | marketing | 3-5 days | 3.20 |
| 3.26 | Submission + review process — automated checks + manual review | ns-api, docs | 2-3 days | 3.20 |

### Team Features (Months 28-36, if demand)

| # | Task | Package | Effort |
|---|---|---|---|
| 3.27 | Shared workspaces — multi-user note access | ns-api, ns-web | 1-2 weeks |
| 3.28 | Team billing — per-seat pricing via Stripe | ns-api | 2-3 days |
| 3.29 | Admin panel — team member management, role assignment | ns-web | 2-3 days |
| 3.30 | SSO (SAML/OAuth) — enterprise auth | ns-api | 1 week |

### Phase 3 Milestones

| Metric | Target |
|---|---|
| Paying users | 600 |
| MRR | $4,490 |
| ARR | $54K |
| Community plugins | 50+ |
| Plugin marketplace live | Yes |
| Credit system live | Yes |
| Team features | If demand |

---

## Dependency Map

```
PHASE 1 (Launch)
  Legal (ToS, Privacy) ─────────────────────┐
  Stripe ──┬── Feature gating ── Free limits │
           └── Pricing page ── Landing page ─┤
  Onboarding ── Email verification ──────────┤
  All above ── Beta test ── Product Hunt ────┘

PHASE 2 (Growth)
  BYOK key storage ── Provider routing ── BYOK Stripe tier
  CLI scaffold ── CLI auth ── CLI notes ── CLI AI ── npm publish
  Mobile AI ── Mobile audio ── Mobile meeting assistant
  Annual billing, Student discount, Plugin dev docs

PHASE 3 (Ecosystem)
  Credit schema ── CreditMeter ── Credit API ── Credit UI
  Plugin API pkg ── Server loader ── Hook system ──┐
    ── Extract transcription ──────────────────────┤
    ── Extract AI tools ───────────────────────────┤
    ── Extract embeddings ─────────────────────────┤
    ── Extract image analysis ─────────────────────┤
    ── Extract import/export ──────────────────────┘
  Client plugin manager ── UI slots ── Plugin settings
  Plugin directory API ── In-app browser ── CLI plugins
  Plugin testing ── Plugin scaffolding ── Directory website
  Team features (conditional)
```

## Estimated Timeline

| Phase | Duration | Key Deliverable | Revenue Target |
|---|---|---|---|
| Pre-launch sprint | 4 weeks | Stripe, landing page, legal, onboarding | — |
| Phase 1 launch | Month 1 | Product Hunt, public availability | First paying customer |
| Phase 1 iteration | Months 2-6 | Polish, blog, example plugins | 15 paying, $108 MRR |
| Phase 2 BYOK | Months 7-9 | Two-tier pricing, BYOK UI | 50 paying |
| Phase 2 CLI | Months 8-12 | `ns-cli` v1.0 on npm | $500 MRR |
| Phase 2 mobile AI | Months 10-15 | Mobile AI chat + audio | 80 paying |
| Phase 2 growth | Months 12-18 | Student discount, annual, docs | 120 paying, $866 MRR |
| Phase 3 credits | Months 19-22 | Credit metering system | — |
| Phase 3 plugins | Months 20-28 | Plugin API + extract 5 built-ins | — |
| Phase 3 marketplace | Months 26-30 | In-app plugin browser | 50+ plugins |
| Phase 3 scale | Months 30-36 | Team features, enterprise | 600 paying, $4,490 MRR |
