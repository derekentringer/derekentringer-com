# NoteSync — Phased Launch Plan

## Phase 1: Launch & Validation (Months 1-6)

### Goal
Validate that people will pay for NoteSync. Get to 500 registered users and 15 paying users.

### Product

**Free tier:**
- Full local editor (CodeMirror 6, markdown, live preview, mermaid)
- Unlimited local notes
- Folders, tags, wiki-links, backlinks
- Local search (keyword)
- Community plugin ecosystem (open from day one)
- BYOK AI via community plugins (costs NoteSync nothing)

**Pro tier — $8/mo ($72/yr):**
- Everything in Free
- Cross-device sync (SSE push/pull)
- Cloud database (PostgreSQL)
- Image storage (Cloudflare R2)
- AI Assistant (chat, 16 tools, slash commands)
- Audio transcription (Whisper + Claude structuring)
- Semantic search (Voyage AI embeddings)
- Image analysis (Claude Vision)
- Meeting assistant (live transcription, catch me up, related notes)
- Version history (cloud)
- Mobile app access
- 100 AI credits/month included

**Why one paid tier (not two) in Phase 1:**
- Simplifies messaging: "Free or $8/mo, that's it"
- Reduces engineering (no credit metering, no BYOK key management)
- Validates willingness to pay at the $8 price point
- BYOK exists on Free tier via community plugins — power users aren't blocked

### User Acquisition (No Paid Ads)

| Channel | Action | Expected Users |
|---|---|---|
| **Product Hunt** | Launch with demo video, meeting transcription as hook | 100-200 signups |
| **Hacker News** | "Show HN" post — emphasize open plugin system + API-first + BYOK | 50-100 signups |
| **Reddit** | r/ObsidianMD, r/selfhosted, r/productivity, r/notetaking — position as Obsidian alternative with built-in sync + AI | 50-100 signups |
| **Dev Twitter/X** | Demo videos: meeting transcription, AI assistant, CLI | 30-50 signups |
| **Personal network** | Direct outreach to colleagues, developer friends | 20-30 signups |
| **SEO/Blog** | "Best note apps with AI", "Obsidian alternatives", "Meeting transcription apps" | Slow build (10-20/mo by month 6) |

**Target**: 500 registered users, 200 MAU, 15 paying users by month 6.

### Infrastructure Cost (Phase 1)

| Item | Monthly |
|---|---|
| Railway (API + DB + web) | $50 |
| R2 | $2 |
| AI compute (15 Pro users × $0.79) | $12 |
| Domain | $0 |
| Resend | $0 |
| **Total** | **~$64/mo** |

### Revenue (Phase 1, Month 6)

- 15 Pro users × $8/mo = **$120/mo**
- Profit: $120 - $64 = **$56/mo**
- **Status: Profitable (barely)**

### Key Metrics to Track
- Signup → activation rate (created first note)
- Free → Pro conversion rate (target: 3%)
- Pro churn rate (target: <5%/mo)
- Feature usage: which AI features drive conversions?
- Credit usage: are 100 credits enough?

### Phase 1 Milestones
- [ ] Launch on Product Hunt
- [ ] 100 registered users
- [ ] First paying customer
- [ ] 10 paying customers
- [ ] First community plugin published (not by you)
- [ ] Collect feedback: what's missing? What would make you upgrade?

### Decision Gate → Phase 2
Proceed to Phase 2 if:
- Free-to-paid conversion ≥ 2%
- Monthly churn ≤ 6%
- Users requesting BYOK or lower-priced sync-only option
- At least 3 community plugins exist

---

## Phase 2: Growth & BYOK (Months 7-18)

### Goal
Add BYOK tier to capture price-sensitive users and developers. Grow to 3,000 registered users, 120 paying users. Launch CLI.

### Product Changes

**Add BYOK tier — $5/mo ($48/yr):**
- Everything in Pro EXCEPT NoteSync-managed AI
- Sync, R2, PostgreSQL, mobile, version history — all included
- User provides their own API keys (Anthropic, OpenAI, Voyage, etc.)
- Keys stored encrypted, configured in Settings → AI Providers
- Zero AI cost to NoteSync

