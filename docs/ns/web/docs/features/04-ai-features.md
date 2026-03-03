# 04 — AI Features

**Status:** Partial (04a Complete; 04b–04f Not Started)
**Phase:** 3 — AI & Offline
**Priority:** Medium

## Summary

AI-powered features using the Claude API (via ns-api) for inline ghost text completions, note summarization, smart auto-tagging, and per-feature settings toggles. Implemented incrementally — 04a delivers the core AI trio (completions, summarize, auto-tag); semantic search, Q&A, and duplicate detection are deferred to later sub-releases.

## Incremental Releases

| Release | Branch | Summary | Status |
|---------|--------|---------|--------|
| **04a** | `feature/ns-04a-ai-features` | Inline ghost text completions (SSE streaming), note summarization, smart auto-tagging, AI settings page with toggles, sidebar footer redesign | Complete |
| **04b** | — | Select-and-rewrite (rewrite, concise, grammar, list, expand, summarize) | Not Started |
| **04c** | — | Semantic search (pgvector embeddings, complementing tsvector keyword search) | Not Started |
| **04d** | — | Q&A over notes (natural language questions with citations) | Not Started |
| **04e** | — | Duplicate detection (embedding similarity for review/merge) | Not Started |
| **04f** | — | Continue writing, heading/structure suggestions for empty notes | Not Started |

---

## Release 04a: Summarize, Auto-Tag, Inline Completions

### API Changes

#### Config (`packages/ns-api/src/config.ts`)
- Added `anthropicApiKey` to Config interface
- Reads from `ANTHROPIC_API_KEY` env var (empty string fallback for dev/test)
- Added to required secrets list for production enforcement

#### AI Service (`packages/ns-api/src/services/aiService.ts`)
- Wraps `@anthropic-ai/sdk` with lazy client initialization
- `generateCompletion(context, signal?)` — async generator, streams text via `messages.create({ stream: true })` with `claude-sonnet-4-20250514`, `max_tokens: 200`, `temperature: 0.7`
- `generateSummary(title, content)` — non-streaming, returns 1–3 sentence summary, `max_tokens: 150`, `temperature: 0.3`
- `suggestTags(title, content, existingTags)` — non-streaming, returns JSON array of tag strings, reuses existing tags when relevant, `max_tokens: 100`, `temperature: 0.3`

#### Routes (`packages/ns-api/src/routes/ai.ts`)
- `POST /ai/complete` — SSE streaming via `PassThrough` stream; body `{ context: string }`; yields `data: {"text":"chunk"}\n\n` per delta, ends with `data: [DONE]\n\n`; client disconnect detection via `request.raw.socket.on("close")`
- `POST /ai/summarize` — JSON; body `{ noteId: string }`; fetches note, generates summary, saves to DB, returns `{ summary }`
- `POST /ai/tags` — JSON; body `{ noteId: string }`; fetches note + existing tags, returns `{ tags: string[] }` (suggestions only, not auto-applied)
- All endpoints require authentication; UUID validation on noteId

#### Schema Changes
- Added `summary` field support to `updateNote()` in noteStore
- Added `summary` to PATCH `/notes/:id` schema

### Shared Types (`packages/shared/src/ns/types.ts`)
- Added `summary?: string | null` to `UpdateNoteRequest`
- Added `AiCompleteRequest`, `AiSummarizeRequest`, `AiSuggestTagsRequest`, `AiSuggestTagsResponse` interfaces

### Frontend Changes

#### AI API Client (`packages/ns-web/src/api/ai.ts`)
- `fetchCompletion(context, signal)` — async generator, reads SSE via `response.body.getReader()` + `TextDecoder`, parses `data:` lines, yields text chunks
- `summarizeNote(noteId)` — returns summary string
- `suggestTags(noteId)` — returns tags array

#### CodeMirror Ghost Text Extension (`packages/ns-web/src/editor/ghostText.ts`)
- Self-contained CodeMirror 6 extension: `ghostTextExtension(fetchFn)`
- `StateField<string>` holds current ghost text (clears on doc change)
- `ViewPlugin` manages 600ms debounce + fetch lifecycle with `AbortController`
- `Decoration.widget` renders ghost text as `<span class="cm-ghost-text">` (opacity 0.4, italic)
- `Prec.highest` keymap: Tab to accept (inserts text at cursor), Escape to dismiss
- Context: last ~500 characters before cursor

#### Settings Page (`packages/ns-web/src/pages/SettingsPage.tsx`)
- Dedicated `/settings` route with three toggle switches (all default OFF):
  - Inline completions — ghost text suggestions while typing
  - Summarize — AI-generated note summaries
  - Auto-tag suggestions — AI-suggested tags
- Settings persisted in `localStorage` under `"ns-ai-settings"`

#### Settings Hook (`packages/ns-web/src/hooks/useAiSettings.ts`)
- `useAiSettings()` — reads/writes AI settings from localStorage
- Robust parsing with fallbacks for corrupted/partial data

#### NotesPage Integration (`packages/ns-web/src/pages/NotesPage.tsx`)
- Ghost text wired conditionally on `settings.completions` via `useMemo`
- Summarize button (sparkle icon) in editor toolbar, conditional on `settings.summarize`
- Suggest Tags button (tag icon) in editor toolbar, conditional on `settings.tagSuggestions`
- Summary displayed below note title (italic, muted)
- Suggested tags shown as pills with accept (+) and dismiss (✕) actions

#### Sidebar Footer Redesign
- Changed from text labels to icon-only buttons with `title` attribute tooltips
- Left group: Trash icon (with badge) + Settings gear icon (navigates to `/settings`)
- Right: Sign out icon

#### MarkdownEditor (`packages/ns-web/src/components/MarkdownEditor.tsx`)
- Added `.cm-ghost-text` styles to dark theme

### Tests
- `aiService.test.ts` — mocks `@anthropic-ai/sdk`, tests streaming, summary, tag parsing (6 tests)
- `aiRoutes.test.ts` — integration tests with auth for all 3 endpoints + 401/400/404 (10 tests)
- `ai-api.test.ts` — mocks `apiFetch`, tests SSE parsing, summarize, suggestTags (5 tests)
- `ghostText.test.ts` — tests StateField, effects, Tab/Escape keymaps (6 tests)
- `SettingsPage.test.tsx` — tests toggle rendering, defaults, localStorage persistence (5 tests)
- `useAiSettings.test.ts` — tests defaults, read/write, corruption handling (5 tests)
- Updated: `config.test.ts`, `notes.test.ts`, `noteStore.test.ts`, `NotesPage.test.tsx`

---

## Technical Considerations

- All AI calls route through ns-api → Claude API; web never calls Claude directly
- Streaming: uses `messages.create({ stream: true })` (not `messages.stream()`) — the latter has iteration issues with async generator consumers in SDK v0.78.0
- SSE route uses `PassThrough` stream (not `Readable.from()`) to prevent premature stream termination
- Client disconnect detected via `request.raw.socket.on("close")` (not `request.raw.on("close")` which fires on request body consumption)
- Ghost text extension built directly in ns-web (not the shared `@derekentringer/codemirror-ai-markdown` package yet — extract when desktop app needs it)
- Cost control: 600ms debounce on completions, AbortController cancels in-flight requests on new keystrokes

## Dependencies

- [00 — Project Scaffolding](00-project-scaffolding.md) — needs API infrastructure
- [01 — Auth](01-auth.md) — all AI endpoints require authentication
- [02 — Note Management](02-note-management.md) — inline completions integrate into the editor
- [03 — Search & Organization](03-search-and-organization.md) — tag suggestions leverage existing tag system
