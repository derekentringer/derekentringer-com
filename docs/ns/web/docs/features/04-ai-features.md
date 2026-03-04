# 04 — AI Features

**Status:** Partial (04a–04c Complete; 04d–04g Not Started)
**Phase:** 3 — AI & Offline
**Priority:** Medium

## Summary

AI-powered features using the Claude API (via ns-api) for inline ghost text completions, note summarization, smart auto-tagging, and per-feature settings toggles. Implemented incrementally — 04a delivers the core AI trio (completions, summarize, auto-tag); semantic search, Q&A, and duplicate detection are deferred to later sub-releases.

## Incremental Releases

| Release | Branch | Summary | Status |
|---------|--------|---------|--------|
| **04a** | `feature/ns-04a-ai-features` | Inline ghost text completions (SSE streaming), note summarization, smart auto-tagging, AI settings page with toggles, sidebar footer redesign | Complete |
| **04a.1** | `feature/ns-04a1-completion-styles` | Completion style options — configurable styles (Continue writing, Markdown assist, Brief) with per-style system prompts and max_tokens | Complete |
| **04b** | `feature/ns-04b-select-and-rewrite` | Select-and-rewrite with floating menu, keyboard shortcut, right-click trigger, settings toggle | Complete |
| **04c** | `feature/ns-04c-semantic-search` | Semantic search (Voyage AI embeddings via pgvector, keyword/semantic/hybrid search modes, server-side toggle, background processor) | Complete |
| **04d** | — | Audio notes — voice recording → AI-structured markdown via Whisper + Claude | Not Started |
| **04e** | — | Q&A over notes (natural language questions with citations) | Not Started |
| **04f** | — | Duplicate detection (embedding similarity for review/merge) | Not Started |
| **04g** | — | Continue writing, heading/structure suggestions for empty notes | Not Started |

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

## Release 04a.1: Completion Style Options

### Summary

Adds configurable completion styles so the AI adapts its behavior based on user preference. Three styles are offered: **Continue writing** (default, natural text continuation), **Markdown assist** (focused on markdown syntax/formatting), and **Brief** (short completions, just a few words).

### API Changes

#### AI Service (`packages/ns-api/src/services/aiService.ts`)
- Added `CompletionStyle` type: `"continue" | "markdown" | "brief"`
- Added `COMPLETION_PROMPTS` map with style-specific system prompts
- Added `COMPLETION_MAX_TOKENS` map: `continue` and `markdown` → 200, `brief` → 50
- Updated `generateCompletion()` to accept optional `style` parameter (defaults to `"continue"`)

#### Routes (`packages/ns-api/src/routes/ai.ts`)
- Added optional `style` field to `/ai/complete` schema (enum: `["continue", "markdown", "brief"]`)
- Invalid style values rejected with 400
- Passes style to `generateCompletion()`, defaults to `"continue"` when omitted

### Frontend Changes

#### Settings Hook (`packages/ns-web/src/hooks/useAiSettings.ts`)
- Added `CompletionStyle` type export
- Added `completionStyle` field to `AiSettings` (default: `"continue"`)
- `loadSettings()` validates `completionStyle` against allowed values, falls back to `"continue"`
- Generalized `updateSetting` signature to `<K extends keyof AiSettings>(key: K, value: AiSettings[K])` to accept both booleans and style strings

#### Settings Page (`packages/ns-web/src/pages/SettingsPage.tsx`)
- Added radio-button group below the "Inline completions" toggle (conditionally rendered when completions enabled)
- Three options: Continue writing, Markdown assist, Brief
- Replaced `SETTING_LABELS` record with `TOGGLE_SETTINGS` array to skip `completionStyle` in toggle iteration

#### AI API Client (`packages/ns-web/src/api/ai.ts`)
- Added optional `style` parameter to `fetchCompletion()` — included in POST body when provided

#### NotesPage (`packages/ns-web/src/pages/NotesPage.tsx`)
- Updated `aiExtensions` memo to bind the current `completionStyle` via closure
- Added `settings.completionStyle` to `useMemo` dependency array

