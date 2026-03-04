# 04 — AI Features

**Status:** Partial (04a–04c Complete; 04d–04g Not Started)
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
| **04c** | Semantic search (Voyage AI embeddings via pgvector, keyword/semantic/hybrid search modes, server-side toggle, background processor) | **Complete** |
| **04d** | Audio notes — voice recording → AI-structured markdown via Whisper transcription + Claude processing | Not Started |
| **04e** | Q&A over notes (natural language questions with citations) | Not Started |
| **04f** | Duplicate detection (embedding similarity for review/merge) | Not Started |
| **04g** | Continue writing, heading/structure suggestions for empty notes | Not Started |

## Remaining Requirements (04d–04g)

- **Audio notes** (04d):
  - Record audio in browser via MediaRecorder API
  - Upload to ns-api, transcribe via OpenAI Whisper API
  - Claude processes transcript into structured markdown (headings, key points, action items)
  - Processing modes: meeting notes, lecture notes, voice memo, verbatim
  - API: `POST /ai/transcribe`
  - See [04d — Audio Notes](04d-audio-notes.md) for full spec
- **Q&A over notes** (04e):
  - Natural language question input
  - System finds relevant notes (semantic + keyword), sends as context to Claude
  - Returns answer with citations linking to source notes
  - Chat-style panel
  - API: `POST /ai/ask`
- **Duplicate detection** (04f):
  - Use embeddings to find notes with similar content
  - Surface duplicates for review; user can merge or dismiss
  - API: `POST /ai/duplicates`
- **Continue writing & structure suggestions** (04g):
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

- Should Q&A history persist in the database, or be ephemeral per session?

## Dependencies

- [00 — Project Scaffolding](00-project-scaffolding.md) — needs API with pgvector enabled
- [01 — Auth](01-auth.md) — all AI endpoints require authentication
- [02 — Note Management](02-note-management.md) — inline completions integrate into the editor
- [03 — Search & Organization](03-search-and-organization.md) — semantic search extends the search system
