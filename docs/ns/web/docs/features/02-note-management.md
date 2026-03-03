# 02 — Note Management (Phase 1)

**Status:** Complete (basic CRUD)
**Phase:** 2 — Notes Core
**Priority:** High
**Completed:** v1.30.0

## Summary

Basic CRUD for notes in the web app with a sidebar list, search, and plain-text editor. This is the first phase of note management — CodeMirror editor, markdown preview, trash view, and advanced metadata features are planned for future iterations.

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
- **Editor area**: title input + content textarea, "Select a note or create a new one" empty state
- **Save**: manual save button with dirty state tracking, `Cmd/Ctrl+S` keyboard shortcut, "Saving..." / "Unsaved changes" / "Saved" status indicator
- **Delete**: two-step confirmation flow (Delete → Confirm/Cancel), removes from list on success
- **Create**: creates "Untitled" note, auto-selects it
- **Error handling**: auto-dismissing error toast (4 seconds), dismissible via button
- API module (`src/api/notes.ts`): fetchNotes, fetchNote, createNote, updateNote, deleteNote

## What's Not Yet Implemented

The [full feature plan](../feature_planning/02-note-management.md) includes these items for future phases:
- CodeMirror 6 markdown editor with syntax highlighting
- Split-pane mode: editor + rendered markdown preview
- Auto-save with debounce (currently manual save only)
- Trash view with restore and permanent delete
- `PATCH /notes/:id/restore` and `DELETE /notes/:id/permanent` endpoints
- `PUT /notes/reorder` endpoint for drag-and-drop ordering
- Grid/card view toggle
- Sort options (title, created date, modified date)
- Tag autocomplete and inline management
- Folder assignment via dropdown
- Note metadata panel (created/updated timestamps)
