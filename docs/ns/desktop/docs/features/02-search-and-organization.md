# 02 — Search & Organization

**Status:** Complete
**Phase:** 3 — Organization
**Priority:** High

## Summary

Full-text search across all notes using SQLite FTS5, folder system with nested hierarchy, tag system with inline editing, trash view, sort options, and resizable sidebar panels. UI/UX matches the NoteSync web app.

## What Was Implemented

### SQLite Migration 003

- `folders` table with adjacency list model (`id`, `name`, `parent_id`, `sort_order`, `favorite`, `created_at`, `updated_at`)
- `notes_fts` FTS5 virtual table for full-text search across `title`, `content`, `tags`
- `fts_map` table mapping note UUIDs to FTS5 rowids (required because `notes` uses TEXT PRIMARY KEY, not integer rowid)
- Migration applied automatically on app launch via Tauri SQL plugin

### FTS5 Search Engine (`src/lib/db.ts`)

- Standalone FTS5 index (not content-synced) with manual sync via `ftsInsert()`, `ftsUpdate()`, `ftsDelete()`
- `fts_map` table bridges note UUIDs to FTS5 rowids for update/delete operations
- `initFts()` backfills FTS index for existing notes on first launch after upgrade
- `searchNotes(query)` — FTS5 MATCH with `snippet()` for highlighted excerpts, joined through `fts_map` → `notes_fts` → `notes`
- Returns `NoteSearchResult[]` with `headline` field containing `<mark>` highlighted matches
- FTS sync integrated into all CRUD operations: `createNote()`, `updateNote()`, `softDeleteNote()`, `hardDeleteNote()`

### Folder System (`src/lib/db.ts` + `src/components/FolderTree.tsx`)

- `fetchFolders()` — flat SQL rows built into nested tree via `buildFolderTree()` helper
- `createFolder(name, parentId?)` — UUID generation, INSERT, returns `FolderInfo`
- `renameFolder(id, name)` — UPDATE name + `updated_at`
- `deleteFolder(id, mode)` — two modes: "move-up" (reparent children) or "recursive" (delete all contents)
- `fetchNotes()` enhanced with `folderId` filter (`null` = unfiled, `undefined` = all)
- FolderTree component ported from web minus `@dnd-kit` drag-and-drop:
  - Recursive tree rendering with disclosure triangles (expand/collapse)
  - "All Notes" and "Unfiled" entries at top
  - Folder note counts (direct + total including children)
  - Click to filter notes by folder
  - Active folder highlighted
  - Right-click context menu: New Subfolder, Rename, Delete
  - Inline create (input field under parent)
  - Inline rename (input replaces name)
- `FolderDeleteDialog` component with two-mode delete confirmation (radio options + warning text)

### Tag System (`src/lib/db.ts` + `src/components/TagBrowser.tsx` + `src/components/TagInput.tsx`)

- `fetchTags()` — `json_each()` aggregation for tag names with note counts
- `renameTag(oldName, newName)` — iterates notes with old tag, JSON parse/replace/stringify
- `deleteTag(name)` — same pattern, removes tag from all notes
- TagBrowser component ported from web:
  - Collapsible tag list with "Show more" toggle (10 initial)
  - Pill-style tags with note counts
  - Click to filter (active highlighted with accent color)
  - Right-click context menu: Rename, Delete
  - Inline rename with input field
  - "Clear filter" button when tag is active
  - Positioned below search input with animated show/hide (visible when search focused, has query, or has active tags)
- TagInput component ported from web:
  - Pill display of current tags with X remove button
  - Text input with autocomplete dropdown (suggestions from all tags)
  - Enter/comma to add, Backspace to remove last

### Trash View (`src/lib/db.ts`)

- `fetchTrash()` — soft-deleted notes ordered by `deleted_at DESC`
- `restoreNote(id)` — clears `is_deleted` and `deleted_at`, re-adds to FTS index
- `hardDeleteNote(id)` — permanent deletion with FTS cleanup
- Sidebar toggle between "notes" and "trash" views via icon-only trash button
- Trash view shows restore and permanent delete buttons per note

### Sort Options

- Sort dropdown in "NOTES" panel header: Updated, Created, Title
- Ascending/descending toggle button
- `fetchNotes()` enhanced with `sortBy` and `sortOrder` parameters
- Styled `<select>` with `appearance-none`, custom SVG chevron, `bg-subtle` background

### Resizable Sidebar Panels

- `useResizable` hook for folder section height (vertical drag within sidebar)
- `ResizeDivider direction="horizontal"` between folder panel and notes panel
- Divider positions persisted in localStorage

### Search Bar

- Search input at top of sidebar with Cmd+K / Ctrl+K keyboard shortcut
- Debounced search (300ms) calling `searchNotes()`
- Clear button (×) to reset search
- Search results displayed in note list with `SearchSnippet` highlighted excerpts
- "SEARCH RESULTS" header replaces "NOTES" during active search

### UI/UX Polish (matching web app)

- "NOTES" / "SEARCH RESULTS" section header with sort controls
- Sort dropdown styled to match web (appearance-none, bg-subtle, custom chevron, h-5)
- Icon-only trash button matching web's `w-7 h-7 rounded` pattern
- `cursor-pointer` on all interactive elements (buttons, tags, dropdowns, icons, context menus, close buttons)
- Search highlight styles in `global.css` (`.search-highlight mark`)

### Testing

- 149 tests across 12 test files:
  - `db.test.ts` — 43 tests: FTS sync, folder CRUD, tag queries, trash queries, enhanced fetchNotes with sort/filter
  - `FolderTree.test.tsx` — 16 tests: tree rendering, expand/collapse, folder click, active highlight, context menu, inline create, inline rename, delete dialog modes
  - `TagBrowser.test.tsx` — 10 tests: tag pills, click/toggle, active highlight, show more, context menu rename/delete
  - `TagInput.test.tsx` — 13 tests: tag display, add via Enter, backspace remove, X remove, autocomplete
  - `NoteList.test.tsx` — 11 tests: note rendering, selection, search results with headlines, context menu delete
  - Previously existing tests updated (sort controls removed from NoteList, moved to NotesPage)

### Components Created

| Component | Lines | Description |
|-----------|-------|-------------|
| `SearchSnippet.tsx` | ~10 | FTS5 snippet HTML renderer |
| `TagBrowser.tsx` | ~167 | Collapsible tag browser with filter/rename/delete |
| `TagInput.tsx` | ~112 | Inline tag editor with autocomplete |
| `FolderTree.tsx` | ~500 | Recursive folder tree (no DnD) |
| `FolderDeleteDialog.tsx` | ~50 | Two-mode delete confirmation dialog |

## What Was Deferred

- **Drag-and-drop** — folder reordering and note-to-folder DnD not implemented (web uses `@dnd-kit`)
- **Note list folder breadcrumbs** — not shown (matches web NoteList which only shows title + search headline)
- **Move to folder context menu** — not in note list context menu (matches web; folder assignment handled via FolderTree)
- **Grid/card view** — list view only
- **Bulk trash operations** — no select-all, restore-selected, empty-trash
- **Auto-purge trash** — no configurable retention period
- **Semantic search** — FTS5 keyword search only, no vector/embedding search
- **Multi-tag AND/OR filter toggle** — single tag filter only
- **Date range filter** — not implemented
- **Manual sort order** — no drag-and-drop reordering in note list
- **Favorites** — deferred to Phase 4 (05 — Favorites)

## Dependencies

- [00 — Project Scaffolding](00-project-scaffolding.md) — Tauri + SQLite foundation
- [01 — Note Editor](01-note-editor.md) — notes CRUD and editor components
