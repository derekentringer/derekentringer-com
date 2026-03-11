# 10a — AI Features: Foundation (Inline Completions, Summarize, Auto-Tag, Settings)

**Status:** Complete
**Phase:** 7 — AI
**Priority:** Medium
**Release:** 10a (first of 6 incremental AI releases)

## Summary

Ported the foundational AI trio (inline ghost text completions with completion styles, note summarization, smart auto-tagging) plus the AI settings UI from ns-web to ns-desktop. All backend work already done in ns-api — this was a frontend-only port. Desktop UI/UX matches the web app.

## What Was Implemented

### AI Settings Hook (`src/hooks/useAiSettings.ts`) — NEW

- `CompletionStyle` type: `"continue" | "markdown" | "brief" | "paragraph" | "structure"`
- `AudioMode` type: `"meeting" | "lecture" | "memo" | "verbatim"`
- `AiSettings` interface with all 12 fields (masterAiEnabled, completions, completionStyle, completionDebounceMs, continueWriting, summarize, tagSuggestions, rewrite, semanticSearch, audioNotes, audioMode, qaAssistant)
- `useAiSettings()` hook with localStorage persistence under `"ns-ai-settings"` key
- Validated loading with type-safe fallbacks for corrupted/partial data
- Identical implementation to ns-web

### AI API Client (`src/api/ai.ts`) — NEW

- `fetchCompletion(context, signal, style?)` — async generator, SSE streaming via `response.body.getReader()`
- `summarizeNote(noteId)` — POST `/ai/summarize`, returns summary string
- `suggestTags(noteId)` — POST `/ai/tags`, returns `string[]`
- Uses desktop's `apiFetch` from `./client.ts` (identical signature to web)

### Ghost Text Extension (`src/editor/ghostText.ts`) — NEW

- `ghostTextExtension(fetchFn, debounceMs?)` — CodeMirror 6 extension
- `StateField<string>` for ghost text state with `setGhostText`/`clearGhostText` effects
- `ViewPlugin` with 600ms debounce + `AbortController` lifecycle management
- `Decoration.widget` renders `<span class="cm-ghost-text">` after cursor
- `Prec.highest` keymap: Tab to accept (inserts text), Escape to dismiss
- Context window: last ~500 characters before cursor
- Clears on any document change (user typing)

### MarkdownEditor (`src/components/MarkdownEditor.tsx`) — MODIFIED

- Added `.cm-ghost-text` CSS rule to both dark and light theme definitions:
  - `opacity: "0.4"`, `fontStyle: "italic"`

### NotesPage (`src/pages/NotesPage.tsx`) — MODIFIED

- **Imports:** `useAiSettings`, `ghostTextExtension`, `fetchCompletion`, `summarizeNote`, `suggestTagsApi`
- **AI state:** `isSummarizing`, `isSuggestingTags`, `suggestedTags`, `confirmDeleteSummary`, `titleRef`
- **AI extensions:** `useMemo` building extension array gated on `masterAiEnabled` + `completions` + `completionStyle` + `completionDebounceMs`
- **Editor:** `extensions={[wikiLinkExt, ...aiExtensions]}`
- **Handlers:**
  - `handleSummarize()` — saves if dirty, calls API, persists summary to local SQLite via `updateNote`, triggers sync via `notifyLocalChange()`
  - `handleDeleteSummary()` — clears summary via `updateNote(id, { summary: null })`, syncs
  - `handleSuggestTags()` — saves if dirty, calls API, populates `suggestedTags` state
  - `handleAcceptTag(tag)` — adds tag via `updateNote`, refreshes tags sidebar, syncs
  - `handleDismissTag(tag)` — removes from suggested tags array
- **Toolbar status bar:** Sparkle icon (summarize) and tag icon (suggest tags) buttons between spacer and delete button, conditional on `masterAiEnabled` + feature toggle
- **Summary display:** Below title, before TagInput — italic text with ✕ delete button, ConfirmDialog for deletion
- **Suggested tags:** Below TagInput — "Suggested:" label with accept (+) and dismiss (✕) pills
- **Note switching:** `selectNote()` clears `suggestedTags` and `confirmDeleteSummary`
- **SettingsPage call:** Passes `aiSettings` and `updateAiSetting` props

### SettingsPage (`src/pages/SettingsPage.tsx`) — MODIFIED

- **New props:** `aiSettings: AiSettings`, `updateAiSetting: <K extends keyof AiSettings>(key: K, value: AiSettings[K]) => void`
- **AI Features section** (new `SectionCard` before Keyboard Shortcuts):
  - Master toggle: "Enable AI features" with info tooltip
  - "Inline completions" toggle with InfoIcon — when enabled, shows completion style radio group
  - Completion style radio group: Continue writing, Markdown assist, Brief — each with InfoIcon tooltip
  - "Summarize" toggle with InfoIcon
  - "Auto-tag suggestions" toggle with InfoIcon
  - All sub-toggles disabled when master toggle is off

## Desktop-Specific Adaptations (vs Web)

| Aspect | Web | Desktop |
|--------|-----|---------|
| **Save before AI call** | `isDirty` boolean + `updateNote` API | `isDirty()` function + `handleSave()` (local SQLite + sync) |
| **Summary persistence** | API handles it | Also save to local SQLite via `updateNote(id, { summary })` + `notifyLocalChange()` |
| **Tag acceptance** | `updateNote` API + `loadFolders()` | Local `updateNote` + `refreshTags()` + `notifyLocalChange()` |
| **Summary placement** | Between breadcrumb and TagInput | Between title and TagInput (no breadcrumb on desktop) |
| **Settings props** | Hook called internally | Received via props from NotesPage |

## Tests

### New Test Files
- `src/__tests__/useAiSettings.test.ts` — 11 tests: defaults, localStorage read, corruption handling, partial values, persistence, completionStyle validation/fallback, audioMode validation, debounceMs clamping, all 12 fields present
- `src/__tests__/ai-api.test.ts` — 8 tests: fetchCompletion SSE chunks, style parameter, error handling, empty body; summarizeNote returns summary, error; suggestTags returns array, error
- `src/__tests__/ghostText.test.ts` — 8 tests: extension returns array, custom debounceMs, StateField init, setGhostText effect, clearGhostText effect, doc change clears, Tab accept, Escape dismiss

### Modified Test Files
- `src/__tests__/SettingsPage.test.tsx` — 8 new tests: AI Features heading, master toggle, inline completions toggle, completion style radio visibility/hidden, summarize toggle, auto-tag toggle, master toggle persistence

## Files Summary

| File | Action |
|------|--------|
| `src/hooks/useAiSettings.ts` | Created |
| `src/api/ai.ts` | Created |
| `src/editor/ghostText.ts` | Created |
| `src/components/MarkdownEditor.tsx` | Modified |
| `src/pages/NotesPage.tsx` | Modified |
| `src/pages/SettingsPage.tsx` | Modified |
| `src/__tests__/useAiSettings.test.ts` | Created |
| `src/__tests__/ai-api.test.ts` | Created |
| `src/__tests__/ghostText.test.ts` | Created |
| `src/__tests__/SettingsPage.test.tsx` | Modified |

## Dependencies

- [01 — Note Editor](01-note-editor.md) — ghost text integrates into CodeMirror editor
- [09 — Sync Engine](09-sync-engine.md) — AI-created summaries and tags sync to server
- ns-api AI endpoints (`/ai/complete`, `/ai/summarize`, `/ai/tags`) — already implemented
