# 15 — AI Financial Insights

**Status:** Not Started
**Phase:** 6 — Advanced Features
**Priority:** Medium

## Summary

Contextual AI-powered financial insights embedded throughout the existing UI — not a chat interface. Claude API analyzes financial data and surfaces actionable observations where the user already is: dashboard cards, page-level nudges, monthly/quarterly digests, and smart alerts via the existing notification system. All insights are server-generated, structured via tool_use, and aggressively cached.

## Why not chat?

A chat interface is low ROI for a single-user finance app:
- Users don't know what to ask — most messages would be "how am I doing?" which the dashboard already answers
- Every message is a full API call with mostly the same context
- It's a separate destination competing with already-structured pages (projections, decision tools, goals)
- Contextual insights deliver more value with fewer API calls by meeting the user where they are

Chat may be revisited later as an optional addition, but should not be the primary interface.

## Requirements

### 1. Dashboard Insights Card

A card alongside existing KPIs with 2-3 AI-generated observations, refreshed weekly or when underlying data changes:

- "Your dining spending is up 23% vs. last month — $180 over budget"
- "You're $400 ahead on your down payment goal"
- "You have $8k in checking earning 0% — consider moving to HYS"
- "Your DTI ratio dropped below 30% — you're in a strong position"

**Scope context:** Account balances, monthly income/spending totals, goal progress, DTI, budget vs. actual.

### 2. Monthly & Quarterly Digests (Reports tab)

Generated reports in the Reports page — one API call each, cacheable for the entire period:

**Monthly digest:**
- Month-over-month spending comparison by category
- Progress on all active goals
- Net worth trend commentary
- Notable transactions or anomalies
- 2-3 specific action items for next month

**Quarterly digest:**
- Quarter-over-quarter trends in income, spending, savings rate
- Goal trajectory analysis (on track, ahead, behind)
- Net worth growth summary with milestone callouts
- Seasonal spending patterns
- Strategic recommendations for the next quarter

**Scope context:** Transaction summaries by category (current + prior periods), goal progress snapshots, net worth history, budget adherence.

### 3. Page-Level Nudges

Small inline insight banners on existing pages, generated when the page loads (cached):

- **Budgets page:** "You've been under budget on groceries for 3 months — consider lowering it and redirecting $150/mo to savings"
- **Goals page:** "At your current pace, you'll hit your emergency fund 2 months early"
- **Accounts page:** "Your HYS rate dropped from 4.5% to 4.0% last statement — check if better options exist"
- **Decision Tools:** "Based on your accounts, paying down the car loan saves you $2,400 over keeping HYS"
- **Projections page:** "Your net income projection shows a surplus — consider increasing 401k contributions"

**Scope context:** Page-specific data only (budgets page sends budget + category spending, goals page sends goal progress, etc.).

### 4. AI-Powered Smart Alerts (existing notification system)

Leverages the existing notification infrastructure (bell icon, preferences, polling):

- **Anomaly detection:** "Your electric bill was $80 higher than usual"
- **Pattern recognition:** "You tend to overspend the first week after payday"
- **Opportunity spotting:** "Your emergency fund hit 6 months — consider redirecting contributions to your investment goal"
- **Cross-account insights:** "Your savings rate has been declining for 3 months"

**Scope context:** Recent transactions, historical patterns, account balances, goal status.

## Technical Architecture

### API Endpoint

```
POST /ai/insights
{
  "scope": "dashboard" | "budget" | "goals" | "spending" | "accounts" | "projections" | "decision-tools" | "monthly-digest" | "quarterly-digest" | "alerts"
}
```

Each scope has a tailored context builder that assembles only the relevant data, keeping token usage minimal.

### Scoped Context Builders

| Scope | Data assembled | Approx. tokens |
|-------|---------------|----------------|
| `dashboard` | Balances, monthly totals, goal progress, DTI | Small |
| `budget` | Category spending + budgets, 3-month trend | Small |
| `goals` | Goal progress, projections, contributions | Small |
| `monthly-digest` | Category summaries, goals, net worth, notable txns | Medium |
| `quarterly-digest` | 3-month trends, goal trajectories, net worth growth | Medium |
| `alerts` | Recent transactions, historical patterns, balances | Medium |

### Structured Output via tool_use

Claude returns structured JSON (not free-form text) that maps directly to existing UI components:

```ts
interface AiInsight {
  id: string;
  scope: string;
  type: "observation" | "recommendation" | "alert" | "celebration";
  severity: "info" | "warning" | "success";
  title: string;
  body: string;
  relatedPage?: string;   // deep link to relevant page
  generatedAt: string;
  expiresAt: string;
}
```

### Caching Strategy

- **Hash input data** — generate a content hash of the assembled context
- **Cache in DB** — `AiInsightCache` table with scope, content hash, response, created_at, expires_at
- **TTL by scope:**
  - Dashboard: 7 days or until balance/transaction change
  - Page nudges: 7 days
  - Monthly digest: until next month
  - Quarterly digest: until next quarter
  - Alerts: 1 day
- **Cache hit path:** Most page loads hit cache, not the API

### Rate Limiting

- 10 fresh insight requests per day (cache hits don't count)
- Burst limit: 3 per minute
- Digest generation: 1 per period (monthly/quarterly)

### Privacy & Disclosure

- AI insights disabled by default — explicit opt-in in Settings
- "AI Insights" toggle in Settings with clear description of what data is sent
- All insights display a subtle "AI-generated" badge
- Disclaimer: "AI-generated insights — not professional financial advice"
- No raw transaction descriptions sent to API — only category-level summaries and amounts
- All API calls server-side (finance-api), never client-side

## Frontend Components

- **`<AiInsightCard>`** — Reusable card for dashboard and page nudges, handles loading/cached/empty/error states
- **`<AiDigest>`** — Full-page digest renderer for Reports tab (monthly/quarterly tabs)
- **`<AiInsightBanner>`** — Inline banner variant for page-level nudges
- Settings toggle: "Enable AI Insights" in Settings > Preferences

## Implementation Order

1. **Dashboard insights card** — highest visibility, proves the concept, validates caching
2. **Monthly & quarterly digests in Reports** — high value, predictable call pattern, easy cache
3. **Page-level nudges** — budget + goals pages first, then expand
4. **Smart alerts via notifications** — leverages existing notification infrastructure

## Dependencies

- [07 — Budgeting & Expense Tracking](07-budgeting-expense-tracking.md) — spending data for analysis
- [08 — Bill Management](08-bill-management.md) — bills context for advice
- [09 — Net Income Projections](09-net-income-projections.md) — income context
- [12 — Financial Goal Planning](12-financial-goal-planning.md) — goals context for recommendations
- [12 — Notification System](12-notification-system.md) — alert delivery infrastructure
- [13 — Investment Portfolio Analysis](../features/13-investment-portfolio-analysis.md) — portfolio context
- [14 — Financial Decision Tools](../features/14-financial-decision-tools.md) — decision context

## Open Questions

- Anthropic API key management — env var on Railway, same pattern as existing secrets
- Model selection — Claude Haiku for cost efficiency on simple scopes, Sonnet for digests?
- Should digests be auto-generated on schedule or on-demand with cache?
- Notification preference: new `NotificationType.AiAlert` or reuse existing types?