### Tests
- `useAiSettings.test.ts` — added tests for `completionStyle` read/write, invalid value fallback (3 new tests)
- `SettingsPage.test.tsx` — added tests for style radio group visibility, selection persistence, default (4 new tests)
- `aiService.test.ts` — added tests for style-based prompts, brief max_tokens, default style (3 new tests)
- `aiRoutes.test.ts` — added tests for style parameter acceptance, optional default, invalid style 400 (3 new tests)
- `ai-api.test.ts` — added test for style in request body (1 new test)

---

## Release 04b: Select-and-Rewrite

### Summary

Adds a select-and-rewrite feature: users select text in the editor, trigger a rewrite action via keyboard shortcut (`Cmd/Ctrl+Shift+R`) or right-click context menu, choose from six actions in a floating dropdown, and the selection is replaced with the AI result. Includes a settings toggle to enable/disable the feature.

### API Changes

#### AI Service (`packages/ns-api/src/services/aiService.ts`)
- Added `RewriteAction` type: `"rewrite" | "concise" | "fix-grammar" | "to-list" | "expand" | "summarize"`
- Added `REWRITE_PROMPTS` map with action-specific system prompts
- Added `REWRITE_MAX_TOKENS` map: `expand` → 800, `rewrite`/`fix-grammar`/`to-list` → 500, `concise` → 300, `summarize` → 200
- Added `rewriteText(text, action)` — non-streaming, `temperature: 0.3`, returns trimmed text

#### Routes (`packages/ns-api/src/routes/ai.ts`)
- `POST /ai/rewrite` — JSON; body `{ text: string (1–10000 chars), action: enum[6] }`; returns `{ text: result }`
- Schema uses `additionalProperties: false`, validates action enum
- Auth inherited from existing `onRequest` hook

### Frontend Changes

#### AI API Client (`packages/ns-web/src/api/ai.ts`)
- Added `RewriteAction` type export
- Added `rewriteText(text, action)` — POST to `/ai/rewrite`, returns `data.text`

#### CodeMirror Rewrite Menu Extension (`packages/ns-web/src/editor/rewriteMenu.ts`) — NEW
- Self-contained CodeMirror 6 extension: `rewriteExtension(rewriteFn)`
- `rewriteFnFacet` — Facet storing the rewrite callback for tooltip DOM access
- `RewriteMenuState` — tracks `{ from, to, status: "open" | "loading" | "error" }`
- Effects: `openRewriteMenu`, `closeRewriteMenu`, `setRewriteLoading`, `setRewriteError`
- `rewriteMenuField` StateField: manages menu state, auto-closes on doc change or selection change
- Tooltip via `showTooltip.computeN`: positioned at selection end, `above: true`
- Tooltip DOM: 6 action buttons (open), "Rewriting..." text (loading), error message with 2s auto-close (error)
- Buttons use `mousedown` + `preventDefault()` to prevent editor blur/selection loss
- `Prec.high` keymap: `Mod-Shift-r` opens menu when text selected, `Escape` closes menu when open
- Right-click handler via `EditorView.domEventHandlers`: intercepts `contextmenu` when text selected, falls through otherwise
- Includes `tooltips()` from `@codemirror/view`

#### MarkdownEditor (`packages/ns-web/src/components/MarkdownEditor.tsx`)
- Added rewrite menu CSS to dark theme: `.cm-rewrite-menu` (dark bg, rounded, shadow), `.cm-rewrite-action` (button styles with lime-yellow hover), `.cm-rewrite-loading` (lime-yellow), `.cm-rewrite-error` (red)

#### Settings Hook (`packages/ns-web/src/hooks/useAiSettings.ts`)
- Added `rewrite: boolean` to `AiSettings` interface (default: `false`)
- Persisted in localStorage with boolean validation and fallback

#### Settings Page (`packages/ns-web/src/pages/SettingsPage.tsx`)
- Added "Select-and-rewrite" toggle to AI Features section (4th toggle)
- Added "Keyboard Shortcuts" reference section below AI Features with 7 shortcuts
- Platform-aware shortcut labels: `Cmd` on Mac, `Ctrl` on other platforms

#### NotesPage (`packages/ns-web/src/pages/NotesPage.tsx`)
- `rewriteExtension(rewriteText)` added to `aiExtensions` memo, gated on `settings.rewrite`
- Added `settings.rewrite` to `useMemo` dependency array

