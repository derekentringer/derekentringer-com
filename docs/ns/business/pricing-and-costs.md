# NoteSync — Pricing, Costs & Business Modeling

## Infrastructure Costs (Fixed)

Monthly costs regardless of user count:

| Service | Spec | Monthly Cost |
|---|---|---|
| Railway: ns-api | 0.5 vCPU, 512MB RAM | ~$15 |
| Railway: ns-web | Static serve (minimal) | ~$5 |
| Railway: PostgreSQL | 0.5 vCPU, 512MB RAM, 5GB disk | ~$16 |
| Cloudflare R2 | 10GB free tier | ~$0 |
| Resend | 3,000 emails/mo free | ~$0 |
| Domain (Cloudflare) | DNS | ~$0 |
| **Total fixed** | | **~$36/mo** |

At scale, these grow:
- 1K users: ~$60-80/mo (more RAM, CPU, disk)
- 10K users: ~$200-400/mo (auto-scaling, larger DB)
- 50K users: ~$800-1,500/mo (horizontal scaling, read replicas)

## Variable Costs Per User (AI Operations)

Costs incurred only when users use AI features:

| Operation | API Cost | Frequency (typical Pro user/mo) | Monthly Cost |
|---|---|---|---|
| AI chat completion (Sonnet 4) | ~$0.005/call | 30 calls | $0.15 |
| AI chat (multi-tool, 3 rounds) | ~$0.015/call | 10 calls | $0.15 |
| Note summarization | ~$0.005/call | 5 calls | $0.025 |
| Tag generation | ~$0.005/call | 5 calls | $0.025 |
| Audio transcription (Whisper) | $0.006/min | 60 min (2x 30min meetings) | $0.36 |
| Transcript structuring (Sonnet 4) | ~$0.01/call | 2 calls | $0.02 |
| Embedding generation (Voyage) | ~$0.0004/note | 20 notes updated | $0.008 |
| Semantic search (Voyage) | ~$0.0001/query | 30 queries | $0.003 |
| Image analysis (Claude Vision) | ~$0.01/image | 5 images | $0.05 |
| **Total AI cost per Pro user** | | | **~$0.79/mo** |

**Key insight**: A typical Pro user costs ~$0.79/mo in AI API calls. Heavy users (daily meetings, lots of chat) could reach $2-3/mo.

## Per-User Infrastructure Cost (Amortized)

| Scale | Fixed Infra | Per-User Infra | Per-User AI | Total Per-User |
|---|---|---|---|---|
| 100 users (30% active) | $36/mo | $1.20/user | $0.79/user | $1.99/user |
| 500 users (30% active) | $50/mo | $0.33/user | $0.79/user | $1.12/user |
| 1K users (25% active) | $70/mo | $0.28/user | $0.79/user | $1.07/user |
| 5K users (20% active) | $150/mo | $0.15/user | $0.79/user | $0.94/user |
| 10K users (15% active) | $300/mo | $0.20/user | $0.79/user | $0.99/user |

Note: "Per-user" = per ACTIVE user. Active = used the app that month. Free users who don't use AI cost only infrastructure (storage, sync).

## Free Tier Cost Analysis

Free users cost only infrastructure (no AI):

| Scale | Free Users | Infra Cost Per Free User | Total Free Tier Cost |
|---|---|---|---|
| 100 users, 95 free | 95 | $0.38/user (sync, storage) | $36/mo |
| 1K users, 970 free | 970 | $0.07/user | $68/mo |
| 10K users, 9,700 free | 9,700 | $0.03/user | $291/mo |

Free users are cheap because they only consume: database rows, sync bandwidth, and static file serving. No AI costs.

**Risk**: At 10K free users, you're paying ~$291/mo in infrastructure with zero revenue from them.

## Pricing Scenarios

### Scenario A: Simple Two-Tier

| Tier | Price | What's Included |
|---|---|---|
| Free | $0 | Core app, sync, 50 notes limit |
| Pro | $8/mo ($72/yr) | Unlimited notes + all AI features + 100 credits/mo |

**Break-even analysis (Scenario A):**

| Scale | Free Users | Pro Users (3% conversion) | Revenue | Cost | Profit |
|---|---|---|---|---|---|
| 100 | 97 | 3 | $24/mo | $38/mo | -$14/mo |
| 500 | 485 | 15 | $120/mo | $62/mo | +$58/mo |
| 1K | 970 | 30 | $240/mo | $94/mo | +$146/mo |
| 5K | 4,850 | 150 | $1,200/mo | $269/mo | +$931/mo |
| 10K | 9,700 | 300 | $2,400/mo | $537/mo | +$1,863/mo |

