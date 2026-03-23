# 10 — AI Features

**Status:** Complete (10a–10f)
**Phase:** 7 — AI
**Priority:** Medium

## Summary

Port all AI-powered features from ns-web to ns-desktop for feature parity. All AI calls route through ns-api (already fully implemented — no backend changes needed). Desktop UI/UX must match the web app. Features include inline ghost text completions, note summarization, smart auto-tagging, select-and-rewrite, semantic search, audio notes, AI assistant chat, and continue writing/structure suggestions.

## Architecture

- **No backend changes** — ns-api already has all AI endpoints (complete, summarize, tags, rewrite, transcribe, ask, embeddings). Exception: 10c added `POST /ai/embeddings/generate` for on-demand embedding generation.
- **All AI calls go through ns-api** — desktop never calls Claude or Whisper directly
- **Frontend-only work** — port API client functions, hooks, editor extensions, components, and settings UI from ns-web (except 10c which also added backend endpoint)
- **Shared types** — `@derekentringer/shared/ns` already exports `AudioMode`, `QASource`, `EmbeddingStatus`
- **CodeMirror extensions** — `ghostText.ts` and `rewriteMenu.ts` are self-contained; copy from ns-web to ns-desktop
- **Semantic search** — embeddings generated via ns-api's Voyage AI endpoint, stored locally in SQLite as JSON text; cosine similarity computed in pure JavaScript (no sqlite-vec — Tauri's SQL plugin doesn't support extension loading); all three search modes (keyword/semantic/hybrid) work offline once embeddings are cached
- **Audio recording** — `MediaRecorder` API works in Tauri's webview; same implementation as web

## Incremental Releases

| Release | Summary | Web Equivalent |
|---------|---------|----------------|
| **10a** | ~~Inline completions + completion styles, summarize, auto-tag, AI settings~~ ✅ | 04a + 04a.1 |
| **10b** | ~~Select-and-rewrite~~ ✅ | 04b |
| **10c** | ~~Semantic search (local JSON text + pure JS cosine similarity)~~ ✅ | 04c |
| **10d** | ~~Audio notes~~ ✅ | 04d |
| **10e** | ~~AI assistant chat + focus mode + keyboard shortcuts~~ ✅ | 04e + 04e.1 |
| **10f** | ~~Continue writing & structure suggestions~~ ✅ | 04g |

---

## Release 10a: Inline Completions, Summarize, Auto-Tag, AI Settings

### Files to Create

