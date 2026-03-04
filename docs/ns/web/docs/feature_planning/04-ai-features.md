# 04 — AI Features

**Status:** Partial (04a–04b Complete; 04c–04f Not Started)
**Phase:** 3 — AI & Offline
**Priority:** Medium

## Summary

AI-powered features using the Claude API (via ns-api) for smart tagging, summarization, semantic search, Q&A over notes, duplicate detection, and inline AI-assisted markdown writing via the custom CodeMirror 6 extension.

## Sub-Releases

| Release | Summary | Status |
|---------|---------|--------|
| **04a** | Inline ghost text completions (SSE streaming), note summarization, smart auto-tagging, AI settings page, sidebar footer redesign | **Complete** |
| **04a.1** | Completion style options — configurable styles (Continue writing, Markdown assist, Brief) with per-style system prompts and max_tokens | **Complete** |
| **04b** | Select-and-rewrite (rewrite, concise, grammar, list, expand, summarize) with floating menu, keyboard shortcut, right-click trigger, and settings toggle | **Complete** |
| **04c** | Semantic search (pgvector embeddings, complementing tsvector keyword search) | Not Started |
| **04d** | Q&A over notes (natural language questions with citations) | Not Started |
| **04e** | Duplicate detection (embedding similarity for review/merge) | Not Started |
| **04f** | Continue writing, heading/structure suggestions for empty notes | Not Started |

## Remaining Requirements (04c–04f)

- **Semantic search** (04c):
  - Generate vector embeddings for notes via Claude API or dedicated embedding model
  - Store in PostgreSQL via pgvector
  - Search by meaning (e.g., "notes about weekend plans")
  - Complement tsvector keyword search — show both result types
  - API: `POST /ai/search`
- **Q&A over notes** (04d):
  - Natural language question input
  - System finds relevant notes (semantic + keyword), sends as context to Claude
  - Returns answer with citations linking to source notes
  - Chat-style panel
  - API: `POST /ai/ask`
- **Duplicate detection** (04e):
  - Use embeddings to find notes with similar content
  - Surface duplicates for review; user can merge or dismiss
  - API: `POST /ai/duplicates`
- **Continue writing & structure suggestions** (04f):
  - Ctrl+Shift+Space to generate next paragraph
  - Heading/structure suggestions for new/empty notes based on title

## Technical Considerations

- `@derekentringer/codemirror-ai-markdown` shared package to be extracted from ns-web when desktop app needs it
- All AI calls route through ns-api → Claude API; web never calls Claude directly
- Embeddings stored in pgvector column on the Note model; regenerated when note content changes
- Streaming: inline completions use `messages.create({ stream: true })` via SSE `PassThrough` stream
- Cost control: debounce AI calls, cache summaries and embeddings, daily usage counter per user
- pgvector similarity search: `SELECT * FROM "Note" ORDER BY embedding <=> $1 LIMIT 10`

## Open Questions

- Which embedding model: Claude's built-in embeddings or a separate model (e.g., Voyage AI)?
- Should Q&A history persist in the database, or be ephemeral per session?

## Dependencies

- [00 — Project Scaffolding](00-project-scaffolding.md) — needs API with pgvector enabled
- [01 — Auth](01-auth.md) — all AI endpoints require authentication
- [02 — Note Management](02-note-management.md) — inline completions integrate into the editor
- [03 — Search & Organization](03-search-and-organization.md) — semantic search extends the search system
