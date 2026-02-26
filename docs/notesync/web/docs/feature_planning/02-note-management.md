# 02 — Note Management

**Status:** Not Started
**Phase:** 2 — Notes Core
**Priority:** High

## Summary

Full CRUD for notes in the web app using CodeMirror 6 for markdown editing, with list/grid views and note metadata management.

## Requirements

- **Note editor**:
  - CodeMirror 6 with markdown language support (`@codemirror/lang-markdown`)
  - Syntax highlighting for markdown elements
  - Keyboard shortcuts for common formatting (Ctrl+B, Ctrl+I, etc.)
  - Optional split-pane mode: editor on left, rendered markdown preview on right (`react-markdown` + `remark-gfm`)
  - Toggle between editor-only, split-pane, and preview-only modes
  - Line numbers (toggleable), word wrap
- **Note CRUD**:
  - **Create**: "New Note" button; opens blank editor; auto-generated title ("Untitled Note")
  - **Read**: click a note in the list to open in editor
  - **Update**: auto-save with debounce (500ms after last keystroke); visual save indicator
  - **Delete**: soft delete with confirmation dialog; sets `deletedAt` on the server
  - Rename title inline (click to edit)
- **API endpoints** (notesync-api):

  | Method | Path | Auth | Description |
  |--------|------|------|-------------|
  | GET | `/notes` | Yes | List notes with optional filters (folder, tag, search) |
  | GET | `/notes/:id` | Yes | Get a single note |
  | POST | `/notes` | Yes | Create a new note |
  | PATCH | `/notes/:id` | Yes | Update a note (partial) |
  | DELETE | `/notes/:id` | Yes | Soft delete a note |
  | PATCH | `/notes/:id/restore` | Yes | Restore a soft-deleted note |
  | DELETE | `/notes/:id/permanent` | Yes | Permanently delete a note |
  | PUT | `/notes/reorder` | Yes | Bulk reorder notes within a folder |

- **Note list**:
  - Sidebar list of all notes, grouped by folder
  - Toggle between list view and grid/card view
  - Show title, folder, tags, last modified date
  - Sort by: title (A-Z, Z-A), created date, modified date
  - Visual indicator for recently modified notes
- **Note metadata**:
  - Title, folder, tags displayed above the editor
  - Created/updated timestamps in footer or info panel
  - Add/remove tags inline with autocomplete
  - Assign/change folder via dropdown or move-to dialog
- **Trash**:
  - "Trash" section in sidebar showing soft-deleted notes
  - Restore or permanently delete from trash

## Technical Considerations

- CodeMirror 6 React integration via `@uiw/react-codemirror` or thin wrapper
- Auto-save: debounced `PATCH /notes/:id` call; optimistic UI update
- API client methods in `src/api/notes.ts` (matching finance-web API pattern)
- Pagination: cursor-based or offset-based for large note collections
- Notes returned from API include metadata but may exclude `content` in list responses (fetch full content on open)
- Markdown preview: `react-markdown` with `remark-gfm` for tables, strikethrough, task lists
- Consider `rehype-highlight` for code block syntax highlighting in preview

## Dependencies

- [00 — Project Scaffolding](00-project-scaffolding.md) — needs API with Prisma schema and web app shell
- [01 — Auth](01-auth.md) — all note endpoints require authentication

## Open Questions

- Should note list responses include full content or just metadata (title, folder, tags, dates)?
- Default view: list or grid?
- Maximum note size limit?
