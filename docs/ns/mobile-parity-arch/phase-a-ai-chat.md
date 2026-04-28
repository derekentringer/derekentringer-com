# Phase A — AI Assistant Chat (mobile)

**Goal**: replace `packages/ns-mobile/src/screens/AiScreen.tsx` (a
"Coming soon" placeholder) with a real AI chat experience that
matches feature-for-feature what desktop and web have today.

## Sub-phases

Phase A is split into incremental sub-PRs so each ships independently:

- **A.1 — Foundation + basic streaming** ✓ shipped. SSE pipeline via
  `react-native-sse`, working chat with streaming text from
  `/ai/ask`, user/assistant turns, send/stop/clear. No tools,
  citations, slash commands, or persistence yet.
- **A.2 — Tools, citations, source pills, note cards** ✓ shipped.
  Tool activity indicator, source pills, note-card pills (first-5-
  then-collapse), inline citations via a token-based renderer
  (`tokenizeCitations` mirrors desktop's `linkifyCitations` but
  emits structured tokens for RN instead of markdown). AI tab now
  has its own stack so pill / citation taps navigate to NoteDetail.
  open_note SSE event routes through the navigation handler.
- **A.3 — Slash commands** ✓ shipped. Mobile `chatCommands.ts`
  mirrors the desktop/web shape (15 commands ported: create, delete,
  deletefolder, recent, favorites, folders, tags, open, favorite,
  unfavorite, trash, restore, duplicate, move, clear). Inline
  typeahead picker above the composer when input starts with `/`,
  tap fills the command name. Confirmation-gated rename* and AI-
  flavored summarize / gentags / savechat / multi-arg tag will land
  in A.4–A.6 as their dependencies arrive.
- **A.4 — Confirmation cards** ✓ shipped. Inline ConfirmationCard
  rendered when the SSE stream emits a `confirmation` event for the
  6 gated tools (delete_note / delete_folder / update_note_content /
  rename_note / rename_folder / rename_tag). Apply re-runs the tool
  via /ai/tools/confirm; Discard flips the card without touching the
  server. Status state machine: pending → applying → applied /
  failed (with retry) / discarded. Two new direct-DB slash commands
  added: `/rename`, `/renamefolder` (matching desktop's bypass-the-
  gate pattern). `/renametag` deferred — needs a renameTag helper
  in noteStore.
- **A.5 — Persistence + history-aware follow-ups + /savechat** ✓ shipped.
  Mount-time `fetchChatHistory()` rehydrates prior turns. Debounced
  `replaceChatMessages()` (5s steady, 200ms fast-flush after stream
  end) persists to the server. `serializeChatHistory` + `trimChatHistory`
  feed prior text turns to each new `askQuestion` call so the model
  has continuity. New `chatExport.ts` powers the `/savechat` slash
  command. Cross-device SSE-driven refetch deferred — mobile sync
  engine doesn't surface `onChatChanged` yet; tracked as A.5
  follow-up.
- **A.6 — Settings + auto-approve.** AI section in
  `SettingsScreen.tsx` with auto-approve toggles per destructive tool.

## What desktop/web have

- Streaming text from `/ai/ask` (SSE)
- Tool use: search/list/recent/get/create/update/delete/rename/etc.
- Inline citation markers (clickable title + superscript number)
- Source pills + note-card pills below assistant turns
- Slash commands: `/recent`, `/favorites`, `/folders`, `/tags`,
  `/stats`, `/open`, `/create`, `/move`, `/tag`, `/delete`,
  `/deletefolder`, `/rename`, `/renamefolder`, `/renametag`,
  `/duplicate`, `/summarize`, `/gentags`, `/restore`, `/trash`,
  `/saveChat`, `/clear`
- Confirmation cards for destructive actions
- Per-tool auto-approve settings
- Active-note context (the open note is sent to the model)
- Prompt history (Up/Down arrow on desktop; long-press on mobile?)
- Chat persistence + cross-device sync via SSE

## What mobile needs

A `MessageList` + `Composer` + `BottomSheet` shape:

```
┌──────────────────────────────────┐
│ AI Assistant            [Clear]  │  Header
├──────────────────────────────────┤
│                                  │
│  ┌──────────────────────┐        │  User bubble
│  │ How are my notes …   │        │
│  └──────────────────────┘        │
│                                  │
│ ┌────────────────────────────┐   │  Assistant bubble (streamed)
│ │ Here's a summary of …      │   │
│ │ [card] [card] [Show more]  │   │  Note pills + collapse
│ │  ── Related notes:         │   │
│ │ [pill]                     │   │
│ └────────────────────────────┘   │
│                                  │
├──────────────────────────────────┤
│ [/]  [Ask, search, create…] [↑] │  Composer
└──────────────────────────────────┘
```

