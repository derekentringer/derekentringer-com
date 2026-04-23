# NoteSync AI Assistant — Hardening & Expansion

A multi-phase effort to make the AI Assistant genuinely useful across the user's full note library, with proper conversation continuity, safe mutation, and cost visibility.

## Why this exists

The AI Assistant today is a thin shell around a single-turn Claude call. Each question is stateless — prior turns never reach the model. `search_notes` is keyword-only and returns no content. Destructive tools (delete, overwrite) run without confirmation. There's no visibility into token cost. The shape of "what Claude can do" is limited more by wiring than by Claude's capability.

The fix is not a rewrite. Each phase is a small, independently-shippable improvement that compounds. See [current-state.md](./current-state.md) for the baseline factual map.

## Branch strategy

**Long-lived branch**: `develop-ai-assist` (cut from `main` at v2.40.0).

Each phase gets its own short-lived feature branch that PRs into `develop-ai-assist`:

```
main (v2.40.0)
 └── develop-ai-assist                    ← this branch
       ├── feat/ai-assist-phase-a         (PR → develop-ai-assist)
       ├── feat/ai-assist-phase-b         (PR → develop-ai-assist)
       ├── feat/ai-assist-phase-c         (PR → develop-ai-assist)
       ├── feat/ai-assist-phase-d         (PR → develop-ai-assist)
       └── feat/ai-assist-phase-e         (PR → develop-ai-assist)
```

When all phases are complete (or we call it done mid-stream), `develop-ai-assist` → `develop` → `main` via PR, tagged, released. Same flow as the `develop-ui-update` long-lived branch.

**Rebase discipline**: keep `develop-ai-assist` rebased onto `main` if main moves during the work. Phase branches rebase onto `develop-ai-assist`.

## Phase index

| Phase | Title | Status | Branch | Doc |
|-------|-------|--------|--------|-----|
| A | Conversation continuity | ✅ merged | `feat/ai-assist-phase-a` | [phase-a-history-context.md](./phase-a-history-context.md) |
| B | Cross-notes search | ✅ merged | `feat/ai-assist-phase-b` | [phase-b-cross-notes-search.md](./phase-b-cross-notes-search.md) |
| C | Action safety | ✅ merged | `feat/ai-assist-phase-c` | [phase-c-action-safety.md](./phase-c-action-safety.md) |
| D | Cost + observability | ✅ merged | `feat/ai-assist-phase-d` | [phase-d-cost-observability.md](./phase-d-cost-observability.md) |
| E | UX expansion | 🟠 in progress (E.1/E.2/E.4 merged; E.3/E.5 in `feat/ai-assist-phase-e-extras`) | `feat/ai-assist-phase-e`, `feat/ai-assist-phase-e-extras` | [phase-e-ux-expansion.md](./phase-e-ux-expansion.md) |

Status legend: 🟡 planned · 🟠 in progress · ✅ merged to `develop-ai-assist` · 🔷 shipped to `main`

## Dependencies between phases

```
A (history)  ──┬──▶  B (cross-notes search)  ──▶  E (UX)
               │
               ├──▶  C (action safety)
               │
               └──▶  D (observability)
```

- **A** is foundational — blocks meaningful use of B and C.
- **B** benefits from A (follow-up questions) but can technically ship without it.
- **C** should precede any expansion of destructive automation, and benefits from D's token logging.
- **D** is independent but should land early so B's token cost is visible.
- **E** is polish; lands after the capability lifts.

## Recommended shipping slices

- **Slice 1 (biggest lift, smallest blast radius)**: A + B.1. Claude remembers the conversation AND can actually answer "what have I written about X" in one call.
- **Slice 2**: D.1–D.2 (token logging + cost ceiling) alongside the rest of B. Makes the cost of the new capability visible.
- **Slice 3**: C. Unlocks heavier Claude-driven mutation safely.
- **Slice 4**: E. Polish + nice-to-haves.

Each slice can be its own PR from `develop-ai-assist` → `develop`, or we bundle and ship the whole long-lived branch at the end. Decide based on how long we're willing to keep the branch alive.

## Related reading

- [current-state.md](./current-state.md) — factual map of the assistant's current implementation
- [docs/ns/sync-arch/README.md](../sync-arch/README.md) — sync hardening follows a similar multi-phase playbook
- [CLAUDE.md](../../../CLAUDE.md) — project conventions, Prisma commands, deployment

## Invariants (to uphold across phases)

1. **The slash-command registry and Claude's tool registry stay in sync.** Adding a tool without a matching slash command (or vice-versa) is fine, but gaps should be intentional and documented.
2. **The active note and live transcript remain the primary context** when the user's question is clearly scoped to them. Broad search is additive, not replacement.
3. **Destructive tool calls must produce user-visible confirmation** in the chat before mutating. No silent overwrites.
4. **Every Claude call logs token usage.** Anonymous cost is still cost.
5. **Chat history persisted to the server is the source of truth for what Claude sees** — the same messages the UI renders are what we send back on follow-ups. No hidden alternate context.
