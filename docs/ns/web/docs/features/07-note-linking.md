# 07 — Note Linking + Deep-Linking

**Status:** Complete
**Phase:** Extension
**Priority:** Medium

## Summary

Wiki-link note linking with `[[note title]]` syntax and URL-based deep-linking for individual notes.

## What's Implemented

### Deep-Linking

- **URL routes**: `/notes/:noteId` route loads a specific note directly
- **URL sync**: Selecting a note updates the browser URL to `/notes/:id`; deselecting navigates back to `/`
- **Copy link button**: Toolbar button copies the note's URL to clipboard with "Copied!" feedback
- **Invalid ID handling**: Gracefully falls back to `/` with toast when note ID not found
- **Browser tab title**: Tab title updates to `Note Title — NoteSync` when viewing a note, resets to `NoteSync` when deselected; improves bookmark context for deep links

### Wiki-Link Syntax

- **`[[note title]]` syntax**: Type double brackets to create wiki-links in markdown content
- **Case-insensitive matching**: `[[my note]]` resolves to "My Note" regardless of case
- **Self-link prevention**: A note cannot link to itself
- **Link sync on save**: Every create/update extracts wiki-links and syncs the NoteLink table
- **Deduplication**: Duplicate links (same source → target) are deduplicated case-insensitively

### CodeMirror Autocomplete

- **`[[` trigger**: Typing `[[` in the editor shows an autocomplete dropdown of note titles
- **Filtered results**: Case-insensitive filtering, max 20 suggestions
- **Auto-completion**: Selecting a title inserts `title]]` to complete the link
- **Dark theme**: Styled dropdown matching the app's dark theme

### Preview Rendering

- **Resolved links**: `[[title]]` renders as accent-colored clickable link with dashed underline
- **Broken links**: Unresolved `[[title]]` renders with muted color and destructive dashed underline
- **Click navigation**: Clicking a wiki-link in preview navigates to the target note
- **Remark plugin**: Custom `remarkWikiLink` plugin transforms wiki-link syntax in the markdown AST

### Backlinks Panel

- **Incoming references**: Panel below editor shows notes that link to the current note
- **Collapsible**: Click header to toggle visibility; shows "Backlinks (N)" count
- **Navigation**: Click a backlink to navigate to the source note
- **Link context**: Each backlink shows "via [[linkText]]" for context
- **Auto-hide**: Panel hidden when note has no backlinks
- **Flash-free navigation**: Keeps showing previous backlinks while loading new ones to prevent panel flicker on navigation

### Database

- **NoteLink model**: `id`, `sourceNoteId`, `targetNoteId`, `linkText`, `createdAt`
- **Cascade delete**: Links removed when source or target note is deleted
- **Unique constraint**: `(sourceNoteId, targetNoteId, linkText)` prevents duplicates
- **Indexes**: On both `sourceNoteId` and `targetNoteId` for query performance

### API

- `GET /notes/titles` — returns all note titles for autocomplete and link resolution
- `GET /notes/:id/backlinks` — returns incoming links with source note title and link text

## Test Coverage

### ns-api (17 new tests)
- `linkStore.test.ts`: extractWikiLinks (8), syncNoteLinks (3), getBacklinks (3), listNoteTitles (1)
- `notes.test.ts`: GET /notes/titles (2), GET /notes/:id/backlinks (3)

### ns-web (6 new tests)
- `BacklinksPanel.test.tsx`: render with backlinks, hidden when empty, onNavigate click, collapse toggle (4)
- `NotesPage.test.tsx`: deep-link navigation, copy link button (2)

## Files Modified/Created

| File | Action |
|------|--------|
| `ns-api/prisma/schema.prisma` | Modified — NoteLink model + Note relations |
| `ns-api/prisma/migrations/20260306000000_add_note_links/` | Created — migration SQL |
| `ns-api/src/store/linkStore.ts` | Created — link extraction, sync, backlinks |
| `ns-api/src/store/noteStore.ts` | Modified — hook syncNoteLinks into save |
| `ns-api/src/routes/notes.ts` | Modified — titles + backlinks endpoints |
| `ns-api/src/__tests__/linkStore.test.ts` | Created — 15 tests |
| `ns-api/src/__tests__/notes.test.ts` | Modified — 5 route tests |
| `ns-api/src/__tests__/helpers/mockPrisma.ts` | Modified — noteLink mock |
| `shared/src/ns/types.ts` | Modified — BacklinkInfo, NoteTitleEntry types |
| `ns-web/src/App.tsx` | Modified — /notes/:noteId route |
| `ns-web/src/lib/remarkWikiLink.ts` | Created — remark plugin |
| `ns-web/src/editor/wikiLinkComplete.ts` | Created — CodeMirror autocomplete |
| `ns-web/src/components/BacklinksPanel.tsx` | Created — backlinks panel |
| `ns-web/src/components/MarkdownPreview.tsx` | Modified — wiki-link support |
| `ns-web/src/pages/NotesPage.tsx` | Modified — deep-linking + wiki-link integration |
| `ns-web/src/api/notes.ts` | Modified — fetchBacklinks, fetchNoteTitles |
| `ns-web/src/api/offlineNotes.ts` | Modified — re-exports |
| `ns-web/src/styles/global.css` | Modified — wiki-link CSS |
| `ns-web/package.json` | Modified — @codemirror/autocomplete dep |
| `ns-web/src/__tests__/BacklinksPanel.test.tsx` | Created — 4 tests |
| `ns-web/src/__tests__/NotesPage.test.tsx` | Modified — deep-link tests |
