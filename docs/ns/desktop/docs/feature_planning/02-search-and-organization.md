# 02 — Search & Organization

**Status:** Not Started
**Phase:** 3 — Organization
**Priority:** High

## Summary

Full-text search across all notes using SQLite FTS5, plus a folder and tag system with drag-and-drop reorganization and sort/filter capabilities.

## Requirements

- **Full-text search**:
  - SQLite FTS5 virtual table indexing note titles and content
  - Search bar in the sidebar or top of the app (Ctrl+K / Cmd+K to focus)
  - Real-time results as you type (debounced)
  - Results show note title, folder, and a snippet of the matching content with highlighted search terms
  - Search across all notes including soft-deleted (with a toggle to include/exclude)
- **Folder system**:
  - Nested FolderTree with unlimited-depth hierarchy (adjacency list model with `parent_id`)
  - macOS Finder-inspired disclosure triangles for expand/collapse
  - Create, rename, delete folders (two-mode delete: delete folder only vs. delete folder + contents)
  - Drag-and-drop notes between folders
  - Drag-and-drop folders to nest/reorder them
  - "All Notes" view that shows everything regardless of folder
  - "Unfiled" section for notes without a folder
  - Folder note counts
  - Global search across all folders
- **Tag system**:
  - Notes can have multiple tags
  - Collapsible tag browser in the sidebar (list of all tags with note counts)
  - Show more / show less toggle when tag list is long
  - Click a tag to filter notes by that tag
  - Multi-tag filtering (AND/OR toggle)
  - Create tags inline from the note editor
  - Delete/rename tags globally
  - Tag autocomplete when adding tags to a note
- **Sort & filter**:
  - Sort notes by: title (A-Z, Z-A), created date, modified date, manual order
  - Manual sort order via drag-and-drop reordering in the note list (drag handle visible when sort-by-manual is active)
  - Filter by: folder, tag, date range
  - Toggle between list view and grid/card view
- **Trash**:
  - Soft-deleted notes appear in a "Trash" view (sidebar tab toggle between Notes and Trash)
  - Trash counter badge in sidebar showing total trashed notes
  - Restore or permanently delete from trash
  - Bulk trash operations: select all, restore selected, delete selected, empty trash (with confirmation dialogs)
  - Auto-purge trash after configurable period (7/14/30/60/90 days or Never)
  - Trash retention setting in Settings page
- **Resizable sidebar dividers**:
  - Draggable dividers between sidebar sections (folders, tags, notes)
  - Divider positions persisted in localStorage

## Technical Considerations

- FTS5 setup:
  ```sql
  CREATE VIRTUAL TABLE notes_fts USING fts5(
    title, content, tags,
    content='notes',
    content_rowid='rowid'
  );
  ```
- FTS5 triggers to keep the index in sync with the `notes` table on INSERT, UPDATE, DELETE
- FTS5 `highlight()` function for search result snippets with matching terms highlighted
- Folder hierarchy stored as a path string (e.g., `work/projects/notesync`) or as a separate `folders` table with parent references
- Drag-and-drop via `@dnd-kit` (already used in the fin app)
- Tags stored as a JSON array in the `tags` column; indexed via FTS5 for search
- Consider a debounce of 150-200ms on search input to avoid excessive FTS5 queries

## Dependencies

- [00 — Project Scaffolding](../features/00-project-scaffolding.md) — needs SQLite database
- [01 — Note Editor](01-note-editor.md) — needs notes to exist for search and organization

## Open Questions

- Folder hierarchy: path string (`work/projects`) vs. separate `folders` table with parent-child relationships?
- Should tags be freeform text or selected from a predefined list?
- Maximum folder nesting depth?
