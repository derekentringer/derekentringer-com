# Phase C — Action Safety

**Status**: ✅ merged into `develop-ai-assist` (PR #471)
**Branch**: `feat/ai-assist-phase-c` (deleted post-merge)
**Depends on**: A (nice-to-have for conversational confirmation flow); D.1 (token logging) recommended to observe cost of confirmation round-trips
**Blocks**: responsible shipping of any future Claude-driven bulk operations

## Goal

Claude currently has 11 destructive tools (`delete_note`, `update_note_content`, `delete_folder`, etc.) with zero user confirmation. As the assistant gets more capable and more trusted, the blast radius of a misinterpreted instruction grows. This phase adds a confirmation UX so any mutation Claude wants to perform surfaces to the user before committing.

## Current-state pain

From [current-state.md §2](./current-state.md#2-tools-exposed-to-claude):

- `update_note_content` requires Claude to send the FULL updated content — misunderstanding the scope of an edit risks silent clobber of the entire note.
- `delete_note` (soft delete, goes to Trash) and `delete_folder` execute instantly on Claude's say-so.
- No "Claude wants to do X — is that OK?" surface.
- No undo path beyond the existing Trash / version-history systems (which users may not know to check).

## Design decisions

### C.1 — Client-side confirmation intercept (chosen approach)

**Three options considered:**

1. ✅ **Client-side intercept**: destructive tool calls surface as an inline confirmation card in the chat. User clicks Apply → client invokes the real tool. Clean separation: Claude's loop doesn't block; user reviews at their own pace.
2. ❌ **Server-side dry-run** — tool call returns a preview; Claude has to ask the user; a "confirm" tool follow-up commits. More round-trips, more tokens, more latency.
3. ❌ **Prompt-only** — system prompt asks Claude to confirm first. Unreliable; Claude drifts.

**Chosen: Option 1.**

**Mechanism**:
- The tool schema for destructive ops gets an auto-confirmation bypass: when Claude calls `delete_note`, the server returns a special `ToolResult` kind: `{ kind: "needs_confirmation", intent: {...} }` instead of mutating.
- The frontend renders this as an inline card in the chat with Apply / Discard buttons.
- Apply → invoke a distinct `confirm_<action>` endpoint that executes the mutation and returns the result.
- Discard → just removes the card; Claude is notified on the next turn that the user declined.

**Example payload**:
```ts
type ToolResult =
  | { kind: "ok"; text: string; noteCards?: NoteCard[] }
  | { kind: "needs_confirmation"; action: DestructiveAction };

type DestructiveAction =
  | { type: "delete_note"; noteId: string; title: string }
  | { type: "update_note_content"; noteId: string; title: string; oldPreview: string; newPreview: string; diffSummary: string }
  | { type: "delete_folder"; folderId: string; name: string; affectedCount: number }
  | ... // one per destructive tool
```

### C.2 — Diff preview for `update_note_content`

When Claude rewrites a note, the confirmation card shows:

- Old title → new title (if changed)
- Character/word count delta
- A scrollable mini-diff (green additions, red removals) — reuses `packages/ns-desktop/src/lib/diff.ts`
- "Replacing X% of the note" warning badge if >50% of the note is being replaced

User can scroll the diff, then Apply / Discard.

### C.3 — Soft-delete clarity

- `delete_note` confirmation card message: "Move **X** to Trash? You can restore it for 30 days."
- `delete_folder` confirmation: "Delete **X** folder? Contains N notes (will become unfiled, notes are not deleted)."
- Wording aligns with the actual behavior so users aren't surprised.

### C.4 — Bulk actions get batch confirmation

If Claude calls `delete_note` three times in one round, the frontend groups them into a single "Delete 3 notes?" card with all titles listed. Prevents confirmation fatigue and makes bulk intent visible.

### C.5 — Approval carries over in one session (scoped)

Per-session setting: "Auto-approve reads and favorites; always confirm deletes and content rewrites." Default opt-in for safety. User can disable confirmations per category in the settings panel if they want full automation.

## Destructive tools requiring confirmation

| Tool | Confirmation type | Diff preview? |
|------|-------------------|---------------|
| `delete_note` | Yes | No (title + folder only) |
| `delete_folder` | Yes | No (name + affected count) |
| `update_note_content` | Yes | Yes (C.2) |
| `move_note` | Opt-in (default: auto-approve) | No |
| `tag_note` | Opt-in (default: auto-approve) | No |
| `create_note` | Opt-in (default: auto-approve) | No |
| `toggle_favorite` | Always auto-approve | — |
| `rename_folder` | Yes | Old → new |
| `rename_tag` | Yes | Old → new (+ affected count) |
| `restore_note` | Always auto-approve | — |
| `duplicate_note` | Always auto-approve | — |

## Sub-tasks

- [x] **C.1.1** — `ToolResult` gains a `needsConfirmation?: PendingConfirmation` field + `ConfirmationPreview` union.
- [x] **C.1.2** — `executeTool(..., { autoApprove })` gates destructive tools through `buildPendingConfirmation` unless the caller opts in. Precheck failure falls through to the real executor so "note not found" etc. surface normally.
- [x] **C.1.3** — `AgentEvent.type` gains `"confirmation"`; the route passes it through as an SSE `{ confirmation: … }` frame.
- [x] **C.1.4** — `POST /ai/tools/confirm` endpoint accepts `{ toolName, toolInput }` (toolName restricted to the destructive enum), re-runs `executeTool` with `autoApprove: true`, and notifies sync.
- [x] **C.1.5** — `ConfirmationCard` component (desktop + web). Inline in the chat stream. Apply / Discard buttons; applying disables both; status progresses `pending → applying → applied | failed | discarded`.
- [x] **C.2.1** — `ConfirmationCard` renders a compact diff for `update_note_content` (char delta, % change, Before/After snippets capped at 200 chars each).
- [x] **C.3.1** — Tool descriptions rewritten (`delete_note` mentions 30-day Trash, `delete_folder` clarifies notes become Unfiled, etc.); system prompt explains the "confirmation requested" pattern so Claude responds naturally.
- [x] **C.4.1** — Panel's `confirmation` event handler merges consecutive same-toolName pendings into a single card (`ConfirmationState.pendings: PendingConfirmation[]`). Batch header adapts ("Delete 3 notes?"). Apply iterates; per-item results surface partial-success detail ("2 of 3 applied — 1 failed") without masking what succeeded.
- [x] **C.5.1** — `AiSettings.autoApprove: AutoApproveSettings` added to `useAiSettings` (desktop + web). Five flags: `deleteNote`, `deleteFolder`, `updateNoteContent`, `renameFolder`, `renameTag`. Default all-off (safer). Persisted via localStorage with `loadAutoApprove` validator rejecting malformed payloads.
- [x] **C.5.2** — Settings UI section added to both packages: appears conditionally under the AI-assistant toggle, with one `ToggleSwitch` per destructive tool + a warning paragraph framing the tradeoff.
- [x] **Plumbing** — `askQuestion` accepts `autoApprove?: AutoApproveFlags`; backend schema accepts `autoApprove` object; `answerWithTools` consults `shouldAutoApproveTool(toolName, flags)` per-call so destructive tools bypass the gate only when the user has opted in.

## Tests added in this PR

- `assistantTools.test.ts`: 8 tests — default confirmation gate for all 5 destructive tools, autoApprove bypass, fall-through when target missing, preview field correctness for update_note_content / delete_folder / rename_tag, non-destructive tools skip the gate.
- `aiRoutes.test.ts`: 5 tests — confirm endpoint re-runs with autoApprove=true, rejects tools outside the allowlist, requires auth, validates payload, forwards autoApprove flags to answerWithTools (Phase C.5).
- `answerWithTools.test.ts`: 3 tests — confirmation fires without autoApprove; autoApprove.deleteNote=true bypasses delete_note; autoApprove for the WRONG tool doesn't cross-bypass (deleteNote=true leaves delete_folder gated).
- `useAiSettings.test.ts` (web): 3 tests — loadAutoApprove with partial flags; rejects malformed payload; updateSetting persists. Desktop version already had shape test (updated + field count to 14).

Totals: ns-api 482 → 498 (+16); ns-desktop 987 (+4 useAiSettings shape updates absorbed, net 0 count); ns-web 630 → 633 (+3).

## Test plan

- **Unit**: `needs_confirmation` serialization round-trip.
- **Unit**: confirmation card renders all destructive action types.
- **Integration**: Claude invokes `delete_note` → frontend receives confirmation card; clicking Apply invokes `/ai/tools/confirm` → note is deleted.
- **Integration**: Clicking Discard removes the card; Claude gets a user message "declined" on the next turn.
- **Manual**: ask Claude "delete my Draft note" — confirmation appears. Decline. Ask again — still safe.

## Risk / rollback

- **Risk**: latency / friction for simple actions the user always confirms. Mitigation: C.5 per-tool auto-approve + bulk grouping (C.4).
- **Risk**: existing Claude behavior "just works" when the user expects it to. Mitigation: auto-approve defaults for the safer tools (favorite, restore, duplicate, etc.).
- **Rollback**: feature flag `CLAUDE_ACTION_CONFIRMATION_ENABLED`. Disabled = prior behavior.

## Size estimate

- C.1 core plumbing: ~150 LoC (backend + frontend + types + serialization)
- C.2 diff preview: ~40 LoC (reuse existing diff lib)
- C.3 copy updates: ~20 LoC
- C.4 bulk grouping: ~40 LoC
- C.5 settings: ~60 LoC

Total ~310 LoC, 4 tests. This is the largest phase.

## Definition of done

- [ ] All sub-tasks checked
- [ ] Tests pass
- [ ] Manual QA: every destructive tool requires confirmation by default
- [ ] Settings let a power user auto-approve low-risk actions
- [ ] PR merged into `develop-ai-assist`
- [ ] This doc status updated to ✅
