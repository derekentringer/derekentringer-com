# 24 — Navigation & Layout Improvements

## Summary

Obsidian-inspired navigation overhaul replacing the single sidebar with a multi-panel layout: vertical ribbon strip, tabbed sidebar (Explorer, Search, Favorites, Tags), and a separate resizable note list panel. Richer note rows show snippets, dates, and tags. Mirrors the web implementation (ns-web feature 22).

## What Was Built

### Components (`ns-desktop`)
- **`SidebarTabs.tsx`** — Tabbed sidebar with Explorer, Search, Favorites, and Tags panels; active tab persisted to localStorage
- **`Ribbon.tsx`** — Vertical icon strip pinned to the left edge; quick-access actions and navigation
- **`NoteListPanel.tsx`** — Resizable middle panel showing note rows with snippets, dates, and tag pills
- **`NoteList.tsx`** — Note row rendering with rich previews (snippet text, relative dates, inline tags)
- **`TagBrowser.tsx`** — Tag panel listing all tags with note counts; click to filter note list
- **`FavoritesPanel.tsx`** — Favorites tab showing starred notes for quick access
- **`FolderTree.tsx`** — Explorer tab with hierarchical folder navigation
- **`SearchSnippet.tsx`** — Search result row with highlighted match context
- **`ResizeDivider.tsx`** — Draggable divider between panels with localStorage-persisted widths

### Dashboard (`ns-desktop`)
- **`Dashboard.tsx`** — Updated with `refreshKey` prop to trigger re-renders on sync changes

### Sync Engine (`ns-desktop`)
- **`syncEngine.ts`** — Pull changes sorted by type priority (folders -> notes -> images) to prevent FK constraint errors on desktop SQLite

### Database (`ns-desktop`)
- **`db.ts`** — Added `countAllNotes()` for stable "All Notes" count that doesn't change when selecting folders

### Layout & Interaction (`ns-desktop`)
- Three-column layout with resize handles (ribbon + tabbed sidebar | note list | editor)
- Context menus use `inline-flex` for tight wrapping
- Tab headers aligned consistently with matching spacing
- Search results show only in sidebar Search tab (removed duplicate in note list)
- Desktop-specific: search state persists correctly across tab switches
- localStorage persistence for active tab, panel sizes, tag layout, sort settings

## Files Changed

| File | Change |
|------|--------|
| `packages/ns-desktop/src/components/SidebarTabs.tsx` | **New** — Tabbed sidebar with Explorer, Search, Favorites, Tags panels |
| `packages/ns-desktop/src/components/Ribbon.tsx` | **New** — Vertical icon strip for quick-access actions |
| `packages/ns-desktop/src/components/NoteListPanel.tsx` | **New** — Resizable note list panel with rich note rows |
| `packages/ns-desktop/src/components/NoteList.tsx` | **New** — Note row rendering with snippets, dates, tags |
| `packages/ns-desktop/src/components/TagBrowser.tsx` | **New** — Tag browser panel with counts and filtering |
| `packages/ns-desktop/src/components/FavoritesPanel.tsx` | **New** — Favorites panel for starred notes |
| `packages/ns-desktop/src/components/FolderTree.tsx` | **New** — Hierarchical folder tree for Explorer tab |
| `packages/ns-desktop/src/components/SearchSnippet.tsx` | **New** — Search result row with highlighted match context |
| `packages/ns-desktop/src/components/ResizeDivider.tsx` | **New** — Draggable resize divider with localStorage persistence |
| `packages/ns-desktop/src/components/Dashboard.tsx` | Added `refreshKey` prop for sync-triggered re-renders |
| `packages/ns-desktop/src/lib/syncEngine.ts` | Pull changes sorted by type priority (folders -> notes -> images) |
| `packages/ns-desktop/src/lib/db.ts` | Added `countAllNotes()` for stable All Notes count |
| `packages/ns-desktop/src/styles/global.css` | Three-column layout, context menu, tab header, resize handle styles |

## Tests

- None

## Status

- **Status**: Complete
- **Phase**: 4 — Polish
- **Priority**: Medium
