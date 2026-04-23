# Phase B — Cross-notes Search

**Status**: 🟡 planned (B.1 drafted, stashed as `phase-b-search-notes-draft`)
**Branch**: `feat/ai-assist-phase-b` (off `develop-ai-assist`)
**Depends on**: A (for follow-up-question value; not a hard dependency)
**Blocks**: nothing downstream — opens up broader capability

## Goal

Make Claude actually useful for broad questions about the user's notes — "what have I written about X", "do I have thoughts on Y", "summarize my ideas around Z". Today `search_notes` is keyword-only and returns no content; Claude has to do a multi-round dance just to find matches, and even then can't read them fully.

## Current-state pain

- `search_notes` uses SQL FTS (keyword) only — "leadership" won't surface a note about "management style" (see [current-state.md §2](./current-state.md#2-tools-exposed-to-claude)).
- Returns only title + folder + tags + snippet — Claude can't answer from search results alone; needs a follow-up `get_note_content` per match.
- The semantic / hybrid search infrastructure exists (`noteStore.listNotes` accepts `searchMode`) but isn't exposed to Claude.
- `findMeetingContextNotes` (server-side semantic recall) is available during meetings but isn't a tool — Claude can't invoke it outside a recording.
- `MAX_ROUNDS = 3` tool-use cap — "search → read 2 notes → synthesize" hits the ceiling if Claude also reads the active note along the way.
- `get_note_content` truncates at 3,000 chars — long notes are unreadable in full.

## Design decisions

### B.1 — Upgrade `search_notes` tool (already drafted, stashed)

**Already implemented in the working tree** (`git stash show stash@{0}`):

- Add `mode: "keyword" | "semantic" | "hybrid"` parameter to tool schema.
- Default to `hybrid` when a query is provided; `keyword` when listing without a query.
- Return an 800-char content snippet per result so Claude can answer directly from tool output.
- Tool description rewritten to point Claude at this FIRST for any broad question.
- System prompt gains a short paragraph nudging Claude to reach for `search_notes` on broad questions and stick with `mode=hybrid` by default.

**Test**: 6 unit tests already written in `packages/ns-api/src/__tests__/assistantTools.test.ts` — covers default-mode logic, explicit mode override, snippet truncation, empty results, favorites fast-path.

**Action for Phase B branch**: `git stash pop stash@{0}` after checking out the phase branch. Files:
- `packages/ns-api/src/services/assistantTools.ts`
- `packages/ns-api/src/services/aiService.ts`
- `packages/ns-api/src/__tests__/assistantTools.test.ts` (new)

### B.2 — New tool: `find_similar_notes`

**Purpose**: "What else have I written related to this note?" — an ad-hoc version of the meeting-context recall, available without a recording.

**Schema**:
```ts
{
  name: "find_similar_notes",
  description: "Given a note title (or the currently active note), find other notes that are semantically related. Useful for discovering connections the user may not have explicitly linked. Returns up to 10 related notes with titles, tags, and a similarity score.",
  input_schema: {
    type: "object",
    properties: {
      noteTitle: {
        type: "string",
        description: "Title of the source note. If omitted, uses the currently active note.",
      },
      limit: { type: "number", description: "Max results (default: 5, max: 10)" },
    },
    required: [],
  },
}
```

**Implementation**: thin wrapper around existing `findMeetingContextNotes` in `ai.ts`, but taking a note's embedding as input instead of a transcript's. Threshold 0.5 (between meeting-context's 0.65 and hybrid's 0.4) — tuned for "related" vs "very similar."

**Expected use**: Claude spontaneously uses this when the user asks about an active note ("are there other notes like this one?") or when chaining from a search hit ("you found 'Leadership 101' — what else is related?").

### B.3 — Raise `MAX_ROUNDS` from 3 → 5 + add cumulative call cap

**Why raise the round cap**: legitimate multi-step queries (search → read 2 notes → synthesize with backlinks context) hit 3 rounds too easily and cut off before answering. 5 is a more realistic ceiling.

