# 15 — AI Financial Insights

**Status:** Complete
**Phase:** 6 — Advanced Features
**Priority:** Medium

## Summary

Contextual AI-powered financial insights embedded throughout the existing UI — not a chat interface. Claude API analyzes financial data and surfaces actionable observations where the user already is: a collapsible dashboard card with unseen-indicator, page-level nudges, monthly/quarterly digests (permanent reports for completed periods), and smart alerts via the existing notification system. All insights are server-generated, structured via `tool_use`, and aggressively cached. Disabled by default with explicit opt-in.

## What Was Implemented

### Shared Package (`packages/shared/`)

**Types (`src/finance/types.ts`):**

- `AiInsightScope` — `"dashboard" | "budget" | "goals" | "spending" | "accounts" | "projections" | "decision-tools" | "monthly-digest" | "quarterly-digest" | "alerts"`
- `AiInsightType` — `"observation" | "recommendation" | "alert" | "celebration"`
- `AiInsightSeverity` — `"info" | "warning" | "success"`
- `AiInsight` — id, scope, type, severity, title, body, relatedPage, generatedAt, expiresAt
- `AiRefreshFrequency` — `"weekly" | "daily" | "on_data_change"`
- `AiInsightPreferences` — masterEnabled, dashboardCard, monthlyDigest, quarterlyDigest, pageNudges, smartAlerts, refreshFrequency
- `DEFAULT_AI_INSIGHT_PREFERENCES` — all features enabled but masterEnabled defaults to false
- `AiInsightPreferencesResponse`, `UpdateAiInsightPreferencesRequest`, `AiInsightsResponse`, `AiInsightsRequest` — API request/response types
- `NotificationType.AiAlert` — new notification type for AI-powered smart alerts
- `AiAlertConfig` — notification config type for AI alerts
- All notification maps updated: `NOTIFICATION_PHASES` (3), `NOTIFICATION_CATEGORIES` ("alerts"), `NOTIFICATION_LABELS`, `NOTIFICATION_DESCRIPTIONS`, `DEFAULT_NOTIFICATION_CONFIGS`

**Exports (`src/index.ts`):**

- `DEFAULT_AI_INSIGHT_PREFERENCES` exported as value
- All new AI types exported

### Finance API (`packages/finance-api/`)

#### Database Schema

3 new Prisma models:

- `AiInsightPreference` — single-row encrypted JSON blob of preferences
- `AiInsightCache` — scope + contentHash compound unique key, encrypted response, expiresAt
- `AiInsightUsage` — daily API call counter by date (YYYY-MM-DD)

Migration: `20260225030000_add_ai_insights`

#### Store Layer (`src/store/aiInsightStore.ts`)

- `getAiPreferences()` — fetch single row, decrypt, merge with defaults
- `updateAiPreferences(updates)` — merge + encrypt + upsert
- `getCachedInsights(scope, contentHash)` — lookup by compound key, check expiry
- `setCachedInsights(scope, contentHash, insights, expiresAt)` — upsert encrypted response
- `clearInsightCache(scope?)` — delete all or by scope
- `cleanupExpiredCache()` — delete expired rows (called from hourly cleanup interval)
- `getDailyUsage()` — lookup today's count
- `incrementDailyUsage()` — upsert + increment

All config and response fields encrypted with AES-256-GCM via `encryptField`/`decryptField`.

#### Context Builders (`src/store/aiContextStore.ts`)

Assembles scoped context objects for Claude API calls, reusing existing store functions:

- `buildDashboardContext()` — net worth summary, top 5 spending categories, DTI, goal progress
- `buildBudgetContext()` — active budgets + 3-month spending trend
- `buildGoalsContext()` — goal progress with projections
- `buildAccountsContext()` — active accounts with types, balances, rates
- `buildMonthlyDigestContext(month)` — category summaries, goals, net worth, budget adherence
- `buildQuarterlyDigestContext(quarter)` — 3-month trends, goal trajectories, net worth growth
- `buildAlertsContext()` — recent transaction patterns, account balances, goal status
- `buildContextForScope(scope, options)` — router function

Each builder returns `{ scope, data, contentHash }` where `contentHash = SHA-256(JSON.stringify(data))`.

#### Anthropic Service (`src/lib/anthropicService.ts`)

