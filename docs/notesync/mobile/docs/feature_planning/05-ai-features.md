# 05 — AI Features

**Status:** Not Started
**Phase:** 3 — AI
**Priority:** Medium

## Summary

AI-powered features on mobile: smart tagging, summarization, semantic search, Q&A over notes, and AI-assisted markdown writing via toolbar buttons and bottom sheets (no ghost text on mobile).

## Requirements

- **AI-assisted markdown writing** (mobile-specific UI):
  - **AI toolbar button** in the editor toolbar: tap to trigger an AI action
  - **Continue writing**: tap "Continue" button below the editor; Claude generates the next paragraph; shown in a bottom sheet for review; accept to insert at cursor, dismiss to discard
  - **Select-and-rewrite**: long-press to select text → "AI" option in context menu → bottom sheet with actions:
    - Rewrite
    - Make concise
    - Fix grammar
    - Convert to list
    - Expand
    - Summarize selection
  - **Quick prompts**: bottom sheet with common AI writing actions
  - All AI calls route through notesync-api → Claude API
- **Smart auto-tagging**:
  - Suggest tags after saving a note
  - Tags shown in a dismissible banner or bottom sheet
  - Accept all, accept individual, or dismiss
  - Runs on manual trigger or after sync
- **Note summarization**:
  - Generate 1-3 sentence summary
  - Displayed below the note title in list view and detail view
  - Manual trigger from note options menu
- **Semantic search**:
  - "AI Search" tab or toggle in the search screen
  - Natural language query: "notes about weekend plans"
  - Results from API (pgvector search) displayed alongside local FTS5 results
  - Requires network connection (semantic search is server-side)
- **Q&A over notes**:
  - "AI" tab in bottom navigation
  - Chat-style interface: ask questions, get answers with source note citations
  - Tap a citation to navigate to the source note
  - Chat history persists within the session
  - Requires network connection
- **AI settings**:
  - All features disabled by default
  - Per-feature toggles in Settings tab
  - Daily request limit

## Technical Considerations

- No CodeMirror on mobile — AI writing assistance uses native UI (bottom sheets, toolbar buttons, contextual menus)
- All AI calls go through notesync-api; mobile never calls Claude directly
- Bottom sheets via `@gorhom/bottom-sheet` for AI action selection and result preview
- Semantic search requires network; fall back to local FTS5 when offline
- Q&A chat: simple FlatList with message bubbles; no persistent chat history in DB (ephemeral per session)
- Haptic feedback on AI action completion
- Loading indicators for AI requests (can take 1-3 seconds)
- Consider pre-fetching summaries during sync so they're available offline

## Dependencies

- [00 — Project Setup & Auth](00-project-setup-and-auth.md) — needs API connection
- [02 — Note Editor](02-note-editor.md) — AI writing actions integrate into the editor toolbar
- [03 — Search & Organization](03-search-and-organization.md) — semantic search extends the search screen
- [04 — Sync Engine](04-sync-engine.md) — summaries and tags from AI sync between devices

## Open Questions

- Should AI-generated summaries be fetched during sync, or only on-demand?
- Q&A chat: persist history in local SQLite, or keep ephemeral?
- Should the "Continue writing" feature show a streaming response, or wait for the full result?
