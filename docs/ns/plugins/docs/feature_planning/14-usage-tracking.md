# 14 — Usage Tracking & Abuse Prevention

**Status:** Planned
**Phase:** 1 — Plugin API Foundation
**Priority:** Medium

## Summary

Lightweight server-side tracking of AI usage per user for analytics and abuse prevention. NoteSync's paid subscription includes AI usage with no credit limits or per-operation charges. However, tracking is still needed to monitor costs, detect abuse, and inform pricing decisions.

This replaces the previously planned credit system. The subscription price provides enough margin for typical AI usage — this system exists to ensure that remains true.

## How It Works

```
User → Plugin → UsageTracker → AI Provider → Return result
                    |
                    └── Log operation type, timestamp, approximate cost
                        (no blocking, no limits for normal usage)
```

The tracker is **non-blocking** — it logs usage but does not deduct credits or reject requests. Abuse detection runs asynchronously.

## Database Schema

```sql
-- Usage log for analytics and abuse detection
CREATE TABLE ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plugin_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  estimated_cost_usd DECIMAL(8,6),     -- Approximate API cost for this operation
  metadata JSONB,                       -- e.g., { "model": "claude-sonnet-4", "tokens": 1500 }
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_usage_user_date ON ai_usage(user_id, created_at);
```

## What's Tracked

| Operation | Estimated Cost |
|---|---|
| AI chat (1 tool round) | ~$0.01 |
| AI chat (multi-tool, 3 rounds) | ~$0.03 |
| Note summarization | ~$0.005 |
| Tag generation | ~$0.005 |
| Audio transcription (per minute) | ~$0.006/min |
| Transcript structuring | ~$0.01 |
| Embedding generation (per note) | ~$0.0001 |
| Image analysis | ~$0.01 |
| Semantic search query | ~$0.0001 |

These costs are approximate and used for internal analytics, not billing.

## Abuse Prevention

Automated detection for usage patterns that significantly exceed normal behavior:

- **Rate limiting:** Existing Fastify rate-limit plugin already handles burst protection
- **Daily cost threshold:** If a user's estimated daily cost exceeds a configurable threshold (e.g., $5/day), flag for review
- **Anomaly detection:** Sudden spikes in usage compared to the user's baseline
- **Response:** Soft limit with notification ("You're using an unusually high amount of AI — please contact support if this is expected"), not hard blocking

The goal is to prevent runaway costs from scripts or abuse, not to limit normal power users.

## API Endpoints

```
GET /usage              # Current user's usage summary (admin or self)
GET /usage/daily        # Daily breakdown for cost monitoring
```

These are internal/admin endpoints — not exposed to end users in the UI. Usage data informs pricing decisions and capacity planning.

## BYOK Flow

BYOK users bypass NoteSync's AI providers entirely:

1. User configures their own API key in Settings → AI Providers
2. Requests route directly to the user's provider
3. No usage is tracked (NoteSync has no visibility into direct API calls)
4. Available on all tiers, including Free

## Tasks

- [ ] Create `ai_usage` table (migration)
- [ ] Implement `UsageTracker` service with non-blocking log
- [ ] Wrap first-party provider calls with usage logging
- [ ] Daily cost aggregation query for monitoring
- [ ] Abuse threshold alerting (configurable)
- [ ] Admin endpoint: GET /usage, GET /usage/daily
- [ ] BYOK: encrypted key storage, provider selection UI