The bottom-sheet (`@gorhom/bottom-sheet` is already in the stack)
hosts:
- Slash command picker (tap `/` → sheet of commands with descriptions)
- Confirmation cards (rename / delete / rewrite preview)
- Per-message action menu (long-press a message → save as note,
  copy, etc.)

## Implementation outline

### 1. Shared API client

Mobile already has `packages/ns-mobile/src/api/notes.ts`. Add
`packages/ns-mobile/src/api/ai.ts` mirroring the desktop/web shape:

- `askQuestion(question, signal, ...)` — async generator over SSE
  events (`text`, `tool_activity`, `note_cards`, `confirmation`,
  `open_note`, `done`, `error`)
- `confirmTool(toolName, toolInput)`
- `fetchChatHistory()`, `replaceChatMessages(messages)`,
  `clearServerChatHistory()`
- `summarizeNote`, `suggestTags` (helpers used by inline AI in Phase B)

The SSE consumer needs a React Native fetch polyfill for streaming.
`react-native-fetch-api` or `react-native-sse` covers this. Pick one
in the implementation PR.

### 2. State model

Same `Message` shape as desktop:

```ts
type Message = {
  role: "user" | "assistant" | "meeting-summary";
  content: string;
  sources?: { id: string; title: string }[];
  noteCards?: NoteCard[];
  confirmation?: PendingConfirmation;
  failed?: boolean;
};
```

Backed by `useState` inside `AiScreen`, persisted to ns-api on
debounced `replaceChatMessages` (same 5s + 200ms-after-stream-end
contract as desktop).

### 3. Streaming, tool calls, citations

Reuse the desktop `linkifyCitations` logic verbatim — pure function,
no DOM dependencies. Citations render as a plain `<Text>` with a
`<Pressable>` overlay on the title and a smaller `<Pressable>`
superscript number after it. Both navigate to the note.

Source pills + note-card pills: same first-5-then-collapse pattern
as desktop, using a `Pressable` + `Animated.View` for the
expand/collapse.

### 4. Slash commands

Tap `/` in the composer → bottom sheet opens with the command list.
Tap a command → composer is pre-filled with the slash + command
name, cursor at the args position. Same parsing logic as desktop's
`chatCommands.ts` (extract the file into `ns-shared` if it's
worth it; otherwise mirror).

### 5. Confirmation cards

When the stream emits a `confirmation` event, render an inline card
in the message list with Apply / Discard buttons. On Apply, slide a
bottom sheet with the full preview (the rewrite-diff, the rename
old→new, etc.) before committing — gives the user a confirm step
without burning the whole screen.

### 6. Settings

`SettingsScreen.tsx` gains an "AI" section:

- Master AI toggle (already on backend)
- AI Assistant on/off
- Per-tool auto-approve switches (deleteNote, deleteFolder,
  updateNoteContent, renameNote, renameFolder, renameTag) — same
  shape as desktop's `useAiSettings` hook
- "Auto-approve destructive actions" sub-section, mirroring desktop

### 7. Active-note context

Same prop shape as desktop: pass `activeNote` to `askQuestion` if
the user opens AI from inside a note (deep link or back-stack
context).

## Done criteria

- AiScreen renders a working chat with streaming text
- Tool use end-to-end works for search_notes, get_recent_notes,
  rename_note, delete_note, etc.
- Citations clickable; pills clickable; confirmation cards apply
- Slash commands all parse and execute
- Chat persists + syncs across devices (mobile ↔ desktop ↔ web)
- Settings screen surfaces auto-approve toggles
- Crash-free over a 50-message conversation

## Out of scope

- Live meeting context (recording-time semantic search) — Phase C
- Inline editor AI actions — Phase B
- Image AI descriptions on photos — Phase D

## Risks / open questions

- **SSE streaming on RN.** The fetch polyfill story is messier than
  on web. Need to validate one of `react-native-sse` /
  `react-native-fetch-api` early.
- **Bottom-sheet stacking.** Confirmation card → preview sheet →
  rename input could nest sheets. `@gorhom/bottom-sheet` supports
  stacking but needs careful z-index / dismissal handling.
- **Citation tap targets.** A `<sup>` superscript on web is small
  but precise via cursor; on mobile that's a 12pt tap target which
  is below Apple's 44pt guideline. Probably make the title link the
  primary tap target and the superscript decorative.
- **Long messages on small screens.** A 5-paragraph assistant turn
  on a phone is a lot. Consider collapsing super-long turns behind a
  "Show more" sheet, or at minimum a max height with internal scroll.