**Why also add a cumulative tool-call cap**: defense against runaway loops. Round cap is per-question; a single round could invoke N tools in parallel and the cost scales with N.

```ts
const MAX_ROUNDS = 5;              // was 3
const MAX_TOOL_CALLS_TOTAL = 12;   // NEW — counts tool uses across all rounds
```

If `MAX_TOOL_CALLS_TOTAL` is hit mid-conversation, Claude gets a final user-turn message: "You've reached the tool-call cap. Finish answering with what you have." No more tools are served after that.

### B.4 — `get_note_content` truncation — configurable + raised default

**Change**:
- Default truncation raised from 3,000 → 8,000 chars.
- Tool accepts `max_chars` param (50–30,000) so Claude can ask for more when needed.

**Why**: 3K is too short for most notes of interest. 8K covers the typical user's longest notes without runaway cost. `max_chars` lets Claude make the judgement call.

**Rationale for upper bound**: 30K chars ≈ 7.5K tokens, comparable to the active-note injection budget. Hard cap prevents a rogue request from blowing the context window.

## Sub-tasks

- [ ] **B.1** — Land the stashed `phase-b-search-notes-draft` changes. Verify tests still pass after any merge-in of A changes if B branches off A.
- [ ] **B.2.1** — Add `find_similar_notes` to `ASSISTANT_TOOLS` in `assistantTools.ts`.
- [ ] **B.2.2** — Factor `findMeetingContextNotes` in `ai.ts` to accept either a transcript or a pre-computed embedding. Route the new tool through it.
- [ ] **B.2.3** — Unit test: fixture with 3 notes of known similarity, assert ordering + threshold.
- [ ] **B.3.1** — Raise `MAX_ROUNDS` to 5.
- [ ] **B.3.2** — Add `MAX_TOOL_CALLS_TOTAL` counter in `answerWithTools` loop.
- [ ] **B.3.3** — Test: mock Claude returning 13 tool-use blocks across rounds; assert the 13th is never served.
- [ ] **B.4.1** — Add `max_chars` parameter to `get_note_content` schema (default 8000, clamped 50–30000).
- [ ] **B.4.2** — Update executor to honor `max_chars`.
- [ ] **B.4.3** — Test: pass `max_chars: 100`, assert output is ≤ 100 chars (plus ellipsis).

## Test plan

- Unit: see sub-tasks above.
- **Manual QA**: set up ~10 notes with semantically overlapping content but different keywords. Ask questions like "what are my thoughts on communication?" and verify the hybrid search surfaces the relevant notes with synonymous wording.

## Risk / rollback

- **Risk**: token cost rises substantially. Search result snippets (~800 chars × 10 = 8K chars in tool result), higher round cap, larger `get_note_content` defaults — each Q&A call uses more tokens.
  - **Mitigation**: Phase D (cost logging + ceiling) should land alongside or before this. Consider shipping B.1 first standalone to observe real-world token usage before B.2–B.4.
- **Risk**: `find_similar_notes` returns low-quality matches if embedding coverage is thin (notes not yet indexed). Mitigation: tool result includes a warning when coverage < 80%.
- **Rollback**: feature-flag each sub-phase (e.g. `CROSS_NOTES_SEARCH_ENABLED`) so any one can be disabled without a full revert.

## Size estimate

- B.1: already drafted, ~60 LoC + 6 tests
- B.2: ~80 LoC + 1 test
- B.3: ~20 LoC + 1 test
- B.4: ~15 LoC + 1 test

Total ~175 LoC, 9 tests.

## Definition of done

- [ ] All sub-tasks checked
- [ ] Tests pass
- [ ] Manual QA: broad question about an absent keyword finds semantically related notes
- [ ] Token cost per question logged and reviewed (requires Phase D.1)
- [ ] PR merged into `develop-ai-assist`
- [ ] This doc status updated to ✅
