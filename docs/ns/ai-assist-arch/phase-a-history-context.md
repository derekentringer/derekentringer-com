# Phase A — Conversation Continuity

**Status**: 🟠 in progress (PR pending review + merge)
**Branch**: `feat/ai-assist-phase-a` (off `develop-ai-assist`)
**Depends on**: none
**Blocks**: meaningful use of Phase B (follow-up questions) and Phase C (referring back to prior actions)

## Goal

Make the AI Assistant actually remember the conversation. Today every Q&A turn is stateless: only the current question + active note + transcript reach Claude. "Summarize the second one" after a search → Claude has no idea what "the second one" refers to.

## Current-state pain

- `aiService.ts:457–459` — `messages` is always `[{ role: "user", content: question }]`.
- Chat history IS persisted (see [current-state.md §4](./current-state.md#4-chat-persistence)) but only used to repopulate the UI on reload, never fed back to Claude.
- Tool-use across rounds is preserved within one call only; once the SSE stream closes, the next question loses all context.

## Design decisions

### A.1 — Thread last N user/assistant turns into the Claude messages array

**Mechanism**: frontend sends `history: ChatHistoryTurn[]` in the `/ai/ask` request body. Backend converts to Anthropic `MessageParam[]` and prepends to the current question.

```ts
// Request body addition:
interface AskRequestBody {
  question: string;
  transcript?: string;
  activeNote?: { id: string; title: string; content: string };
  history?: Array<{ role: "user" | "assistant"; content: string }>;   // NEW
}
```

**Filter on the frontend**:
- Skip `meeting-summary` messages (convert to a short text note — "[Meeting recording: 12 minutes, note 'X' created]") so Claude has awareness but we don't try to represent the complex card structure.
- Strip empty-content assistant messages (the transient "thinking…" placeholder from an in-flight call).

**Limit**: last ~20 turns before trimming kicks in (A.2).

### A.2 — Character-budget trim, oldest-first eviction

**Why char budget over token budget**: simpler, no tokenizer dependency, close enough. 1 char ≈ 0.25 tokens for English, so 20,000 chars ≈ 5,000 input tokens for history — well within Claude's context window alongside system prompt, tools, and the active note.

**Rule**: serialize history in chronological order; drop from the oldest end until total <= 20,000 chars. Always keep the current question.

### A.3 — Rehydration fidelity: text-only, not tool_use blocks

**Decision**: when replaying history, we send **only text content** of prior assistant turns. We do NOT re-send `tool_use` / `tool_result` blocks from previous Claude calls.

**Why**:
- Our persisted `Message` type doesn't store tool_use details (see [current-state.md §4](./current-state.md#4-chat-persistence)) — we'd need a schema change to preserve them.
- Claude infers from text just fine: "You have 3 notes on leadership — Management 101, Team Dynamics, 1:1 Playbook" is enough context for "summarize the second one."
- Keeps the rehydrated messages smaller and simpler.

**Tradeoff**: Claude can't see which specific tool arguments it used last turn, so it may re-invoke a tool with slightly different args. Acceptable for this use case.

### A.4 — Chat persistence stays as-is (for now)

Phase A does NOT change what's saved to the server. The history passed to Claude is reconstructed from the in-memory `messages` state, which is already synced to persistence. No new server schema. Debounce tuning is out of scope here (see [Phase D](./phase-d-cost-observability.md)).

## Sub-tasks

- [x] **A.1.1** — `history` accepted in `ai.ts` request schema (inline; strict per-item validation: role enum user/assistant, content ≤ 5000 chars, ≤ 50 items).
- [x] **A.1.2** — `packages/ns-api/src/routes/ai.ts` accepts + forwards `history`.
- [x] **A.1.3** — `packages/ns-api/src/services/aiService.ts:answerWithTools` accepts `history` and prepends to `messages[]`.
- [x] **A.1.4** — `packages/ns-desktop/src/components/AIAssistantPanel.tsx:handleAsk` + "Catch me up" snapshot `messages` via `buildHistoryForClaude` before appending the new user question.
- [x] **A.1.5** — Same change on `packages/ns-web/src/components/AIAssistantPanel.tsx`.
- [x] **A.2.1** — `trimHistoryToBudget(history, maxChars)` in `lib/chatHistory.ts` with 12 unit tests per package (desktop + web).
- [x] **A.2.2** — Trimming wired into the frontend serializer via `buildHistoryForClaude(messages)` wrapper.
- [x] **A.3.1** — Text-only rehydration decision documented at the top of `lib/chatHistory.ts` and in `answerWithTools`.

## Test plan

- **Unit** — `trimHistoryToBudget`: oldest-first eviction, correctly preserves recent messages, handles history longer than budget.
- **Unit** — `meeting-summary` serialization: produces expected text summary from a mock card.
- **Integration** — POST `/ai/ask` with a `history` array of 3 mocked prior turns. Assert the mock Anthropic client receives the expected `messages[]` array (system + [user, assistant, user, assistant, user]).
- **Manual** — QA script: ask "what have I written about X?", then "summarize the second one". Second answer should reference the second note from the first answer.

## Risk / rollback

- **Risk**: sending too much history → exceeding Claude's context window. Mitigation: the 20K char cap leaves plenty of headroom alongside 10K active-note + 50K transcript caps (max ~80K chars ≈ 20K tokens vs. Claude's 200K context).
- **Risk**: history contains sensitive content user expects to be forgotten on `/clear`. Mitigation: `/clear` already wipes local state AND server persistence — that state is what we read history from, so `/clear` also clears what Claude sees on the next question. Behaviour is correct by construction.
- **Rollback**: frontend-only rollback — pass `history: []` (or omit the field). Backend is tolerant of missing history by design.

## Size estimate

~80 LoC across 5 files + 2 tests. 1–2 hour implementation.

## Definition of done

- [ ] All sub-tasks checked
- [ ] Tests pass in ns-api + ns-desktop + ns-web
- [ ] Manual QA: "summarize the second one" works
- [ ] PR merged into `develop-ai-assist`
- [ ] This doc status updated to ✅
