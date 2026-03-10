# 05 — Favorites

**Status:** Complete
**Phase:** 4 — UI Features
**Priority:** High

## Summary

Favorite notes and folders with a dedicated collapsible sidebar panel, star indicators, and context menu integration. Matches the ns-web implementation for feature parity.

## Requirements

- **Favorite toggle**:
  - Right-click context menu on notes and folders: "Add to Favorites" / "Remove from Favorites"
  - `isFavorite` boolean column on notes and folders tables
- **Favorites panel**:
  - Collapsible "Favorites" section above Folders in the sidebar
  - Shows favorited notes and folders in a flat list
  - Collapse state persisted in localStorage
  - Click to navigate to the favorited note or folder
  - Real-time title sync (if a favorited note/folder is renamed, the panel updates)
- **Star indicators**:
  - Star icon (★) displayed next to favorited notes in the note list
  - Star icon next to favorited folders in the FolderTree
- **Section headers**:
  - 14px section headers for Favorites, Folders, Notes sections in sidebar
  - Collapsible Folders section header (matching Favorites)

## Technical Considerations

- Add `is_favorite` INTEGER (0/1) column to `notes` and `folders` tables via SQLite migration
- Favorites query: `SELECT * FROM notes WHERE is_favorite = 1 ORDER BY title`
- Context menu: reuse the existing right-click context menu pattern from the note list
- Sidebar layout: Favorites panel → Folders panel → Notes panel, each collapsible
- Favorite state syncs via the sync engine when online

## Dependencies

- [01 — Note Editor](01-note-editor.md) — needs notes to exist for favoriting
- [02 — Search & Organization](02-search-and-organization.md) — needs folders for folder favorites and FolderTree integration

## Open Questions

- Should favorites have a custom sort order (drag-and-drop reordering within the panel)?
- Maximum number of favorites, or unlimited?
