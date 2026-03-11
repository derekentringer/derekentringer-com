# 10c — AI Features: Semantic Search

**Status:** Complete
**Phase:** 7 — AI
**Priority:** Medium
**Release:** 10c (third of 6 incremental AI releases)

## Summary

Added keyword, semantic, and hybrid search modes to the NoteSync desktop app. Embeddings are generated via ns-api's Voyage AI endpoint and cached locally in SQLite as JSON text. Cosine similarity is computed in pure JavaScript (no sqlite-vec extension — Tauri's SQL plugin doesn't support extension loading). All three search modes work offline once embeddings are cached. A new backend endpoint was added for on-demand embedding generation.

## What Was Implemented

### Backend — Embedding Generation Endpoint

#### AI Routes (`ns-api/src/routes/ai.ts`) — MODIFIED

- Added `POST /ai/embeddings/generate` endpoint
- Schema: `{ text: string (1-10000), inputType: "document" | "query" }`
- Calls `generateEmbedding` or `generateQueryEmbedding` from embeddingService based on inputType
- Returns `{ embedding: number[] }`

### SQLite Migration (`src-tauri/migrations/008.sql`) — NEW

```sql
CREATE TABLE IF NOT EXISTS note_embeddings (
  note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
  embedding TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Stores embeddings as JSON text (array of floats), not BLOB or sqlite-vec virtual table.

### Tauri Migration Registration (`src-tauri/src/lib.rs`) — MODIFIED

- Added migration 8 entry for `note_embeddings` table

### AI API Client (`src/api/ai.ts`) — MODIFIED

- `requestEmbedding(text)` — POST with `inputType: "document"`, returns `number[]`
- `requestQueryEmbedding(text)` — POST with `inputType: "query"`, returns `number[]`

### Embedding Service (`src/lib/embeddingService.ts`) — NEW

**DB helpers** (uses `@tauri-apps/plugin-sql`, same `Database.load("sqlite:notesync.db")` pattern as `db.ts`):
- `getEmbedding(noteId)` — returns parsed `number[]` or null
- `upsertEmbedding(noteId, embedding)` — INSERT ON CONFLICT UPDATE, stores as `JSON.stringify`
- `deleteEmbedding(noteId)` — removes embedding row
- `getAllEmbeddings()` — returns `{ noteId, embedding }[]`
- `getEmbeddingStatus()` — returns `{ isProcessing, pendingCount, totalWithEmbeddings }`

**Pure JS cosine similarity:**
- `cosineSimilarity(a, b)` — dot product / (normA * normB), handles zero/empty vectors

**Background processor:**
- `processAllPendingEmbeddings()` — LEFT JOIN to find notes without embeddings, calls `requestEmbedding`, 22s rate limit (Voyage free tier), AbortController for cancellation, fails silently when offline
- `stopEmbeddingProcessor()` — cancels in-flight processing
- `setEmbeddingStatusCallback(cb)` — for UI status updates
- `queueEmbeddingForNote(noteId, title, content)` — single-note, fire-and-forget

Constants: `SIM_THRESHOLD = 0.3`, `MIN_CONTENT_LEN = 20`, `RATE_LIMIT_MS = 22_000`

### Search Functions (`src/lib/db.ts`) — MODIFIED

- `SearchMode` type export: `"keyword" | "semantic" | "hybrid"`
- Renamed original `searchNotes` → `searchNotesKeyword` (private)
- New `searchNotes(query, mode = "keyword")` dispatcher — backward compatible
- `searchNotesSemantic(query)` — generates query embedding via API, compares against all stored embeddings using pure JS cosine similarity, filters ≥ 0.3 threshold, returns results sorted by similarity
- `searchNotesHybrid(query)` — runs keyword + semantic in parallel, position-based normalization for keyword scores, combines with `0.3 * keyword + 0.7 * semantic + 0.3` keyword-match bonus (matches web scoring), deduplicates, sorts by hybrid score
- Added `deleteEmbedding` call in `softDeleteNote` (fire-and-forget)
- Uses dynamic imports for `embeddingService.ts` and `api/ai.ts` to avoid circular dependencies

### Sync Engine Integration (`src/lib/syncEngine.ts`) — MODIFIED

- Added `semanticSearchEnabled` flag and `setSyncSemanticSearchEnabled(enabled)` export
- In `applyNoteChange`: after `upsertNoteFromRemote`, if enabled and not deleted, queues embedding via dynamic import

### Settings Page (`src/pages/SettingsPage.tsx`) — MODIFIED

- Widened `AI_TOGGLE_SETTINGS` key type to include `"semanticSearch"`
- Added 5th entry: `{ key: "semanticSearch", label: "Semantic search", info: "Search notes by meaning, not just exact keywords. Uses AI embeddings generated via the server." }`
- Added `EmbeddingStatus` interface and `embeddingStatus` prop
- Renders embedding status below toggle when enabled: "X of Y notes indexed" / "Indexing notes..."

### NotesPage (`src/pages/NotesPage.tsx`) — MODIFIED

- Added `searchMode` state (`SearchMode`, default `"hybrid"`)
- Added `embeddingStatus` state for UI display
- Lifecycle effect: syncs semantic flag + starts/stops background processor based on `aiSettings.masterAiEnabled && aiSettings.semanticSearch`
- Search effect: uses `effectiveSearchMode` (falls back to `"keyword"` when semantic disabled)
- Search bar: wrapping div with flex layout, conditional `<select>` dropdown (Keyword/Semantic/Hybrid) when semantic enabled
- `handleSave`: queues embedding when semantic enabled
- Passes `embeddingStatus` to SettingsPage

### UI Bug Fixes (both ns-desktop and ns-web)

- **Tag panel blur fix**: Added `onMouseDown` with `preventDefault()` on search panel container to prevent input blur when clicking tags or "show more" button
- **TagBrowser animation**: Added `expandedHeight` state tracking scrollHeight, `transition-[max-height] duration-200 ease-in-out` for smooth expand/collapse
- **"clear filter" styling**: Lowercase text, right-aligned via flex `justify-between` wrapper
- **Scrollable tag panel**: Changed from `overflow-hidden` to `overflow-y-auto overflow-x-hidden`

## Architecture Decisions

- **JSON text over sqlite-vec**: Tauri's SQL plugin doesn't support SQLite extension loading, so embeddings are stored as JSON text and cosine similarity is computed in pure JavaScript. Performance is acceptable for typical note counts (hundreds to low thousands).
- **22s rate limit**: Voyage AI free tier rate limiting. The background processor spaces requests accordingly.
- **Dynamic imports**: `embeddingService.ts` and `api/ai.ts` are imported dynamically in `db.ts` and `syncEngine.ts` to avoid circular dependency issues.
- **Fire-and-forget embedding**: Save operations and sync pulls queue embeddings without blocking the main flow.

## Tests

### New Test Files
- `src/__tests__/embeddingService.test.ts` — 8 tests: cosineSimilarity (identical→1, orthogonal→0, opposite→-1, empty vectors, zero vectors), getEmbedding, upsertEmbedding, deleteEmbedding, getAllEmbeddings, getEmbeddingStatus

### Modified Test Files
- `src/__tests__/ai-api.test.ts` — 3 new tests: requestEmbedding returns array, throws on error; requestQueryEmbedding sends query inputType
- `ns-api/src/__tests__/aiRoutes.test.ts` — 4 new tests: document embedding (200), query embedding (200), missing fields (400), auth required (401)

## Files Summary

| File | Action |
|------|--------|
| `ns-api/src/routes/ai.ts` | Modified — POST /ai/embeddings/generate |
| `ns-api/src/__tests__/aiRoutes.test.ts` | Modified — embedding endpoint tests |
| `ns-desktop/src-tauri/migrations/008.sql` | Created — note_embeddings table |
| `ns-desktop/src-tauri/src/lib.rs` | Modified — migration 8 |
| `ns-desktop/src/api/ai.ts` | Modified — requestEmbedding, requestQueryEmbedding |
| `ns-desktop/src/lib/embeddingService.ts` | Created — storage, cosine similarity, processor |
| `ns-desktop/src/lib/db.ts` | Modified — SearchMode, keyword/semantic/hybrid search |
| `ns-desktop/src/lib/syncEngine.ts` | Modified — semantic flag, queue on pull |
| `ns-desktop/src/pages/SettingsPage.tsx` | Modified — 5th toggle, embedding status |
| `ns-desktop/src/pages/NotesPage.tsx` | Modified — searchMode state, dropdown, lifecycle, save hook |
| `ns-desktop/src/__tests__/embeddingService.test.ts` | Created — 8 tests |
| `ns-desktop/src/__tests__/ai-api.test.ts` | Modified — 3 tests |
| `ns-desktop/src/components/TagBrowser.tsx` | Modified — animation, clear filter, blur fix |
| `ns-web/src/components/TagBrowser.tsx` | Modified — animation, clear filter, blur fix |
| `ns-web/src/pages/NotesPage.tsx` | Modified — tag panel blur fix, scrollable overflow |
| `ns-desktop/src/pages/NotesPage.tsx` | Modified — tag panel blur fix, scrollable overflow |

## Dependencies

- [10a — AI Features: Foundation](10a-ai-features-foundation.md) — uses AI settings hook and API client
- [02 — Search & Organization](02-search-and-organization.md) — semantic search extends existing keyword search
- [09 — Sync Engine](09-sync-engine.md) — embedding queue on sync pull
- ns-api `/ai/embeddings/*` endpoints — generate endpoint added in this release
