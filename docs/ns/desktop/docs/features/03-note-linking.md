# 03 — Note Linking + Backlinks

**Status:** Complete
**Phase:** 4 — UI Features
**Priority:** High

## Summary

Wiki-link syntax (`[[note title]]`) for connecting notes, with CodeMirror autocomplete, clickable links in markdown preview, a backlinks panel showing incoming references, and navigation to linked notes. Matches the ns-web implementation for feature parity.

## What Was Implemented

### SQLite Migration 004 (`src-tauri/migrations/004.sql`)

- `note_links` table with `id`, `source_note_id`, `target_note_id`, `link_text`, `created_at`
- Foreign keys to `notes(id)` with `ON DELETE CASCADE` for automatic cleanup
- Unique constraint on `(source_note_id, target_note_id, link_text)` to prevent duplicates
- Indexes on `source_note_id` and `target_note_id` for fast lookups
- Migration registered in `src-tauri/src/lib.rs` (version 4)

### Wiki-Link Parsing (`src/lib/db.ts`)

- `extractWikiLinks(content)` — pure function, regex `/\[\[([^\[\]]+?)\]\]/g`, deduplicates by lowercase, returns original case
- `syncNoteLinks(sourceNoteId, content)` — deletes existing outgoing links, extracts links, resolves titles case-insensitively against non-deleted notes, inserts resolved links (skips self-links)
- `getBacklinks(noteId)` — returns incoming links joined with source note titles, filtered to non-deleted notes
- `listNoteTitles()` — returns all non-deleted note titles sorted alphabetically for autocomplete

### Remark Plugin (`src/lib/remarkWikiLink.ts`)

- Transforms `[[title]]` syntax in markdown text nodes
- Resolved links become `<a>` elements with `data-wiki-link` attribute and `.wiki-link` class
- Unresolved links become `<span>` elements with `.wiki-link-broken` class
- Ported from ns-web with adjustment: uses mdast `hName`/`hProperties` for broken links instead of raw HTML (compatible with react-markdown's default sanitization)

### CodeMirror Autocomplete (`src/editor/wikiLinkComplete.ts`)

- Detects `[[` before cursor and shows matching note titles in dropdown
- Filters titles by typed query (case-insensitive substring match)
- Shows up to 20 results; all titles shown when `[[` is first typed
- Selecting a title inserts `title]]` to close the link
- Themed dropdown matching app's dark/light color scheme
- Uses getter function for fresh title data without editor recreation

### Markdown Preview (`src/components/MarkdownPreview.tsx`)

- Added optional `wikiLinkTitleMap` and `onWikiLinkClick` props
- Memoized remark plugins list (only rebuilds when title map changes)
- Click handler on preview container checks for `[data-wiki-link]` attribute
- Backwards-compatible — renders normally without wiki-link props

### Backlinks Panel (`src/components/BacklinksPanel.tsx`)

- Appears below editor when current note has incoming links
- Collapsible header showing `▾ Backlinks (N)` with link count
- Collapse state persisted to localStorage (`ns-backlinks-collapsed`)
- Resizable height via `useResizable` hook with drag divider
- Each backlink shows clickable note title and `via [[linkText]]`
- Click navigates to the source note
- Returns `null` when no backlinks (no panel shown)
- `cursor-pointer` on all interactive elements

### Wiki-Link CSS (`src/styles/global.css`)

- `.wiki-link` — primary color, dashed underline, pointer cursor, hover state
- `.wiki-link-broken` — muted foreground color, red dashed underline

### NotesPage Integration (`src/pages/NotesPage.tsx`)

- `noteTitles` state with ref for CodeMirror access without re-creation
- `wikiLinkTitleMap` memoized from note titles (lowercase title → note ID)
- `wikiLinkExt` memoized CodeMirror extension passed to MarkdownEditor
- Wiki-link props passed to MarkdownPreview
- `handleWikiLinkClick` — finds note in current list or fetches by ID, then navigates
- `syncNoteLinks` called fire-and-forget after every save (does not block save status)
- `loadNoteTitles` called on mount, save, create, delete, and restore

### Bug Fix: Autosave Stale Closure

The original `scheduleSave()` pattern created a `setTimeout` from event handlers (`handleTitleChange`, `handleContentChange`) that captured a stale `handleSave` closure. When the timer fired, it used old title/content values, causing `isDirty()` to return false (skipping the save) or saving stale data that overwrote a correct manual save (Enter key).

**Fix:** Replaced `scheduleSave()` with a `useEffect`-based autosave (matching ns-web pattern). The effect re-runs whenever `title`, `content`, `selectedId`, or `handleSave` change, ensuring the timer always references the latest closure. `handleSave` also clears `saveTimerRef` on entry to prevent stale timer overwrites. `syncNoteLinks` moved to fire-and-forget after `setSaveStatus("saved")` so a link-sync failure doesn't make the save appear to fail.

### Tests (`src/__tests__/NoteLinking.test.tsx`)

- 19 tests covering:
  - `extractWikiLinks`: single/multiple links, dedup by case, empty content, whitespace trimming, nested brackets
  - `syncNoteLinks`: delete + insert flow, self-link filtering, no-link content
  - `getBacklinks`: returns incoming links from non-deleted notes
  - `listNoteTitles`: returns sorted non-deleted titles
  - `BacklinksPanel`: renders backlinks, returns null when empty, collapse persists to localStorage
  - `MarkdownPreview`: resolved links clickable with correct class/attribute, broken links with `.wiki-link-broken`, normal rendering without wiki-link props

## Files Changed

| File | Action |
|------|--------|
| `src-tauri/migrations/004.sql` | Created |
| `src-tauri/src/lib.rs` | Edited — registered migration 4 |
| `src/lib/db.ts` | Edited — added 4 functions, 2 type imports |
| `src/lib/remarkWikiLink.ts` | Created |
| `src/editor/wikiLinkComplete.ts` | Created |
| `src/components/MarkdownPreview.tsx` | Edited — added wiki-link props |
| `src/components/BacklinksPanel.tsx` | Created |
| `src/styles/global.css` | Edited — added wiki-link CSS |
| `src/pages/NotesPage.tsx` | Edited — integrated all pieces |
| `src/__tests__/NoteLinking.test.tsx` | Created |

## Dependencies

- [01 — Note Editor](01-note-editor.md) — CodeMirror editor for wiki-link syntax and autocomplete
- [02 — Search & Organization](02-search-and-organization.md) — notes with titles for link resolution

## Deferred

- **Deep-linking** — copy-link button with clipboard feedback (not needed for local-first desktop use)
- **Auto-create notes from broken links** — decided against for now; broken links show visual indicator instead
- **Real-time backlink updates** — backlinks refresh on note selection, not live during editing
