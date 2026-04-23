# Phase E — UX Expansion

**Status**: 🟢 in progress (E.1/E.2/E.4 merged; E.3/E.5 in `feat/ai-assist-phase-e-extras`)
**Branches**:
- `feat/ai-assist-phase-e` — E.1, E.2, E.4 (merged)
- `feat/ai-assist-phase-e-extras` — E.3, E.5

**Depends on**: A (conversation continuity makes the "retry" action meaningful); B (broader capability makes the "thinking" indicator more informative)
**Blocks**: nothing

## Goal

Polish the user-facing shell of the assistant. With A–D landed, Claude is capable, safe, and observable — this phase makes the experience feel considered: clear progress, easy retry, chat export, and a keyboard-first path into the panel.

Each sub-item is independently shippable. They don't have to land together.

## Sub-items

### E.1 — Aggregate "thinking…" indicator

**Problem**: during a tool-heavy answer, the UI shows only a per-message spinner with generic "Thinking…" text. The SSE stream already emits `tool_activity` events (e.g. `{ toolName: "search_notes", description: "Searching notes..." }`) but they're discarded.

**Fix**: aggregate the latest `tool_activity` description into a panel-header badge: "Searching your notes…", "Reading 3 notes…", "Writing your answer…". Clears when the stream completes.

**Size**: ~30 LoC. Backend already emits the events.

### E.2 — Retry button on failed assistant turns

**Problem**: if a Q&A call fails (network drop, Claude 5xx, tool error), the message is stuck in an error state with no recovery path.

**Fix**: render a "Retry" button on failed assistant messages. Clicking re-sends the original user question (now with full conversation history from Phase A, so the retry has the right context).

**Size**: ~40 LoC. Reuses the Phase 2 audio-retry pattern.

### E.3 — Export chat as a note

**Problem**: users ask Claude great questions, get great answers, and then the chat eventually scrolls away or gets cleared.

**Fix**: a slash command `/saveChat` (and a button in the panel header menu) that takes the current session, renders it as markdown, and creates a new note with it. Source pills become `[[wiki-links]]`. Meeting-summary cards become a short paragraph with a link to the note the meeting created.

**Size**: ~80 LoC. Uses existing `createNote` + markdown serialization.

### E.4 — Keyboard shortcut: focus chat input

**Problem**: focusing the chat input requires mouse-clicking into it.

**Fix**: global shortcut (Cmd+J on macOS, Ctrl+J on Windows) opens the panel if closed + focuses the input. Respects the existing command-palette keyboard system.

**Size**: ~20 LoC. Register in the existing command registry.

### E.5 — Inline source attribution

**Problem**: when Claude cites a note in its answer, the source pill appears below the message but there's no in-text indicator of WHICH sentence came from which note.

**Fix**: post-process assistant text to look for titles from the `sources` array; wrap matching phrases with a subtle superscript citation marker that links to the source pill. Non-invasive; works with the existing `sources` field.

**Size**: ~50 LoC.

### E.6 — Conversation branching (exploratory, not committed)

**Problem**: follow-up questions are linear. Sometimes the user wants to ask "but what about Y?" without losing the thread on X.

**Possible fix**: "fork from here" button on any assistant message → start a new chat pre-seeded with the history up to that message. Different session, preserved context.

**Status**: not committed to this phase. Captures the idea; decide based on user demand after A+B ship.

## Sub-tasks (per committed sub-item; E.6 excluded)

- [x] **E.1.1** — Aggregate `tool_activity` events into a header badge state. (already flowing through `toolActivity` state in the panel; now surfaced in the header while `isStreaming` is true.)
- [x] **E.1.2** — Copy: map tool names to user-friendly phrases — backend `tool_activity.description` already emits user-friendly phrases (e.g. "Searching notes…"); the panel uses them verbatim with a "Thinking…" fallback.
- [x] **E.2.1** — Render Retry button on assistant messages with `failed: true`. (applied to both ns-desktop and ns-web panels.)
- [x] **E.2.2** — Re-post the original user question + history via the extracted `performAsk(question, history)` helper; `handleRetry(idx)` rebuilds history from messages preceding the retried user turn.
- [x] **E.3.1** — Chat → markdown serializer in `lib/chatExport.ts` (mirrored across desktop + web). Inline `[Title]` citations become `[[Title]]` wiki-links so the exported note stays linked to its sources.
- [x] **E.3.2** — `/savechat [optional title]` slash command wired through CommandContext.saveChat. Returns a noteCard for the new note so the user gets a one-click open.
- [ ] **E.3.3** — Panel menu button alternative entry. (**deferred** — slash command + autocomplete is sufficient discoverability for a power-user feature; revisit if the menu becomes load-bearing.)
- [x] **E.4.1** — Register Cmd+J (`ai:focus-chat`, `Mod-j`, global scope) in both `ns-desktop/src/commands/registry.ts` and `ns-web/src/commands/registry.ts`.
- [x] **E.4.2** — Wired `focusNonce?: number` prop through AIAssistantPanel → `useEffect` that focuses the chat input on every nonce bump; NotesPage handler opens drawer on assistant tab + bumps the counter.
- [x] **E.5.1** — `linkifyCitations(text, sources)` post-processor transforms `[Title]` markers into numbered `[N](cite:Title)` markdown links before ReactMarkdown renders. Numbering matches the order of pills shown below the message.
- [x] **E.5.2** — Custom `a` component override on ReactMarkdown renders `cite:` URLs as `<sup>` superscript markers; clicking opens the cited note via the existing `onSelectNote` flow.

## Test plan

- E.1: fake SSE stream with sequence of tool_activity events; assert header shows the latest description.
- E.2: failed message renders Retry; clicking re-invokes `/ai/ask` with the original question.
- E.3: serialize a mock chat, assert markdown output; smoke test that the resulting note is valid.
- E.4: Cmd+J with panel closed → panel opens + input focused.
- E.5: message with a cited title → citation markers appear; click scrolls to pill.

## Risk / rollback

- All changes are UX additions; per-item rollback by reverting the component change. No data-model implications.

## Size estimate

- E.1: ~30 LoC
- E.2: ~40 LoC
- E.3: ~80 LoC
- E.4: ~20 LoC
- E.5: ~50 LoC

Total ~220 LoC across 5 sub-items, 5 tests. Each can be a separate PR if we want fine-grained review.

## Definition of done

- [x] E.1, E.2, E.4 sub-tasks checked
- [x] E.3 (E.3.1, E.3.2) + E.5 sub-tasks checked
- [x] Tests pass (ns-api 500/500, ns-web 641/641, ns-desktop 995/995)
- [ ] Manual QA: all items feel good in daily use
- [ ] PRs merged into `develop-ai-assist`
- [ ] This doc status updated to ✅
- [ ] E.6 reassessed post-merge and either promoted to its own phase or dropped

## Deferred

- **E.3.3** (header menu button) — `/savechat` slash command + autocomplete already gives discoverable access; a header menu would duplicate the path with no clear win. Revisit if a menu becomes useful for other entries.
