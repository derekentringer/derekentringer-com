# 03 — Search & Organization

**Status:** Not Started
**Phase:** 2 — Notes Core
**Priority:** High

## Summary

Full-text search across all notes using PostgreSQL tsvector, plus a folder and tag system with drag-and-drop reorganization and sort/filter capabilities.

## Requirements

- **Full-text search**:
  - PostgreSQL tsvector index on note title and content
  - Search bar at the top of the app (Ctrl+K / Cmd+K to focus)
  - Real-time results as you type (debounced, via API)
  - Results show note title, folder, and a snippet with highlighted matching terms (PostgreSQL `ts_headline`)
  - API endpoint: `GET /notes/search?q={query}`
- **Folder system**:
  - Hierarchical folders displayed as a tree in the sidebar
  - Create, rename, delete folders
  - Drag-and-drop notes between folders
  - Drag-and-drop folders to nest them
  - "All Notes" view showing everything
  - "Unfiled" section for notes without a folder
  - Folder note counts
  - API endpoints:

    | Method | Path | Auth | Description |
    |--------|------|------|-------------|
    | GET | `/folders` | Yes | List all folders (tree structure) |
    | POST | `/folders` | Yes | Create a folder |
    | PATCH | `/folders/:id` | Yes | Rename or move a folder |
    | DELETE | `/folders/:id` | Yes | Delete a folder (move notes to Unfiled) |

- **Tag system**:
  - Notes can have multiple tags
  - Tag browser in the sidebar (list of all tags with note counts)
  - Click a tag to filter notes
  - Multi-tag filtering (AND/OR toggle)
  - Create tags inline from the note editor
  - Delete/rename tags globally
  - Tag autocomplete when adding tags
  - API endpoints:

    | Method | Path | Auth | Description |
    |--------|------|------|-------------|
    | GET | `/tags` | Yes | List all tags with note counts |
    | PATCH | `/tags/:name` | Yes | Rename a tag globally |
    | DELETE | `/tags/:name` | Yes | Remove a tag from all notes |

- **Sort & filter**:
  - Sort by: title, created date, modified date (ascending/descending)
  - Filter by: folder, tag, date range
  - Persistent sort/filter preferences per session
- **Trash**:
  - Soft-deleted notes in a "Trash" view
  - Restore or permanently delete
  - Auto-purge after 30 days (server-side cron or on-request cleanup)

## Technical Considerations

- PostgreSQL tsvector setup:
  ```sql
  ALTER TABLE "Note" ADD COLUMN tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))) STORED;
  CREATE INDEX notes_tsv_idx ON "Note" USING GIN(tsv);
  ```
- `ts_headline()` for search result snippets with `<mark>` tags
- Drag-and-drop via `@dnd-kit` (already used in the fin app)
- Folder hierarchy: stored as a separate `Folder` model with parent reference, or as path strings on notes
- Tags stored as JSON array in the `tags` column; GIN index for efficient tag queries
- Debounce search input: 200ms before sending API request

## Dependencies

- [00 — Project Scaffolding](00-project-scaffolding.md) — needs PostgreSQL database
- [01 — Auth](01-auth.md) — all endpoints require authentication
- [02 — Note Management](02-note-management.md) — needs notes to exist

## Open Questions

- Should folders be a separate Prisma model or path strings on the Note model?
- Should search include soft-deleted notes (with a toggle)?
- Pagination strategy for search results: cursor-based or offset?
