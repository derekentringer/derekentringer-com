# Phase B — Inline AI Editor Actions (mobile)

**Goal**: surface the per-note AI actions that desktop has in the
editor toolbar — Continue Writing, AI Rewrite, AI Tags, AI Summary —
on mobile via the existing markdown toolbar plus a bottom sheet.

## What desktop has

In the editor toolbar (`EditorToolbar.tsx`):

- **Continue Writing** — Cmd+Shift+Space; appends AI completion at
  the cursor
- **AI Rewrite** — Cmd+Shift+R; opens rewrite menu with styles
  (continue, markdown, brief, paragraph, structure)
- **Generate Tags** — runs `suggestTags`, opens a confirmation/edit
  panel
- **Generate Summary** — runs `generateSummary`, inserts at top of
  note or shows in a side panel

All hit endpoints that already exist:
- `/ai/complete` — streaming completion
- `/ai/rewrite` — rewrite with style
- `/ai/tags` — suggest tags
- `/ai/summarize` — generate summary

## What mobile needs

`packages/ns-mobile/src/components/notes/MarkdownToolbar.tsx`
already exists with basic formatting buttons (bold, italic, etc.).
Add an "AI" button that opens a bottom sheet:

```
╔════════════════════════════════════╗
║  AI Actions                        ║
║                                    ║
║  ✨ Continue Writing               ║
║  ✏️  Rewrite                       ║
║      ↳ Continue / Brief / etc.     ║
║  🏷️  Suggest Tags                  ║
║  📝 Summarize                      ║
║                                    ║
║  [Cancel]                          ║
╚════════════════════════════════════╝
```

(Per the no-emojis policy, actual UI uses inline SVG icons; the
sketch above is just for layout.)

## Implementation outline

### 1. Streaming → text input

Continue Writing and Rewrite both stream tokens. The mobile editor
is a native `<TextInput>` (no CodeMirror). Two strategies:

- **Append-to-end** — for Continue Writing, append each streamed
  chunk to the `value` prop; cursor stays at end.
- **Replace-selection** — for Rewrite, capture the selection range
  before streaming starts, then replace with streamed output as it
  arrives.

Both need the streaming helper from Phase A's `api/ai.ts`.

### 2. Tag picker integration

`generateTags` returns an array of strings. Surface them in the
existing `TagPicker.tsx` with a "Suggested" section pre-selected;
user can deselect any they don't want before saving.

### 3. Summary handling

Two policies (user picks once in settings or per-action):
- **Insert at top of note** — prepends `> Summary: …` blockquote
- **Save to a separate field** — uses the existing `notes.summary`
  column; surfaces in note detail header

Mirror desktop's existing behavior here.

### 4. Settings

`SettingsScreen.tsx` AI section gains toggles:
- Continue Writing
- AI Rewrite
- Tag suggestions
- Summarize

Same `useAiSettings` shape as desktop, persisted to local storage
(currently uses Zustand; piggyback that store).

### 5. Streaming cancellation

A small "Stop" button replaces the AI action button while streaming
is active. AbortController in the api client handles the rest.

## Done criteria

- AI button in markdown toolbar opens the actions sheet
- Continue Writing streams tokens into the editor at cursor end
- Rewrite replaces the selection (or whole note if no selection)
  with streamed output
- Suggest Tags surfaces a pre-selected tag list in the picker
- Summarize either prepends to note or fills `summary` field per
  user pref
- All four actions can be cancelled mid-stream
- Settings toggles per-action

## Out of scope

- Ghost-text completions like the desktop CodeMirror autocomplete —
  not feasible on `TextInput`. Continue Writing replaces it.
- Full Rewrite-diff preview — desktop has a side-by-side diff modal;
  on mobile show a simpler "Apply / Cancel" with a smaller preview.

## Risks / open questions

- **TextInput streaming jank.** Updating `value` 30+ times per second
  can stutter. Throttle to ~16ms (one frame) batches and use
  `setNativeProps` if React reconciliation gets expensive.
- **Selection persistence.** RN's `<TextInput>` doesn't always
  preserve selection across `value` updates. Capture
  `selection.start` / `selection.end` at action-start and re-apply
  after each chunk.
- **Settings store.** Zustand vs `useAiSettings` (which is a
  React state hook with localStorage on web/desktop). Need a
  small shim either way; pick one in implementation.
