# 14 — Credit System

**Status:** Planned
**Phase:** 1 — Plugin API Foundation
**Priority:** High

## Summary

Server-side metering layer that tracks AI usage for first-party plugins. Pro users get a monthly credit allowance included in their subscription. Credits are deducted per AI operation. Users can purchase additional credits or bypass the system entirely by bringing their own API keys (BYOK).

## How It Works

```
User → Plugin → CreditMeter → AI Provider
                    |
                    ├── Has credits? → Deduct → Route to provider → Return result
                    └── No credits? → Return error ("Credit limit reached")
```

The CreditMeter wraps first-party provider implementations. Community plugins that bring their own keys bypass it completely.

```typescript
// CreditMeter wraps a provider
class MeteredCompletionProvider implements CompletionProvider {
  constructor(
    private inner: CompletionProvider,    // The actual Claude/OpenAI provider
    private meter: CreditMeter,
  ) {}

  async *complete(prompt: string, options?: CompletionOptions) {
    await this.meter.deduct(userId, "completion", 1);  // Throws if insufficient
    yield* this.inner.complete(prompt, options);
  }
}

// BYOK providers are NOT wrapped — no metering
class OllamaCompletionProvider implements CompletionProvider {
  async *complete(prompt: string) {
    // Calls Ollama directly — no credits involved
    yield* callOllama(prompt);
  }
}
```

## Database Schema

```sql
-- Add to users table
ALTER TABLE users ADD COLUMN credit_balance DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN credits_included_monthly INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN credit_reset_at TIMESTAMP;

-- Usage log for auditing and analytics
CREATE TABLE credit_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plugin_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  credits_used DECIMAL(6,2) NOT NULL,
  metadata JSONB,              -- e.g., { "model": "claude-sonnet-4", "tokens": 1500 }
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_credit_usage_user_date ON credit_usage(user_id, created_at);

-- Credit purchase history
CREATE TABLE credit_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credits INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,     -- Price paid
  payment_provider TEXT,             -- "stripe", "manual", etc.
  payment_id TEXT,                   -- External payment ID
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## Credit Costs

Based on underlying API costs + margin. These are configurable per deployment.

| Operation | Credits | Approximate API Cost | Margin |
|---|---|---|---|
| AI chat (1 tool round) | 1 | ~$0.01 | ~5x |
| AI chat (multi-tool, 3 rounds) | 2 | ~$0.03 | ~3x |
| Note summarization | 1 | ~$0.005 | ~10x |
| Tag generation | 1 | ~$0.005 | ~10x |
| Audio transcription (per minute) | 2 | ~$0.006/min | ~15x |
| Transcript structuring | 1 | ~$0.01 | ~5x |
| Embedding generation (per note) | 0.1 | ~$0.0001 | ~50x |
| Image analysis | 1 | ~$0.01 | ~5x |
| Semantic search query | 0.1 | ~$0.0001 | ~50x |

Margins are higher on cheap operations (embeddings, tags) and lower on expensive ones (chat, transcription) to average out.

## API Endpoints

```
GET  /credits                    # Current balance, included monthly, reset date
GET  /credits/usage              # Usage history (paginated)
GET  /credits/usage/summary      # Aggregated usage by operation/plugin
POST /credits/purchase           # Purchase additional credits (Stripe integration)
```

## Monthly Reset

A cron job (or on-demand check) resets credit balances monthly:

```typescript
async function resetMonthlyCredits() {
  const now = new Date();
  await prisma.user.updateMany({
    where: { credit_reset_at: { lt: now }, credits_included_monthly: { gt: 0 } },
    data: { credit_balance: prisma.raw("credits_included_monthly"), credit_reset_at: nextMonth(now) },
  });
}
```

Unused credits do NOT roll over (simpler accounting, industry standard).

## UI Integration

### Settings Page
- Credit balance display: "42 / 100 credits remaining"
- Usage breakdown chart (by operation type)
- "Buy more credits" button
- Reset date: "Resets April 1"

### In-App Notifications
- Warning at 20% remaining: "You have 20 credits remaining this month"
- At 0: "Credit limit reached. Purchase more or bring your own API key."

### AI Assistant
- When credits exhausted, show message in chat: "You've used all your credits for this month. You can purchase more in Settings, or configure your own API key."

## BYOK Flow

Users can always bypass credits by providing their own API keys:

1. Go to Settings → AI Providers
2. Enter their own API key (e.g., OpenAI, Anthropic)
3. Select which provider to use for each capability (completion, transcription, embeddings)
4. NoteSync stores the key encrypted (same as existing `ENCRYPTION_KEY` pattern)
5. Requests route directly to the user's provider — zero credits consumed

## Competitive Comparison

| App | AI Model | Credits/Pricing | BYOK |
|---|---|---|---|
| **Notion AI** | GPT-4 | $10/user/month (unlimited) | No |
| **Mem** | GPT-4 | Included in paid plan | No |
| **Reflect** | GPT-4 | Included in paid plan | No |
| **Obsidian** | None built-in | N/A | Plugins only |
| **Cursor** | Claude/GPT | 500 fast + unlimited slow/month | Yes (own key) |
| **NoteSync** | Claude/Whisper/Voyage | Credits included + purchasable | Yes (any provider) |

NoteSync's advantage: **credits + BYOK + swappable providers**. No other note app offers all three. Cursor is the closest model (credits + BYOK) but locked to code editing.

## Tasks

- [ ] Add credit columns to users table (migration)
- [ ] Create `credit_usage` and `credit_purchases` tables
- [ ] Implement `CreditMeter` service with deduct/check/refund
- [ ] Wrap first-party providers with metered versions
- [ ] API endpoints: GET /credits, GET /credits/usage, POST /credits/purchase
- [ ] Monthly reset cron job
- [ ] Settings UI: balance display, usage chart, buy more button
- [ ] AI Assistant: credit exhaustion message
- [ ] BYOK: encrypted key storage, provider selection UI
- [ ] Stripe integration for credit purchases (future)