#### AI API Client (`packages/ns-desktop/src/api/ai.ts`) — NEW
Port from `packages/ns-web/src/api/ai.ts`. All functions identical — same endpoints, same SSE parsing:
- `fetchCompletion(context, signal, style?)` — async generator, SSE streaming
- `summarizeNote(noteId)` — JSON response
- `suggestTags(noteId)` — JSON response
- Import `apiFetch` from `./client.ts` (desktop's existing API client)
- Import types from `../hooks/useAiSettings.ts` and `@derekentringer/shared/ns`

#### AI Settings Hook (`packages/ns-desktop/src/hooks/useAiSettings.ts`) — NEW
Copy from `packages/ns-web/src/hooks/useAiSettings.ts`. Identical implementation:
- `CompletionStyle` type: `"continue" | "markdown" | "brief" | "paragraph" | "structure"`
- `AudioMode` type: `"meeting" | "lecture" | "memo" | "verbatim"`
- `AiSettings` interface with all fields (masterAiEnabled, completions, completionStyle, completionDebounceMs, continueWriting, summarize, tagSuggestions, rewrite, semanticSearch, audioNotes, audioMode, qaAssistant)
- `useAiSettings()` hook with localStorage persistence under `"ns-ai-settings"` key
- Validated loading with fallbacks for corrupted/partial data

#### Ghost Text Extension (`packages/ns-desktop/src/editor/ghostText.ts`) — NEW
Copy from `packages/ns-web/src/editor/ghostText.ts`:
- `ghostTextExtension(fetchFn)` — CodeMirror 6 extension
- `StateField<string>` for ghost text state
- `ViewPlugin` with 600ms debounce + `AbortController`
- `Decoration.widget` renders `<span class="cm-ghost-text">` (opacity 0.4, italic)
- `Prec.highest` keymap: Tab to accept, Escape to dismiss
- Context: last ~500 characters before cursor

### Files to Modify

#### MarkdownEditor (`packages/ns-desktop/src/components/MarkdownEditor.tsx`)
- Add `extensions?: Extension[]` prop for AI extensions
- Add `.cm-ghost-text` CSS styles to theme

#### EditorToolbar (`packages/ns-desktop/src/components/EditorToolbar.tsx`)
- Add Summarize button (sparkle icon), conditional on `settings.summarize`
- Add Suggest Tags button (tag icon), conditional on `settings.tagSuggestions`
- Match web's compact icon-only toolbar style with `aria-label` and `title` tooltips

#### SettingsPage (`packages/ns-desktop/src/pages/SettingsPage.tsx`)
- Add "AI Features" section matching web layout
- Toggle switches (all default OFF): Inline completions, Summarize, Auto-tag suggestions
- Completion style radio group (Continue writing, Markdown assist, Brief) — shown when completions enabled
- Info tooltips on all AI settings (InfoIcon component matching web)
- `useAiSettings()` hook integration

#### NotesPage (`packages/ns-desktop/src/pages/NotesPage.tsx`)
- Import and wire `useAiSettings`
- Ghost text wired conditionally via `useMemo` on `settings.completions`
- Pass AI extensions to MarkdownEditor
- Summarize button handler: calls `summarizeNote()`, updates local state
- Suggest Tags handler: calls `suggestTags()`, shows pills with accept/dismiss
- Summary display below note title (italic, muted) with delete (x) button
- Suggested tags shown as pills matching web design
- Save-before-AI-call pattern for summarize and tag suggestions

### Tests
- `useAiSettings.test.ts` — defaults, read/write, corruption handling, completionStyle validation (8+ tests)
- `ai-api.test.ts` — mock apiFetch, test SSE parsing, summarize, suggestTags (5+ tests)
- `ghostText.test.ts` — StateField, effects, Tab/Escape keymaps (6+ tests)
- `SettingsPage.test.tsx` — AI toggle rendering, completion style radio group (5+ tests)

---

## Release 10b: Select-and-Rewrite

### Files to Create

#### Rewrite Menu Extension (`packages/ns-desktop/src/editor/rewriteMenu.ts`) — NEW
Copy from `packages/ns-web/src/editor/rewriteMenu.ts`:
- `rewriteExtension(rewriteFn)` — CodeMirror 6 extension
- 6 actions: Rewrite, Make concise, Fix grammar, Convert to list, Expand, Summarize
- Floating tooltip menu positioned at selection end
- `Mod-Shift-r` keyboard shortcut + right-click context menu
- Loading state, error state with 2s auto-close

### Files to Modify

#### AI API Client (`packages/ns-desktop/src/api/ai.ts`)
- Add `RewriteAction` type
- Add `rewriteText(text, action)` function

#### MarkdownEditor (`packages/ns-desktop/src/components/MarkdownEditor.tsx`)
- Add `.cm-rewrite-menu`, `.cm-rewrite-action`, `.cm-rewrite-loading`, `.cm-rewrite-error` CSS styles

#### SettingsPage (`packages/ns-desktop/src/pages/SettingsPage.tsx`)
- Add "Select-and-rewrite" toggle (4th toggle)
- Add Keyboard Shortcuts reference section with platform-aware labels (Cmd on Mac, Ctrl on others)

#### NotesPage (`packages/ns-desktop/src/pages/NotesPage.tsx`)
- Wire `rewriteExtension(rewriteText)` in AI extensions memo, gated on `settings.rewrite`

### Tests
- `rewriteMenu.test.ts` — extension validity, StateField, open/close effects, auto-close on change (10+ tests)
- `ai-api.test.ts` — add rewriteText tests (3+ tests)
- `SettingsPage.test.tsx` — update toggle count, keyboard shortcuts section

---

## Release 10c: Semantic Search ✅

**Implemented.** See [features/10c-ai-semantic-search.md](../features/10c-ai-semantic-search.md) for full details.

Key architecture change from original plan: uses JSON text storage + pure JS cosine similarity instead of sqlite-vec (Tauri's SQL plugin doesn't support SQLite extension loading). Also required a new backend endpoint (`POST /ai/embeddings/generate`) since ns-api had no public endpoint for on-demand embedding generation.

---

## Release 10d: Audio Notes ✅

**Implemented.** See [features/10d-ai-audio-notes.md](../features/10d-ai-audio-notes.md) for full details.

Includes browser MediaRecorder for standard microphone recording and native macOS meeting audio recording via direct Core Audio HAL using `coreaudio-rs` (AudioUnit) + `objc2-core-audio` (Process Tap) + `core-foundation` (CFDictionary) for system audio + microphone simultaneously on macOS 14.2+. Audio samples streamed to disk during recording via `mpsc::sync_channel` + writer threads, processed in 1-second chunks at stop time (~2MB working set regardless of recording length). Added `RecordingSource` type (`"microphone" | "meeting"`) to AI settings, recording source selector in AudioRecorder dropdown and Settings page, Rust `audio_capture.rs` module with `coreaudio-rs` + `core-foundation` + `hound` + `objc2` + `objc2-core-audio` + `block2` crates, permission pre-request functions for both microphone (AVCaptureDevice) and system audio (AudioHardwareCreateProcessTap) ensuring exactly 2 permission dialogs on first use, three new Tauri commands (`check_meeting_recording_support`, `start_meeting_recording`, `stop_meeting_recording`), WAV extension support in `transcribeAudio`, and `NSAudioCaptureUsageDescription` entitlement.

---

## Release 10e: AI Assistant Chat + UI Polish

### Files to Create

#### QAPanel Component (`packages/ns-desktop/src/components/QAPanel.tsx`) — NEW
Copy from `packages/ns-web/src/components/QAPanel.tsx`:
- Chat panel with streaming AI answers, Clear button
- Scrollable messages with auto-scroll
- User messages: right-aligned accent-colored bubbles
- Assistant messages: left-aligned card-styled with ReactMarkdown + remarkGfm
- Citation handling: `[Title]` references stripped, deduplicated source pills at bottom of replies with `border-t` separator
- Source pills: `rounded-md` styling, click calls `onSelectNote(id)`
- Input area: text input + Ask/Stop button, AbortController for cancellation
- Tab button embedded in input footer, slides with panel
- Auto-focus input when panel opens
- Props: `onSelectNote`, `isOpen`, `onToggle`

### Files to Modify

#### AI API Client (`packages/ns-desktop/src/api/ai.ts`)
- Add `AskQuestionEvent` interface
- Add `askQuestion(question, signal)` async generator function

#### SettingsPage (`packages/ns-desktop/src/pages/SettingsPage.tsx`)
- Add "AI assistant chat" toggle (7th toggle)
- Disabled when semantic search is off (dependency)
- When semantic search toggled off, qaAssistant auto-disabled

#### NotesPage (`packages/ns-desktop/src/pages/NotesPage.tsx`)
- Add `qaOpen` state + `qaResize` hook (useResizable, vertical, 250–600px, `ns-qa-panel-width`)
- QA panel rendered as fixed overlay with slide animation (`transition-transform duration-300 ease-in-out`)
- Tab always visible when `settings.qaAssistant` is enabled
- `handleQaSelectNote` callback: finds/selects note, navigates out of trash view
- Close QA panel when qaAssistant setting turned off

#### NoteList (`packages/ns-desktop/src/components/NoteList.tsx`)
- Add `onDeleteNote` optional prop (if not already present)
- Right-click context menu with "Delete" option matching web
- `fixed` positioning at cursor coordinates, click-outside dismissal

#### FolderList / FolderTree (`packages/ns-desktop/src/components/FolderTree.tsx`)
- Ensure context menu uses `fixed` positioning at cursor coordinates matching web
- Click-outside dismissal

### Tests
- `QAPanel.test.tsx` — Clear button, Ask button disabled/enabled, source pill click (4+ tests)
- `ai-api.test.ts` — add askQuestion SSE parsing tests (2+ tests)
- `SettingsPage.test.tsx` — update toggle count, Q&A toggle and disabled state

---

## Release 10f: Continue Writing & Structure Suggestions, UX Polish

### Files to Modify

#### Ghost Text Extension (`packages/ns-desktop/src/editor/ghostText.ts`)
- Add `continueWritingKeymap(fetchFn, getTitle?)` — new exported function
- Returns CodeMirror extension with `Mod-Shift-Space` keymap
- Auto-selects style: short content → `"structure"`, otherwise → `"paragraph"`
- Reuses existing ghost text rendering

#### SettingsPage (`packages/ns-desktop/src/pages/SettingsPage.tsx`)
- Add "Continue writing" toggle (8th toggle, separate from inline completions)
- Add "Continue writing / suggest structure" to Keyboard Shortcuts reference (Cmd/Ctrl+Shift+Space)

#### NotesPage (`packages/ns-desktop/src/pages/NotesPage.tsx`)
- Wire `continueWritingKeymap` in AI extensions memo, gated on `settings.continueWriting`
- Uses `titleRef` to pass current note title without recreating extensions

#### MarkdownEditor (`packages/ns-desktop/src/components/MarkdownEditor.tsx`)
- Add CSS rule to hide placeholder on focus: `"&.cm-focused .cm-placeholder": { display: "none" }`

### Tests
- `ghostText.test.ts` — add continueWritingKeymap tests: returns Extension, paragraph vs structure style selection (3+ tests)
- `SettingsPage.test.tsx` — update toggle count, continue writing toggle, shortcut description

---

## Desktop vs Web Differences

| Aspect | Web | Desktop |
|--------|-----|---------|
| **API client** | `apiFetch` from `./client.ts` | Same pattern — desktop has its own `apiFetch` in `./client.ts` |
| **Router** | `navigate()` for deep-links, URL sync | No router — no URL updates |
| **Note type** | `NoteSearchResult` (from API) | `Note` (from local SQLite, synced) |
| **Semantic search** | Server-side pgvector | Embeddings generated via ns-api Voyage AI, cached in SQLite as JSON text; pure JS cosine similarity; fully offline once cached |
| **Audio recording** | `MediaRecorder` in browser | `MediaRecorder` in Tauri webview (microphone mode) + native macOS direct Core Audio HAL via coreaudio-rs (meeting mode — Process Tap + Aggregate Device + AudioUnit, system audio + microphone, macOS 14.2+) |
| **Sync after AI create** | Offline queue handles it | Must push to sync engine after note creation |
| **Admin AI toggle** | Admin page (separate) | Admin page already has AI global toggle |
| **ConfirmDialog** | Created in 04e.1 | Already exists |
| **Note saving** | Auto-save via `isDirty` effect | Auto-save via `isDirty()` function + `saveGeneration` |

## Open Questions (Resolved from Web Implementation)

- **Inline completions stream** — Yes, token-by-token via SSE
- **Embedding model** — Voyage AI (`voyage-3-lite`, 512 dimensions), generated server-side via ns-api, cached locally in SQLite for offline search
- **Q&A history** — Ephemeral per session (matches web)
- **Context window for completions** — Last ~500 characters before cursor

## Dependencies

- [00 — Project Scaffolding](../features/00-project-scaffolding.md) — needs app shell
- [01 — Note Editor](../features/01-note-editor.md) — inline completions integrate into CodeMirror editor
- [02 — Search & Organization](../features/02-search-and-organization.md) — semantic search extends existing search
- [09 — Sync Engine](../features/09-sync-engine.md) — AI-created notes must sync to server
- ns-api AI endpoints (already implemented) — no backend changes needed