- Lazy-initialized `Anthropic` client using `config.anthropicApiKey`
- `INSIGHT_TOOL` — tool_use schema matching `AiInsight` fields (type, severity, title, body, relatedPage)
- `SYSTEM_PROMPT` — rules: be specific with numbers, concise, actionable, celebrate wins, no tax/legal/investment advice
- Per-scope user prompts in `SCOPE_PROMPTS` map
- `generateInsights(scope, contextData)` — calls `anthropic.messages.create()` with `tool_choice: { type: "tool", name: "record_financial_insights" }`, model: `claude-sonnet-4-20250514`
- TTL: dashboard/page nudges = 7 days, monthly/quarterly digests = 10 years (permanent for completed periods), alerts = 1 day

#### Routes (`src/routes/ai.ts`)

- `GET /ai/preferences` — returns preferences + daily usage stats
- `PUT /ai/preferences` — updates preferences (schema-validated)
- `DELETE /ai/cache` — clears cache (optional `?scope=` filter)
- `POST /ai/insights` — full pipeline:
  1. Validate scope
  2. Reject current/future periods for monthly/quarterly digests (400)
  3. Check `ANTHROPIC_API_KEY` (503 if missing)
  4. Check `masterEnabled` (403 if off)
  5. Check per-feature toggle (403 if off)
  6. Build scoped context + content hash
  7. Check cache (return immediately on hit)
  8. Check daily usage limit of 10 (429 if exceeded)
  9. Generate insights via Claude API
  10. Cache result + increment usage
- Per-route rate limit on `/insights`: `max: 3, timeWindow: "1 minute"`

#### AI Alert Evaluator (`src/lib/aiAlertEvaluator.ts`)

- `evaluateAiAlerts()` — guards: API key, master + smartAlerts enabled, notification pref, daily usage; builds "alerts" context, checks cache, generates if needed; filters for alert/warning insights; maps to `PendingNotification` with `type: NotificationType.AiAlert`, dedupeKey `ai-alert:{insightId}`

#### App Integration (`src/app.ts`)

- AI routes registered at `/ai` prefix
- `cleanupExpiredCache()` added to hourly cleanup interval

#### Notification Evaluator (`src/lib/notificationEvaluator.ts`)

- `evaluateAiAlerts()` called in `evaluateAllNotifications()` with try/catch for non-critical failure

### Finance Web (`packages/finance-web/`)

#### API Client (`src/api/ai.ts`)

- `fetchAiPreferences()` — GET /ai/preferences
- `updateAiPreferences(data)` — PUT /ai/preferences
- `fetchAiInsights(scope, options?)` — POST /ai/insights
- `clearAiCache(scope?)` — DELETE /ai/cache

#### Settings Tab (`src/components/AiInsightSettings.tsx`)

- Master toggle with privacy disclosure text
- Per-feature toggles (disabled when master is off): Dashboard card, Monthly digest, Quarterly digest, Page-level insights, AI-powered alerts
- Refresh frequency selector: Weekly / Daily / On data change
- Usage stats badge ("X of Y daily requests used")
- Clear cache button
- Uses `Brain` icon from lucide-react

**Settings page integration (`src/pages/SettingsPage.tsx`):**
- `"ai-insights"` added to tab routing

#### Dashboard Insights Card (`src/components/dashboard/AiInsightCard.tsx`)

- Collapsible card, **collapsed by default**
- Count badge showing number of insights
- **Unseen indicator** — pulsing red dot appears when new insights haven't been viewed; tracked via `localStorage` (`ai-insights-seen-ids`); expanding the card marks all current insights as seen; new insights (different IDs) re-trigger the indicator
- Severity-colored left borders, type icons (Eye/Lightbulb/AlertTriangle/PartyPopper)
- Renders nothing if AI disabled, skeleton while loading, silently fails on error

**Dashboard integration (`src/pages/DashboardPage.tsx`):**
- `<AiInsightCard />` placed after KPI grid

#### Reports / Digests (`src/components/reports/AiDigest.tsx`)

- Props: `type: "monthly" | "quarterly"`
- **Defaults to last completed period** (previous month / previous quarter)
- Period navigator with prev/next buttons; **next button disabled at most recent completed period** — users cannot navigate into current or future periods
- Fetches insights with scope `"monthly-digest"` or `"quarterly-digest"` + period param
- If AI disabled: shows message with link to Settings > AI Insights
- Footer disclaimer: "AI-generated insights — not professional financial advice"

**Reports page (`src/pages/ReportsPage.tsx`):**
- Complete rewrite from placeholder to tab-routed: `"monthly"` (default) | `"quarterly"`
- Uses `TabSwitcher` component with `useParams`/`useNavigate`

**Route (`src/App.tsx`):**
- Changed from `path="reports"` to `path="reports/:tab?"`

#### Page-Level Nudges (`src/components/AiInsightBanner.tsx`)

