# 10 — AI Features

**Status:** Not Started
**Phase:** 7 — AI
**Priority:** Medium

## Summary

AI-powered features using the Claude API (via ns-api) for smart tagging, summarization, semantic search, Q&A over notes, duplicate detection, and inline AI-assisted markdown writing via a custom CodeMirror 6 extension.

## Requirements

- **AI-assisted markdown writing** (custom CodeMirror 6 extension):
  - `@derekentringer/codemirror-ai-markdown` — standalone, backend-agnostic, publishable package
  - **Inline ghost text completions**: as you type, Claude suggests the next sentence/paragraph; displayed as gray ghost text after the cursor; Tab to accept, Escape or keep typing to dismiss
  - **Select-and-rewrite**: select text, trigger AI action (right-click menu or keyboard shortcut) to rewrite, make concise, fix grammar, convert to list, expand, or summarize
  - **Continue writing**: keyboard shortcut (e.g., Ctrl+Shift+Space) to generate the next paragraph based on the note's content above the cursor
  - **Heading/structure suggestions**: on a new/empty note, suggest an outline based on the title
  - Configurable debounce (default 500ms), context window size, and keybindings
  - All AI calls route through ns-api (extension accepts a callback function, NoteSync wires it to the API)
- **Smart auto-tagging**:
  - Analyze note content and suggest tags
  - User accepts or dismisses suggested tags
  - Runs on note save (debounced) or on manual trigger
- **Note summarization**:
  - Generate a 1-3 sentence summary of a note
  - Summary stored as metadata (separate from note content)
  - Displayed in note list/cards for quick scanning
  - Manual trigger or auto-generate on first view
- **Semantic search**:
  - Generate vector embeddings for each note (via Voyage AI or a dedicated embedding model)
  - Store embeddings locally in SQLite via `sqlite-vec`
  - Search by meaning, not just keywords (e.g., "notes about weekend plans" finds relevant notes even without those exact words)
  - Three search modes: keyword, semantic, hybrid (combined ranking)
  - Search mode selector UI toggle
  - Complement FTS5 keyword search: show both keyword and semantic results
  - Embedding status display in settings (enabled/disabled, pending count, total embedded)
- **Audio notes**:
  - Voice recording → AI-structured markdown via Whisper transcription + Claude formatting
  - AudioRecorder component with mode selection (meeting, lecture, memo, verbatim)
  - Draggable split view divider for recording panel
  - Audio upload validation (WebM, MP4, MP3, WAV, OGG formats)
- **AI Assistant chat panel**:
  - Collapsible right-side panel with streaming AI answers
  - Ask questions in natural language about your notes
  - System searches relevant notes (semantic + keyword), sends them as context to Claude
  - Citation pills linking to source notes
  - Markdown rendering in responses
  - Right-click context menus on notes for "Ask AI about this note"
  - Cursor-positioned context menus on folders/notes
- **Duplicate detection**:
  - Use embeddings to find notes with very similar content
  - Surface potential duplicates for review
  - User can merge or dismiss
- **Completion styles**:
  - Configurable completion styles: Continue writing, Markdown assist, Brief
  - Per-style system prompts and max_tokens
  - Style selector in settings and inline switcher
- **AI settings**:
  - All AI features disabled by default
  - Per-feature toggle in settings (inline completions, auto-tagging, summarization, semantic search, Q&A, audio notes, duplicate detection)
  - Completion styles and delay configuration
  - Audio mode selection
  - Info tooltips on all AI settings explaining each feature
  - Daily request limit to control API costs (configurable)

## Technical Considerations

- **Custom extension architecture** (`@derekentringer/codemirror-ai-markdown`):
  - Uses CodeMirror 6 `ViewPlugin` and `Decoration` APIs for ghost text rendering
  - Backend-agnostic: accepts `complete: (context: string, cursor: number) => Promise<string>` callback
  - Configurable via options object (debounce, keybindings, ghost text styling)
  - Publishable as standalone npm package; no dependencies on NoteSync internals
  - Shared between `ns-desktop` and `ns-web`
- API endpoints (on ns-api):
  - `POST /ai/complete` — inline markdown completion (streaming response for fast ghost text)
  - `POST /ai/tags` — suggest tags for a note
  - `POST /ai/summarize` — generate note summary
  - `POST /ai/search` — semantic search across notes
  - `POST /ai/ask` — Q&A with citations
  - `POST /ai/duplicates` — find similar notes
  - `POST /ai/rewrite` — rewrite selected text with an instruction
- Embeddings: generated server-side, returned to client, stored in local `sqlite-vec` for offline semantic search
- Embedding sync: embeddings are regenerated when a note changes; synced alongside note data
- Cost control: debounce AI calls, cache results, daily usage counter stored in SQLite
- Streaming: inline completions should use streaming responses for perceived speed

## Dependencies

- [00 — Project Scaffolding](../features/00-project-scaffolding.md) — needs app shell
- [01 — Note Editor](01-note-editor.md) — inline completions and rewrite integrate into the editor
- [02 — Search & Organization](02-search-and-organization.md) — semantic search extends the existing search system
- [09 — Sync Engine](09-sync-engine.md) — embeddings need to sync between local and central database

## Open Questions

- Should inline completions stream token-by-token, or wait for the full response before showing ghost text?
- Which embedding model: Claude's built-in embeddings or a separate model (e.g., Voyage AI)?
- Should Q&A history persist, or is it ephemeral per session?
- How large a context window to send for inline completions (current paragraph vs. full note vs. multiple notes)?