**Updated pricing:**

| Tier | Price | AI | Sync/Cloud |
|---|---|---|---|
| Free | $0 | BYOK only (community plugins) | No |
| Pro BYOK | $5/mo | User's own keys | Yes |
| Pro Managed | $8/mo | 100 credits included | Yes |

**Why add BYOK now:**
- Phase 1 data shows demand (users asking for it)
- Developers and power users already have API keys
- $5/mo captures users who won't pay $8 but will pay for sync
- Lower AI cost means higher margin per BYOK user

**Additional Phase 2 features:**
- CLI (`ns-cli`) — headless note management, scripting, AI queries
- Plugin developer documentation + scaffolding (`create-notesync-plugin`)
- Student discount (50% off, verified via .edu email)
- Annual billing with 25% discount
- Additional credit packs ($5 per 100 credits) for Managed users

### User Acquisition (Phase 2)

| Channel | Action | Expected Users |
|---|---|---|
| **CLI/Dev community** | "NoteSync CLI — your notes from the terminal" — HN, Dev.to, dev Twitter | 500-800 |
| **Plugin ecosystem** | Developer outreach, hackathon-style plugin contests | 200-300 |
| **SEO (compounding)** | Blog posts ranking, comparison pages | 300-500/mo by month 18 |
| **Word of mouth** | Existing users referring (no formal referral program yet) | 200-400 |
| **YouTube** | Demo videos: CLI workflows, meeting transcription, plugin development | 100-200 |
| **Student outreach** | University CS departments, student developer communities | 200-300 |

**Target**: 3,000 registered, 1,200 MAU, 120 paying users by month 18.

### Revenue Model (Phase 2, Month 18)

| Segment | Users | Price | Revenue |
|---|---|---|---|
| Managed Pro | 72 (60%) | $8/mo | $576 |
| BYOK Pro | 48 (40%) | $5/mo | $240 |
| Credit purchases | ~10 users | ~$5 avg | $50 |
| **Total** | **120** | | **$866/mo** |

### Costs (Phase 2, Month 18)

| Item | Monthly |
|---|---|
| Railway (scaled) | $120 |
| R2 | $10 |
| AI compute (72 Managed × $0.79) | $57 |
| Resend | $0 |
| **Total** | **~$187/mo** |

**Profit: $866 - $187 = $679/mo (78% margin)**