- Props: `scope: AiInsightScope`
- Checks preferences first (master + pageNudges toggle)
- Shows max 2 insights, dismissible (X button, session-only via state Set)
- Compact: icon + title + body + AI badge, border-left colored by severity
- Silently fails on error (nudges are non-critical)

**Page integrations:**
- `BudgetsPage.tsx` — `<AiInsightBanner scope="budget" />`
- `GoalsPage.tsx` — `<AiInsightBanner scope="goals" />`

#### Navigation Order (`src/components/Sidebar.tsx`)

Updated sidebar order: Goals, Bills, Budgets (previously: Budgets, Bills, Goals) and Decision Tools above Reports.

## Key Decisions

- **No chat** — contextual insights deliver more value with fewer API calls than a chat interface
- **Server-side only** — Claude API calls happen in `finance-api`, never client-side
- **Structured output via `tool_use`** — Claude returns typed JSON, not free-form text
- **Content-hash caching** — SHA-256 of assembled context; same data = cache hit = zero API calls
- **Permanent digest reports** — monthly/quarterly digests are generated only for completed periods and cached with a 10-year TTL; once generated they never change, providing a stable historical record
- **Future period restriction** — both frontend (disabled next button) and backend (400 rejection) prevent generating digests for current or future periods
- **Single-row preferences** — one encrypted JSON blob (single-user app)
- **Model: `claude-sonnet-4-20250514`** — best cost/quality balance for all scopes
- **Dashboard card collapsed by default** — reduces visual noise; unseen indicator (red dot) draws attention when new insights are available
- **Privacy** — context builders send only category-level summaries and amounts, never raw transaction descriptions

## New Files

| # | File | Purpose |
|---|------|---------|
| 1 | `packages/finance-api/src/store/aiInsightStore.ts` | Preference CRUD, cache CRUD, usage tracking |
| 2 | `packages/finance-api/src/store/aiContextStore.ts` | Scoped context builders for each insight scope |
| 3 | `packages/finance-api/src/lib/anthropicService.ts` | Claude API integration with tool_use |
| 4 | `packages/finance-api/src/lib/aiAlertEvaluator.ts` | AI alert evaluation for notification scheduler |
| 5 | `packages/finance-api/src/routes/ai.ts` | Route module: preferences, insights, cache endpoints |
| 6 | `packages/finance-web/src/api/ai.ts` | Frontend API client for AI endpoints |
| 7 | `packages/finance-web/src/components/AiInsightSettings.tsx` | Settings tab component |
| 8 | `packages/finance-web/src/components/dashboard/AiInsightCard.tsx` | Dashboard insights card (collapsible, unseen indicator) |
| 9 | `packages/finance-web/src/components/reports/AiDigest.tsx` | Monthly/quarterly digest renderer |
| 10 | `packages/finance-web/src/components/AiInsightBanner.tsx` | Reusable page-level nudge banner |

## Modified Files

| # | File | Changes |
|---|------|---------|
| 1 | `packages/shared/src/finance/types.ts` | AI insight types + AiAlert notification type |
| 2 | `packages/shared/src/index.ts` | Export new AI types and constants |
| 3 | `packages/finance-api/prisma/schema.prisma` | 3 new models |
| 4 | `packages/finance-api/src/app.ts` | Register AI routes + cache cleanup |
| 5 | `packages/finance-api/src/lib/notificationEvaluator.ts` | Call evaluateAiAlerts() |
| 6 | `packages/finance-web/src/pages/SettingsPage.tsx` | Add ai-insights tab |
| 7 | `packages/finance-web/src/pages/DashboardPage.tsx` | Add AiInsightCard |
| 8 | `packages/finance-web/src/pages/ReportsPage.tsx` | Tab-routed monthly/quarterly digests |
| 9 | `packages/finance-web/src/App.tsx` | Update reports route to `reports/:tab?` |
| 10 | `packages/finance-web/src/pages/BudgetsPage.tsx` | Add AiInsightBanner |
| 11 | `packages/finance-web/src/pages/GoalsPage.tsx` | Add AiInsightBanner |
| 12 | `packages/finance-web/src/components/Sidebar.tsx` | Reorder nav: Goals/Bills/Budgets, Decision Tools above Reports |

## Deferred

- **Chat interface** — may be revisited as an optional addition, but contextual insights are the primary interface
- **Additional page nudges** — Accounts, Projections, Decision Tools pages can add `<AiInsightBanner>` incrementally
- **Scheduled digest generation** — currently on-demand; could add a cron job to pre-generate at month/quarter end
