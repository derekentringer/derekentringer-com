# 02 — Note Management (Phase 1)

**Status:** Complete (CRUD + CodeMirror editor)
**Phase:** 2 — Notes Core
**Priority:** High
**Completed:** v1.30.0 (basic CRUD), v1.31.0 (CodeMirror editor)

## Summary

Full CRUD for notes in the web app with a sidebar list, search, and CodeMirror 6 markdown editor with syntax highlighting, formatting shortcuts, and split-pane preview.

## What Was Implemented

### NoteSync API (`packages/ns-api/`)
- **GET /notes** — list notes with optional filters (folder, search, page, pageSize), paginated with total count, excludes soft-deleted, ordered by updatedAt DESC
- **GET /notes/:id** — get single note with UUID validation, 404 for missing/soft-deleted
- **POST /notes** — create note (title required, min 1 char), defaults: content="", folder=null, tags=[]
- **PATCH /notes/:id** — partial update (title, content, folder, tags), requires at least one field, UUID validation
- **DELETE /notes/:id** — soft delete (sets deletedAt), 204 on success
- Note store layer with Prisma, P2025 error handling for not-found
- `toNote()` mapper: Prisma rows to API types (Date→ISO string, tags filtering)
- Full-text search: case-insensitive contains on title + content fields

### NoteSync Web (`packages/ns-web/`)
- **Sidebar**: note list with selection highlighting, "New note" button (+), search input with 300ms debounce, empty states ("No notes yet" / "No notes found"), sign-out button
- **CodeMirror 6 editor** (`src/components/MarkdownEditor.tsx`):
  - Thin custom wrapper (not `@uiw/react-codemirror`) for direct `EditorView` control
  - Markdown syntax highlighting via `@codemirror/lang-markdown` with `@codemirror/language-data` for fenced code blocks
  - Custom dark theme matching app colors (background #0f1117, cursor/headings in lime-yellow #d4e157, gutters #10121a)
  - Custom `HighlightStyle`: headings → lime-yellow, bold/italic → styled, code → muted, links → primary
  - Formatting shortcuts: `Mod-b` (bold), `Mod-i` (italic) — wraps selection with markers
  - `Mod-s` → save keymap (fires when editor is focused; window listener handles title focus)
  - Imperative handle: `focus()`, `insertBold()`, `insertItalic()` for toolbar integration
  - `extensions` prop for future AI plugin (`@derekentringer/codemirror-ai-markdown`)
  - Toggleable line numbers via `Compartment`
  - Roboto Mono font for editor, line wrapping, undo/redo history
- **Editor toolbar** (`src/components/EditorToolbar.tsx`):
  - View mode toggle: Editor | Split | Preview (three-button group)
  - Bold (B) and Italic (I) formatting buttons (hidden in preview mode)
  - Line numbers toggle (#)
- **Markdown preview** (`src/components/MarkdownPreview.tsx`):
  - `react-markdown` + `remark-gfm` for rendered markdown
  - Styled headings, code blocks, links, tables, blockquotes, lists, task checkboxes
  - Interactive checkboxes: GFM task list checkboxes are clickable in preview and split modes; toggling updates the underlying markdown and triggers autosave; DOM-based index lookup for reliable identification; disabled in trash view; `onContentChange` prop with `toggleCheckbox` utility (`src/lib/toggleCheckbox.ts`)
  - Available in split (50/50 side-by-side) or full-width preview mode
- **Save**: manual save button with dirty state tracking, `Cmd/Ctrl+S` keyboard shortcut, "Saving..." / "Unsaved changes" / "Saved" status indicator
- **Delete**: two-step confirmation flow (Delete → Confirm/Cancel), removes from list on success
- **Create**: creates "Untitled" note, auto-selects it
- **Error handling**: auto-dismissing error toast (4 seconds), dismissible via button
- API module (`src/api/notes.ts`): fetchNotes, fetchNote, createNote, updateNote, deleteNote

## What's Not Yet Implemented

The [full feature plan](../feature_planning/02-note-management.md) includes these items for future phases:
- Auto-save with debounce (currently manual save only)
- Trash view with restore and permanent delete
- `PATCH /notes/:id/restore` and `DELETE /notes/:id/permanent` endpoints
- `PUT /notes/reorder` endpoint for drag-and-drop ordering
- Grid/card view toggle
- Sort options (title, created date, modified date)
- Tag autocomplete and inline management
- ~~Note metadata panel (created/updated timestamps)~~ — implemented as status bar timestamps (Created date + Modified date+time)
