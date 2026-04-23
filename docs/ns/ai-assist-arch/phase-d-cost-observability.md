# Phase D — Cost & Observability

**Status**: 🟡 planned
**Branch**: `feat/ai-assist-phase-d` (off `develop-ai-assist`)
**Depends on**: none (can ship independently)
**Blocks**: nothing; enables informed scaling of A, B, and C

## Goal

Make the cost of Claude calls visible and enforce ceilings so runaway questions can't quietly burn through the Anthropic bill. Today there's no logging of token usage, no per-question cap, and no user-visible indication of cost.

## Current-state pain

From [current-state.md §9–§10](./current-state.md#9--cost--token-controls):

- No logging of `response.usage` (input/output/cached token counts).
- Each tool-use round is an independent 1,500-token call; no cumulative token budget across rounds.
- `semanticSearch` setting in `useAiSettings.ts` is declared but never read — dead code that suggests a feature was planned but never wired.
- Chat persistence debounce is 1s. During a streaming response every token triggers a re-save if debounce trailing fires.

## Design decisions

### D.1 — Log `response.usage` on every Claude call

**What to log** (structured log fields, not freeform text):

```ts
{
  event: "claude_call_complete",
  operation: "answer_with_tools" | "summarize" | "tags" | ...,
  model: "claude-sonnet-4-6",
  input_tokens: number,
  output_tokens: number,
  cache_creation_tokens: number,     // if prompt caching is ever enabled
  cache_read_tokens: number,
  round: number,                     // for multi-round tool loops
  total_rounds_so_far: number,
  duration_ms: number,
  user_id: string,                   // hashed if we're nervous about leakage
}
```

Emitted via `request.log.info()` (keeps the Fastify logger as the single log sink — no new observability stack yet).

**Why this is enough for now**: Railway's Logtail integration gives us searchable logs with structured field support. Real observability dashboards (Phase E or later) can build on this foundation.

### D.2 — Per-question cumulative token budget

**Problem**: `answerWithTools` today has a per-round `max_tokens: 1500` but no ceiling across rounds. A pathological case: Claude loops 5 rounds at 1,500 output each + 8K input each = 52K tokens for one question.

**Proposed cap**: 100,000 input tokens cumulative across all rounds of a single question. If reached, the next round is NOT invoked; Claude gets a final assistant message "This answer is getting too long. Finishing up with what I have." and the stream closes.

**Why 100K**: roughly 2x the user's current largest question footprint (active note + transcript + 5 rounds of tool results). Gives real questions headroom; cuts off runaways.

### D.3 — Wire or remove `semanticSearch` setting

The setting exists in `useAiSettings.ts:29–43` but nothing reads it. Decision (pending user): either

- **Remove**: delete the key from the interface; no UI change (it wasn't visible anyway).
- **Wire**: add a Settings toggle. When off, `search_notes` falls back to `keyword` mode regardless of Claude's requested mode.

Recommend **remove** unless there's a specific privacy or cost reason to let users disable semantic search. Hybrid mode is cheap (reuses cached embeddings) and near-strictly better.

### D.4 — Chat persistence debounce tuning

From [current-state.md §4](./current-state.md#4-chat-persistence): 1s debounce, full-replace on every change. During streaming, this can fire multiple times per second.

**Proposed change**:
- Debounce raised to 5s for mid-stream updates.
- Flush immediately on user question send (so the user's turn is always persisted even if they close the tab immediately).
- Flush immediately on streaming completion (so the final assistant message is persisted).

**Why not skip persistence during streaming entirely?** Multi-device users benefit from partial updates streaming to other devices. 5s is a reasonable compromise.

### D.5 — Per-user daily ceiling (optional, future)

Not part of this phase, but scope it out:

- Per-user cumulative Claude spend cap per day (e.g. 1M input tokens, 200K output).
- On hit: assistant returns "You've used your daily AI quota; try again tomorrow" and the settings panel shows the reset time.
- Logs + ceiling would enable this as a follow-up.

Defer to a later iteration; D.1 is the prerequisite.

## Sub-tasks

- [ ] **D.1.1** — `logClaudeUsage(log, operation, response, extraContext)` helper in `aiService.ts`.
- [ ] **D.1.2** — Call it from every Claude invocation site (completions, summary, tags, rewrite, transcript structuring, Q&A with tools).
- [ ] **D.1.3** — Unit: helper produces the expected log shape.
- [ ] **D.1.4** — Manual: spot-check Railway logs show the structured fields searchable.
- [ ] **D.2.1** — Track cumulative `input_tokens + output_tokens` in the `answerWithTools` round loop.
- [ ] **D.2.2** — Add `MAX_TOKENS_PER_QUESTION` constant; halt loop and emit warning message if exceeded.
- [ ] **D.2.3** — Test: mock Claude returning high token counts; assert loop stops at ceiling.
- [ ] **D.3.1** — Decide remove vs. wire; update `useAiSettings.ts` accordingly.
- [ ] **D.4.1** — Adjust debounce to 5s in `AIAssistantPanel.tsx` (both desktop + web).
- [ ] **D.4.2** — Immediate flush on question send + stream end.
- [ ] **D.4.3** — Test: mock debounce; assert expected save calls.

## Test plan

- Unit on the usage helper + token-budget guard.
- Integration: fake a runaway Claude response; assert loop stops at the ceiling and user sees the graceful message.
- Manual: send 10 questions in a row, check Railway logs for the structured token-usage fields.

## Risk / rollback

- **Risk**: token-budget cap truncates a legitimate long query. Mitigation: 100K ceiling is generous; logging will reveal if users are hitting it often and we can tune.
- **Risk**: 5s persistence debounce increases the window for message loss on crash. Acceptable — `messages` state is in React memory and the streaming response is reconstructable.
- **Rollback**: per-feature flags. Logging is always safe.

## Size estimate

~80 LoC, 3 tests.

## Definition of done

- [ ] All sub-tasks checked
- [ ] Tests pass
- [ ] Token usage shows up in Railway logs, searchable by `event: "claude_call_complete"`
- [ ] A test question with an artificial token-heavy response hits the ceiling gracefully
- [ ] Persistence debounce tuned and verified with no regression in multi-device sync
- [ ] PR merged into `develop-ai-assist`
- [ ] This doc status updated to ✅
