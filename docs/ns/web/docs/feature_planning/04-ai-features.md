# 04 — AI Features

**Status:** Complete (04f skipped)
**Phase:** 3 — AI & Offline
**Priority:** Medium

## Summary

AI-powered features using the Claude API (via ns-api) for smart tagging, summarization, semantic search, AI assistant chat, duplicate detection, and inline AI-assisted markdown writing via the custom CodeMirror 6 extension.

## Sub-Releases

| Release | Summary | Status |
|---------|---------|--------|
| **04a** | Inline ghost text completions (SSE streaming), note summarization, smart auto-tagging, AI settings page, sidebar footer redesign | **Complete** |
| **04a.1** | Completion style options — configurable styles (Continue writing, Markdown assist, Brief) with per-style system prompts and max_tokens | **Complete** |
| **04b** | Select-and-rewrite (rewrite, concise, grammar, list, expand, summarize) with floating menu, keyboard shortcut, right-click trigger, and settings toggle | **Complete** |
| **04c** | Semantic search (Voyage AI embeddings via pgvector, keyword/semantic/hybrid search modes, server-side toggle, background processor) | **Complete** |
| **04d** | Audio notes — voice recording → AI-structured markdown via Whisper transcription + Claude processing, AudioRecorder component, draggable split view divider | **Complete** |
| **04e** | AI assistant chat — collapsible right-side panel with streaming AI answers, citation pills, markdown rendering, cursor-positioned context menus on folders/notes | **Complete** |
| **04e.1** | UI polish — AudioRecorder moved to sidebar header, ConfirmDialog for delete actions on notes/folders/summaries, summary delete button | **Complete** |
| **04f** | Duplicate detection (embedding similarity for review/merge) | Skipped |
| **04g** | Continue writing & structure suggestions, tag suggestion prompt fix, AI assistant chat UX polish | **Complete** |

## Skipped (04f)

- **Duplicate detection** (04f): Skipped — deprioritized in favor of other features.

## Technical Considerations

- `@derekentringer/codemirror-ai-markdown` shared package to be extracted from ns-web when desktop app needs it
- All AI calls route through ns-api → Claude API; web never calls Claude directly
- Embeddings stored in pgvector column on the Note model; regenerated when note content changes
- Streaming: inline completions use `messages.create({ stream: true })` via SSE `PassThrough` stream
- Cost control: debounce AI calls, cache summaries and embeddings, daily usage counter per user
- pgvector similarity search: `SELECT * FROM "Note" ORDER BY embedding <=> $1 LIMIT 10`

## Dependencies

- [00 — Project Scaffolding](00-project-scaffolding.md) — needs API with pgvector enabled
- [01 — Auth](01-auth.md) — all AI endpoints require authentication
- [02 — Note Management](02-note-management.md) — inline completions integrate into the editor
- [03 — Search & Organization](03-search-and-organization.md) — semantic search extends the search system
