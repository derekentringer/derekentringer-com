# 04 — AI Features

**Status:** Not Started
**Phase:** 3 — AI & Offline
**Priority:** Medium

## Summary

AI-powered features using the Claude API (via notesync-api) for smart tagging, summarization, semantic search, Q&A over notes, duplicate detection, and inline AI-assisted markdown writing via the custom CodeMirror 6 extension.

## Requirements

- **AI-assisted markdown writing** (custom CodeMirror 6 extension):
  - `@derekentringer/codemirror-ai-markdown` — same extension used on desktop
  - **Inline ghost text completions**: Claude suggests next sentence/paragraph as gray ghost text; Tab to accept, Escape or keep typing to dismiss
  - **Select-and-rewrite**: select text, trigger AI rewrite via context menu or keyboard shortcut (rewrite, make concise, fix grammar, convert to list, expand, summarize)
  - **Continue writing**: Ctrl+Shift+Space to generate next paragraph
  - **Heading/structure suggestions**: suggest outline for new/empty notes based on title
  - NoteSync wires the extension's callback to `POST /ai/complete` on notesync-api
- **Smart auto-tagging**:
  - Analyze note content and suggest tags
  - User accepts or dismisses suggestions
  - Trigger: on note save (debounced) or manual
  - API: `POST /ai/tags`
- **Note summarization**:
  - Generate 1-3 sentence summary
  - Stored as `summary` field on the Note model
  - Displayed in note list/cards
  - API: `POST /ai/summarize`
- **Semantic search**:
  - Generate vector embeddings for notes via Claude API or dedicated embedding model
  - Store in PostgreSQL via pgvector
  - Search by meaning (e.g., "notes about weekend plans")
  - Complement tsvector keyword search — show both result types
  - API: `POST /ai/search`
- **Q&A over notes**:
  - Natural language question input
  - System finds relevant notes (semantic + keyword), sends as context to Claude
  - Returns answer with citations linking to source notes
  - Chat-style panel
  - API: `POST /ai/ask`
- **Duplicate detection**:
  - Use embeddings to find notes with similar content
  - Surface duplicates for review; user can merge or dismiss
  - API: `POST /ai/duplicates`
- **AI settings**:
  - All features disabled by default; per-feature toggles in settings
  - Daily request limit (configurable)

## Technical Considerations

- `@derekentringer/codemirror-ai-markdown` is shared between web and desktop — same package, same behavior
- All AI calls route through notesync-api → Claude API; web never calls Claude directly
- Embeddings stored in pgvector column on the Note model; regenerated when note content changes
- Streaming: inline completions use streaming responses (`text/event-stream`) for low-latency ghost text
- Cost control: debounce AI calls, cache summaries and embeddings, daily usage counter per user
- pgvector similarity search: `SELECT * FROM "Note" ORDER BY embedding <=> $1 LIMIT 10`

## Dependencies

- [00 — Project Scaffolding](00-project-scaffolding.md) — needs API with pgvector enabled
- [01 — Auth](01-auth.md) — all AI endpoints require authentication
- [02 — Note Management](02-note-management.md) — inline completions integrate into the editor
- [03 — Search & Organization](03-search-and-organization.md) — semantic search extends the search system

## Open Questions

- Should inline completions stream token-by-token or wait for the full response?
- Which embedding model: Claude's built-in embeddings or a separate model (e.g., Voyage AI)?
- Should Q&A history persist in the database, or be ephemeral per session?
- Context window for completions: current paragraph vs. full note?