### Tests
- `aiService.test.ts` — 5 new tests: rewrite per-action prompts, max_tokens, trimming, non-text response, empty string fallback
- `aiRoutes.test.ts` — 6 new tests: 200 with rewritten text, all valid actions, missing text/action 400, invalid action 400, 401 without auth
- `ai-api.test.ts` — 3 new tests: returns text, sends correct body, throws on non-ok response
- `rewriteMenu.test.ts` — 10 new tests (NEW FILE): extension validity, StateField init, open/close effects, auto-close on doc/selection change, selection checks
- `SettingsPage.test.tsx` — 2 new tests: keyboard shortcuts heading, shortcut descriptions; updated toggle count to 4
- `useAiSettings.test.ts` — updated all expected defaults to include `rewrite: false`
- `NotesPage.test.tsx` — updated mocks for `rewriteExtension` and `rewriteText`

---

## Release 04c: Semantic Search

### Summary

Adds semantic search using Voyage AI vector embeddings stored in PostgreSQL via pgvector. Notes are embedded asynchronously by a background processor. Users can search by meaning with three modes: **Keyword** (existing tsvector), **Semantic** (cosine similarity on embeddings), and **Hybrid** (weighted combination: 0.3 keyword + 0.7 semantic). The feature is gated by a server-side setting toggle.

### Database Changes

#### Prisma Migration (`20260304000000_add_embeddings`)
- `CREATE EXTENSION IF NOT EXISTS vector` — enables pgvector
- Added `embedding vector(512)` column to `notes` table (Voyage `voyage-3-lite` outputs 512 dimensions)
- Added `embeddingUpdatedAt TIMESTAMP(3)` column to `notes` table
- Created HNSW index: `CREATE INDEX note_embedding_idx ON "notes" USING hnsw (embedding vector_cosine_ops)`
- Created `settings` table: `id TEXT PRIMARY KEY, value TEXT NOT NULL, "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP`

#### Prisma Schema (`packages/ns-api/prisma/schema.prisma`)
- Added `embedding Unsupported("vector(512)")?` and `embeddingUpdatedAt DateTime?` to Note model
- Added `Setting` model: `id String @id, value String, updatedAt DateTime @default(now()) @updatedAt`

### API Changes

#### Config (`packages/ns-api/src/config.ts`)
- Added `voyageApiKey` to Config interface
- Reads from `VOYAGE_API_KEY` env var (empty string fallback for dev/test)
- Added to required secrets list for production enforcement

#### Embedding Service (`packages/ns-api/src/services/embeddingService.ts`) — NEW
- `generateEmbedding(text)` — calls Voyage AI REST API (`POST https://api.voyageai.com/v1/embeddings`, model `voyage-3-lite`, `input_type: "document"`)
- `generateQueryEmbedding(text)` — same but `input_type: "query"`
- Input truncated to 4000 chars for API safety
- Returns `data[0].embedding` array

#### Setting Store (`packages/ns-api/src/store/settingStore.ts`) — NEW
- `getSetting(key)` / `setSetting(key, value)` — Prisma findUnique/upsert on Setting model
- `isEmbeddingEnabled()` — reads `"embeddingEnabled"` key, defaults `false`
- `setEmbeddingEnabled(enabled)` — writes boolean as string

#### Embedding Processor (`packages/ns-api/src/services/embeddingProcessor.ts`) — NEW
- `startEmbeddingProcessor()` — returns `{ stop }` handle, runs every 60s
- Each tick: checks `isEmbeddingEnabled()`, queries notes where `embeddingUpdatedAt IS NULL OR embeddingUpdatedAt < updatedAt`, generates embedding, updates note
- Batch size of 1 per tick (Voyage free tier: 3 RPM)
- Rate-limit delay of 22s between notes in `processAllPendingEmbeddings()`
- Skips notes with empty content (marks as current without embedding)
- Uses `NOW() AT TIME ZONE 'UTC'` for consistent timestamp comparison with Prisma's UTC storage
- `processAllPendingEmbeddings()` exported for on-demand use when enabling

#### App (`packages/ns-api/src/app.ts`)
- Wired `startEmbeddingProcessor()` in `onReady` hook alongside existing cleanup jobs
- Stops in `onClose` hook