**Break-even point: ~200 total users** (at 3% conversion = 6 Pro users × $8 = $48 > ~$40 infra)

### Scenario B: Lower Price, Higher Conversion Target

| Tier | Price | What's Included |
|---|---|---|
| Free | $0 | Core app, sync, 100 notes limit |
| Pro | $5/mo ($48/yr) | Unlimited + AI + 80 credits/mo |

| Scale | Free | Pro (4%) | Revenue | Cost | Profit |
|---|---|---|---|---|---|
| 100 | 96 | 4 | $20/mo | $39/mo | -$19/mo |
| 500 | 480 | 20 | $100/mo | $66/mo | +$34/mo |
| 1K | 960 | 40 | $200/mo | $102/mo | +$98/mo |
| 5K | 4,800 | 200 | $1,000/mo | $308/mo | +$692/mo |
| 10K | 9,600 | 400 | $2,000/mo | $616/mo | +$1,384/mo |

**Break-even: ~300 total users**

### Scenario C: No Free Tier

| Tier | Price | What's Included |
|---|---|---|
| Solo | $5/mo | Core app + sync + 50 credits/mo |
| Pro | $10/mo | Unlimited + all AI + 150 credits/mo |

Without a free tier, growth is harder but every user generates revenue. Reflect and Mem use this model.

| Scale (all paid) | Solo (70%) | Pro (30%) | Revenue | Cost | Profit |
|---|---|---|---|---|---|
| 100 | 70 | 30 | $650/mo | $79/mo | +$571/mo |
| 1K | 700 | 300 | $6,500/mo | $791/mo | +$5,709/mo |

Profitable from day one, but much harder to acquire users without a free tier.

## Competitor Pricing Reference

| App | Free | Paid | AI Add-on |
|---|---|---|---|
| Obsidian | Yes (local) | $4/mo (sync) | None (plugins) |
| Notion | Yes (limited) | $8-10/mo | +$8-10/mo |
| Bear | Yes (basic) | $3/mo | None |
| Craft | Yes (limited) | $5/mo | Included |
| Reflect | No | $10/mo | Included |
| Mem | No | $9/mo | Included |
| Standard Notes | Yes | $5/mo | None |

**NoteSync positioning**: $5-8/mo with AI included (not an add-on) is competitive. The differentiator is meeting recording + transcription + agentic assistant — no competitor bundles all three.

## Free Tier Limits (Recommended)

To keep free tier costs manageable while still being useful:

| Limit | Value | Rationale |
|---|---|---|
| Notes | 50 | Enough to try, not enough to live on |
| Storage (images) | 100 MB | ~50-100 images |
| Sync devices | 2 | Web + one other |
| Audio recording | None | Pro-only (biggest AI cost) |
| AI chat | None | Pro-only |
| Search | Keyword only | Semantic search = embedding cost |
| Community plugins | Yes | Grows ecosystem |
| BYOK AI | Yes | Let power users self-serve |

**Key**: BYOK on Free is strategic — developers and power users get AI without costing NoteSync anything. They're also the most likely to convert to Pro for convenience.

## Credit Allowance Sizing

If Pro is $8/mo and AI costs ~$0.79/mo for a typical user:

| Credits Included | Covers | Cost to NoteSync | Margin |
|---|---|---|---|
| 50 credits/mo | Light user | ~$0.40 | $7.60 (95%) |
| 100 credits/mo | Typical user | ~$0.79 | $7.21 (90%) |
| 200 credits/mo | Heavy user | ~$1.58 | $6.42 (80%) |
| 500 credits/mo | Power user | ~$3.95 | $4.05 (51%) |

**Recommendation**: 100 credits/mo covers the typical user with 90% margin. Offer additional credit packs at $5 per 100 credits for heavy users.

## Decisions Needed

1. **Free tier: yes or no?** — Yes grows faster but costs money. No is profitable immediately but harder to acquire users.
2. **Note limit on free?** — 50? 100? Unlimited?
3. **Pro price?** — $5, $8, or $10/month?
4. **Credit allowance?** — 50, 100, or 200 credits/month?
5. **BYOK on free tier?** — Yes (strategic for developers) or Pro-only?
6. **Annual discount?** — 20% off ($8/mo → $77/yr) is industry standard
7. **Team tier needed?** — Or just Free + Pro?
8. **Student/education discount?** — Common in note-taking apps