### Key Metrics to Track
- BYOK vs Managed split (hypothesis: 40/60)
- BYOK conversion rate vs Managed conversion rate
- CLI adoption rate
- Plugin ecosystem growth (# plugins, # developers)
- Credit overage purchase rate
- Student discount uptake

### Phase 2 Milestones
- [ ] BYOK tier launched
- [ ] CLI v1.0 released
- [ ] 50 paying customers
- [ ] 10+ community plugins
- [ ] First plugin by external developer
- [ ] $500/mo MRR
- [ ] Student discount program active
- [ ] Annual billing available

### Decision Gate → Phase 3
Proceed to Phase 3 if:
- 100+ paying users
- $500+ MRR
- Plugin ecosystem showing organic growth
- BYOK tier is at least 20% of paid users
- Churn ≤ 4%/mo

---

## Phase 3: Ecosystem & Scale (Months 19-36)

### Goal
Build the plugin marketplace, credit system, and scale to $4K+ MRR. Position NoteSync as a platform, not just an app.

### Product Changes

**Credit system (for Managed tier):**
- `CreditMeter` middleware wrapping first-party AI providers
- Credit balance display in Settings
- Usage history and breakdown
- Additional credit packs ($5 per 100 credits)
- Warning notifications at 20% remaining
- Graceful degradation (switch to BYOK or upgrade)

**Plugin marketplace:**
- In-app plugin browser (Settings → Plugins)
- CLI plugin management (`ns plugins install/list/enable/disable`)
- Plugin directory website
- Submission + review process
- Developer documentation site

**Potential paid plugin marketplace:**
- Revenue share: developers keep 85%, NoteSync takes 15%
- Only for premium/paid community plugins (most stay free)
- Minimum: 100 free plugins before launching paid plugins

**Team features (if demand exists):**
- Shared workspaces
- Team billing
- Admin panel
- SSO (SAML/OAuth)
- Pricing: $12/user/mo

### Revenue Model (Phase 3, Month 36)

| Segment | Users | Price | Revenue |
|---|---|---|---|
| Managed Pro | 330 (55%) | $8/mo | $2,640 |
| BYOK Pro | 270 (45%) | $5/mo | $1,350 |
| Credit purchases | ~50 users | ~$6 avg | $300 |
| Plugin marketplace | — | 15% of sales | $200 |
| **Total** | **600** | | **$4,490/mo** |

### Costs (Phase 3, Month 36)

| Item | Monthly |
|---|---|
| Railway (horizontal scaling) | $400 |
| R2 | $50 |
| AI compute (330 × $0.79) | $261 |
| Resend | $20 |
| **Total** | **~$731/mo** |

**Profit: $4,490 - $731 = $3,759/mo (84% margin)**
**ARR: ~$54K**

### Scaling Scenarios

**Conservative (600 paying users):**
- MRR: $4,490 → ARR: $54K
- Profit: $45K/year

**Moderate (1,500 paying users):**
- MRR: $11,250 → ARR: $135K
- Profit: $115K/year

**Optimistic (5,000 paying users):**
- MRR: $37,500 → ARR: $450K
- Profit: $380K/year (infra scales sublinearly)

**Obsidian-scale (50,000 paying users):**
- MRR: $375K → ARR: $4.5M
- This is where team features and enterprise pricing become critical

### Phase 3 Milestones
- [ ] Credit system live
- [ ] Plugin marketplace live
- [ ] 500 paying customers
- [ ] $4K MRR
- [ ] 50+ community plugins
- [ ] First paid community plugin
- [ ] Team features launched (if demand)
- [ ] CLI v2.0 with plugin management
- [ ] Developer conference or hackathon

---

## 3-Year Timeline

```
Month  1-3:  Build free editor distribution, prepare for launch
Month  4:    Product Hunt launch
Month  5-6:  Iterate on feedback, reach 500 users, 15 paid
Month  7-9:  Build BYOK tier, CLI v1.0
Month  10:   Launch BYOK + CLI
Month 11-12: Student discount, annual billing, 50 paid users
Month 13-15: Plugin developer docs, scaffolding CLI
Month 16-18: $500 MRR, 120 paid, 10+ community plugins
Month 19-21: Build credit system, plugin marketplace
Month 22-24: Launch marketplace, reach $2K MRR
Month 25-30: Scale, team features if demand
Month 31-36: $4K+ MRR, 600 paid users, mature ecosystem
```

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Low free-to-paid conversion (<2%) | Medium | High | Improve onboarding, add trial of Pro features, adjust pricing |
| High churn (>6%/mo) | Medium | High | User interviews, feature gap analysis, improve sync reliability |
| AI costs spike | Low | Medium | Credit overage charges, BYOK shift, Haiku for cheaper operations |
| No community plugins | Medium | Medium | Build 5-10 example plugins yourself, developer outreach, bounties |
| Competitor copies features | Medium | Low | Execution speed, community moat, API-first advantage |
| Security incident | Low | Critical | E2E encryption roadmap, security audit, bug bounty |

## What You Need Before Phase 1 Launch

1. **Polish the free editor** — It needs to stand on its own without sync/AI
2. **Landing page** — Clear positioning, demo video, pricing
3. **Onboarding flow** — First-run experience that hooks users
4. **Stripe integration** — Payment processing for Pro tier
5. **Terms of service / Privacy policy**
6. **Plugin developer docs** — Even if basic, developers need a starting point
7. **Desktop + web stable** — Both platforms reliable for daily use
8. **Test with 10-20 beta users** — Friends, colleagues, dev community contacts
