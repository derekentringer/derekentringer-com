# 01 — Note List & Viewer

**Status:** Not Started
**Phase:** 1 — Notes Core
**Priority:** High

## Summary

Browse and view notes on mobile with folder/tag navigation, note detail view, pull-to-refresh, and offline support via local SQLite.

## Requirements

- **Note list screen**:
  - FlatList of all notes, sorted by last modified (most recent first)
  - Each list item shows: title, folder badge, tag chips, last modified date, first line preview
  - Pull-to-refresh: fetches latest from API, updates local SQLite
  - Infinite scroll / pagination for large collections
  - Empty state: "No notes yet" with prompt to create or sync
- **Folder navigation**:
  - Collapsible folder tree (or flat folder list with counts)
  - Tap a folder to filter notes
  - "All Notes" option to show everything
  - "Unfiled" section for notes without a folder
- **Tag filtering**:
  - Tag list accessible from filter controls
  - Tap a tag to filter notes by that tag
  - Multi-tag filtering
- **Note detail/viewer screen**:
  - Full rendered markdown view (`react-native-markdown-display`)
  - Note title, folder, tags, created/updated dates displayed in header
  - "Edit" button to open in editor (feature 02)
  - "Delete" option in menu (soft delete with confirmation)
  - Share action: share note content as plain text
- **Offline support**:
  - Note list reads from local SQLite first
  - Sync indicator: shows whether data is fresh or cached
  - Notes are fully readable offline
- **Sort options**:
  - Sort by: title (A-Z, Z-A), created date, modified date
  - Accessible from a sort button in the header

## Technical Considerations

- Read from local SQLite for instant rendering; React Query triggers API refresh in the background
- FlatList with `keyExtractor` and optimized `renderItem` for performance
- Markdown rendering: `react-native-markdown-display` handles headings, lists, code blocks, links, bold/italic
- Folder tree: can use a collapsible section list or a separate folder browser screen
- Pull-to-refresh triggers: API fetch → update SQLite → re-render from SQLite
- Consider `useMemo` or `useCallback` for list item rendering to avoid unnecessary re-renders

## Dependencies

- [00 — Project Setup & Auth](00-project-setup-and-auth.md) — needs app shell, SQLite, and API connection

## Open Questions

- Folder navigation: inline collapsible tree in the sidebar, or a separate folder browser screen?
- Should the note viewer support horizontal swipe to navigate between notes?
- Thumbnail/preview: first line of content, or AI-generated summary (if available)?
