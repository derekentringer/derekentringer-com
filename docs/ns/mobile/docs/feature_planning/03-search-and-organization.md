# 03 — Search & Organization

**Status:** Not Started
**Phase:** 2 — Organization & Sync
**Priority:** High

## Summary

Full-text search across all notes using SQLite FTS5 (local, offline-capable), plus folder and tag browsing with sort/filter options.

## Requirements

- **Search**:
  - Search bar at the top of the Notes tab
  - Full-text search via SQLite FTS5 (same setup as desktop)
  - Real-time results as you type (debounced, 200ms)
  - Results show: note title, folder badge, matching content snippet with highlighted terms
  - Search includes title, content, and tags
  - Search works fully offline (queries local SQLite)
- **Folder browsing**:
  - Folder list with note counts
  - Tap a folder to see its notes
  - Nested folders displayed with indentation
  - "All Notes" and "Unfiled" sections
  - Long-press folder for options: rename, delete, move
- **Tag browsing**:
  - Tag cloud or tag list with note counts
  - Tap a tag to filter notes
  - Multi-tag filtering
- **Sort & filter**:
  - Sort by: title (A-Z, Z-A), created date, modified date
  - Sort control in the header bar
  - Filter chips for active folder/tag filters; tap to remove
- **Trash**:
  - "Trash" section accessible from navigation
  - List of soft-deleted notes
  - Swipe to restore or permanently delete
  - "Empty Trash" option

## Technical Considerations

- FTS5 setup (same as desktop):
  ```sql
  CREATE VIRTUAL TABLE notes_fts USING fts5(
    title, content, tags,
    content='notes',
    content_rowid='rowid'
  );
  ```
- FTS5 triggers to keep index in sync with `notes` table
- FTS5 `snippet()` or `highlight()` for search result excerpts
- All search is local (SQLite) — no API call needed; works offline
- When online, semantic search results (from API) can supplement FTS5 results
- expo-sqlite supports FTS5 out of the box
- Debounce search input to avoid excessive queries on each keystroke
- FlatList with section headers for folder grouping

## Dependencies

- [00 — Project Setup & Auth](00-project-setup-and-auth.md) — needs SQLite database
- [01 — Note List & Viewer](01-note-list-and-viewer.md) — search results navigate to note viewer

## Open Questions

- Should search also hit the API for semantic results when online, or keep it purely local FTS5?
- Folder management (create, rename, delete) — on mobile, or only from desktop/web?
- Should recent searches be saved for quick re-access?