#### Note Store (`packages/ns-api/src/store/noteStore.ts`)
- Added `semanticSearch(query, filter, pageSize, skip)` — generates query embedding, raw SQL with `1 - (embedding <=> $1::vector)` for cosine similarity, similarity threshold > 0.3, sorted by similarity
- Added `hybridSearch(query, filter, pageSize, skip)` — combines tsvector rank (normalized) + cosine similarity with weights (0.3 keyword + 0.7 semantic)
- Updated `searchNotes()` to accept `mode: "keyword" | "semantic" | "hybrid"` parameter and delegate to appropriate implementation

#### Routes — AI (`packages/ns-api/src/routes/ai.ts`)
- `POST /ai/embeddings/enable` — sets `embeddingEnabled` to true, triggers `processAllPendingEmbeddings()` in background, returns `{ enabled: true }`
- `POST /ai/embeddings/disable` — sets `embeddingEnabled` to false, returns `{ enabled: false }`
- `GET /ai/embeddings/status` — returns `{ enabled, pendingCount, totalWithEmbeddings }`

#### Routes — Notes (`packages/ns-api/src/routes/notes.ts`)
- Added `searchMode` query parameter to `GET /notes` (enum: `keyword`, `semantic`, `hybrid`)
- Passed to `noteStore.searchNotes()` when `search` param is present

### Shared Types (`packages/shared/src/ns/types.ts`)
- Added `EmbeddingStatus` interface: `{ enabled: boolean, pendingCount: number, totalWithEmbeddings: number }`

### Frontend Changes

#### AI API Client (`packages/ns-web/src/api/ai.ts`)
- Added `enableEmbeddings()` — POST `/ai/embeddings/enable`
- Added `disableEmbeddings()` — POST `/ai/embeddings/disable`
- Added `getEmbeddingStatus()` — GET `/ai/embeddings/status`

#### Notes API (`packages/ns-web/src/api/notes.ts`)
- Added `searchMode?: "keyword" | "semantic" | "hybrid"` parameter to `fetchNotes()`
- Appended to URLSearchParams when present

#### Settings Hook (`packages/ns-web/src/hooks/useAiSettings.ts`)
- Added `semanticSearch: boolean` to `AiSettings` (default: `false`)
- Persisted in localStorage, controls UI visibility of search mode selector

#### Settings Page (`packages/ns-web/src/pages/SettingsPage.tsx`)
- Added "Semantic search" toggle to AI Features section (5th toggle)
- When toggled ON: calls `enableEmbeddings()` API
- When toggled OFF: calls `disableEmbeddings()` API
- Shows embedding status below toggle when enabled (pending count, total embedded)

#### NotesPage (`packages/ns-web/src/pages/NotesPage.tsx`)
- Added search mode `<select>` dropdown inline with search input when `settings.semanticSearch` is enabled
- Options: Keyword, Semantic, Hybrid (default: Hybrid when semantic search enabled)
- Passes selected `searchMode` to `fetchNotes()`
- Header shows "Search Results" (hiding sort/add controls) when search is active

### Tests
- `embeddingService.test.ts` — NEW: Voyage API calls, model/input_type, truncation, query embedding, error handling (5 tests)
- `settingStore.test.ts` — NEW: getSetting null, setSetting roundtrip, isEmbeddingEnabled default, setEmbeddingEnabled (4 tests)
- `embeddingProcessor.test.ts` — NEW: processes pending notes, handles errors, start/stop, skips when disabled (4 tests)
- `aiRoutes.test.ts` — added embedding enable/disable/status endpoints + 401 auth tests (6 new tests)
- `noteStore.test.ts` — added semantic/hybrid search mode delegation tests (3 new tests)
- `config.test.ts` — added voyageApiKey to expected config shape
- `ai-api.test.ts` — added enableEmbeddings, disableEmbeddings, getEmbeddingStatus tests (3 new tests)
- `useAiSettings.test.ts` — added semanticSearch field defaults and persistence
- `SettingsPage.test.tsx` — updated toggle count, tested semantic search toggle
- `NotesPage.test.tsx` — tested search mode selector visibility, updated mocks

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
