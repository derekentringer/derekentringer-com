# 10e — AI Features: AI Assistant Chat

**Status:** Complete
**Phase:** 7 — AI
**Priority:** Medium
**Release:** 10e (fifth of 6 incremental AI releases)

## Summary

Ported the AI assistant chat panel from ns-web to ns-desktop. Users ask natural language questions about their notes and receive streaming AI-generated answers with citations. The panel is a tab in the existing right-side drawer (shared with Version History), with animated slide-in, streaming responses rendered as markdown, and clickable source pills linking to cited notes. Also added focus mode (Cmd/Ctrl+Shift+D) to hide sidebar and drawer tabs for distraction-free editing, Cmd/Ctrl+S manual save shortcut, and unified keyboard shortcuts across web and desktop Settings pages.

## What Was Implemented

### AI API Client (`src/api/ai.ts`) — MODIFIED

- Added `QASource` import from `@derekentringer/ns-shared`
- Added `AskQuestionEvent` interface: `{ sources?: QASource[], text?: string }`
- Added `askQuestion(question, signal)` — async generator, POST `/ai/ask` with SSE streaming, same parsing pattern as `fetchCompletion`, yields `AskQuestionEvent` objects

### QAPanel Component (`src/components/QAPanel.tsx`) — NEW

Ported from `ns-web/src/components/QAPanel.tsx`:
- Chat panel with streaming AI assistant answers, Clear button
- Scrollable messages area with auto-scroll to bottom
- User messages: right-aligned accent-colored bubbles
- Assistant messages: left-aligned card-styled with ReactMarkdown + remarkGfm rendering
- Citation handling: `[Title]` references stripped from displayed text via regex, deduplicated cited titles shown as clickable source pills at bottom of each reply with `border-t` separator
- Source pills: `rounded-md` styling with `cursor-pointer`, click calls `onSelectNote(id)`
- Input area: text input + Ask/Stop button, AbortController for cancellation
- Auto-focus input when panel opens
- Props: `onSelectNote`, `isOpen`

### Settings Page (`src/pages/SettingsPage.tsx`) — MODIFIED

- Added `"qaAssistant"` to `AI_TOGGLE_SETTINGS` type union and array: `{ key: "qaAssistant", label: "AI assistant chat", info: "Ask natural language questions about your notes. Requires semantic search to be enabled." }`
- `qaAssistant` toggle disabled when `semanticSearch` is off
- When `semanticSearch` toggled off, `qaAssistant` auto-disabled (cascade)
- Added `Tab` to keyboard shortcuts list: `{ shortcut: "Tab", macShortcut: "Tab", description: "Accept AI completion" }`
- Unified focus mode description: "Toggle focus mode (hide panels)"

### NotesPage (`src/pages/NotesPage.tsx`) — MODIFIED

- `DrawerTab` type expanded: `"assistant" | "history"` (was `"history"` only)
- Added `QAPanel` import
- Drawer resize updated to match web: `initialSize: 350, minSize: 250, maxSize: 600` (was 300/200/500)
- Added `focusMode` state + `focusModeDrawerRef` for focus mode
- Added `useEffect` to close drawer when `qaAssistant` setting disabled
- Added `handleQaSelectNote` callback: switches to notes view if in trash, finds note and opens as tab, or reloads notes and selects by ID
- AI Assistant tab button: chat bubble SVG icon, always visible when setting enabled (not gated on `selectedId`), positioned above Version History tab
- Version History tab: only shown when a note is selected (matching web pattern)
- Drawer content: `QAPanel` shown when `drawerTab === "assistant"`, `VersionHistoryPanel` shown when `drawerTab === "history"`
- Tab buttons hidden in focus mode (`{!focusMode && ...}`)
- Added `Cmd/Ctrl+S` keyboard shortcut for manual save
- Added `Cmd/Ctrl+Shift+D` keyboard shortcut for focus mode toggle (collapses sidebar, hides sidebar divider, hides drawer tabs; restores drawer state on exit)
- Sidebar width: `focusMode ? 0 : sidebarResize.size`
- Sidebar divider: wrapped in `focusMode`-aware container with `pointerEvents: "none"` and `width: 0` when active

### Web App Changes

#### NotesPage (`ns-web/src/pages/NotesPage.tsx`) — MODIFIED
- Added `Cmd/Ctrl+K` keyboard shortcut for focus search (was desktop-only)

#### Settings Page (`ns-web/src/pages/SettingsPage.tsx`) — MODIFIED
- Added `Cmd/Ctrl+K` to keyboard shortcuts list: `{ shortcut: "Ctrl + K", macShortcut: "Cmd + K", description: "Focus search" }`

## Tests

### New Test Files
- `src/__tests__/QAPanel.test.tsx` — 4 tests: Clear button renders when messages exist, Ask button disabled when empty, Ask button enabled with text, source pill click calls onSelectNote

### Modified Test Files
- `src/__tests__/ai-api.test.ts` — 3 new tests: askQuestion yields text events from SSE stream, yields source events, throws on non-ok response
- `src/__tests__/SettingsPage.test.tsx` — 4 new tests: AI assistant chat toggle renders, qaAssistant toggle disabled when semanticSearch off, enabled when semanticSearch on, toggling semanticSearch off auto-disables qaAssistant

## Files Summary

| File | Action |
|------|--------|
| `ns-desktop/src/components/QAPanel.tsx` | Created — AI assistant chat panel |
| `ns-desktop/src/api/ai.ts` | Modified — AskQuestionEvent, askQuestion |
| `ns-desktop/src/pages/SettingsPage.tsx` | Modified — qaAssistant toggle, Tab shortcut, focus mode label |
| `ns-desktop/src/pages/NotesPage.tsx` | Modified — drawer integration, focus mode, Cmd+S, Cmd+Shift+D |
| `ns-desktop/src/__tests__/QAPanel.test.tsx` | Created — 4 tests |
| `ns-desktop/src/__tests__/ai-api.test.ts` | Modified — 3 tests |
| `ns-desktop/src/__tests__/SettingsPage.test.tsx` | Modified — 4 tests |
| `ns-web/src/pages/NotesPage.tsx` | Modified — Cmd+K shortcut |
| `ns-web/src/pages/SettingsPage.tsx` | Modified — Cmd+K in shortcuts list |

## Dependencies

- [10a — AI Features: Foundation](10a-ai-features-foundation.md) — uses AI settings hook and API client
- [10c — AI Features: Semantic Search](10c-ai-semantic-search.md) — qaAssistant requires semanticSearch
- ns-api `/ai/ask` endpoint — already implemented (semantic search + Claude streaming)
