# 22 — Navigation & Layout Improvements

## Summary

Obsidian-inspired navigation overhaul replacing the single sidebar with a multi-panel layout: vertical ribbon strip, tabbed sidebar (Explorer, Search, Favorites, Tags), and a separate resizable note list panel. Richer note rows show snippets, dates, and tags.

## What Was Built

### SidebarTabs (`ns-web`)
- **`SidebarTabs.tsx`** — Tabbed sidebar view switcher with Explorer, Search, Favorites, and Tags tabs
- Each tab has its own icon and content panel
- Active tab persisted to localStorage

### Ribbon (`ns-web`)
- **`Ribbon.tsx`** — Always-visible vertical utility strip on the far left
- Actions: New Note, Audio Record (long-press for mode selector), Settings, and SyncSwarm game launcher

### NoteListPanel (`ns-web`)
- **`NoteListPanel.tsx`** — Separate resizable panel between sidebar and editor
- Shows filtered note list with sort controls and note count

### NoteList (`ns-web`)
- **`NoteList.tsx`** — Enhanced note rows with content snippets (stripped markdown), relative dates, and dimmed accent-colored tag pills

### TagBrowser (`ns-web`)
- **`TagBrowser.tsx`** — Enhanced Tags tab with toggleable list/pill layouts, sort options, filter input, and clear filter button

### FavoritesPanel (`ns-web`)
- **`FavoritesPanel.tsx`** — Updated favorites with header title and icons, double-click to open in tab

### FolderTree (`ns-web`)
- **`FolderTree.tsx`** — Updated with expand arrows on all folders (including empty ones), collapsible header removed

### SearchSnippet (`ns-web`)
- **`SearchSnippet.tsx`** — Search results moved to sidebar Search tab matching NoteList row style

### ResizeDivider (`ns-web`)
- **`ResizeDivider.tsx`** — Drag dividers between panels for resizing

### Dashboard (`ns-web`)
- **`Dashboard.tsx`** — Updated with refreshKey prop for no-flash updates on data changes

### Layout & Polish (`ns-web`)
- Three-column layout (ribbon | sidebar tabs | note list | editor) with independent resize handles
- Context menus use `inline-flex flex-col` for tight wrapping instead of min-width
- Tab headers aligned consistently across all sidebar tabs with matching spacing
- Search results display in sidebar only (removed from note list panel when in Search tab)
- localStorage persistence for active tab, panel sizes, tag layout preference, and sort settings

## Files Changed

| File | Change |
|------|--------|
| `packages/ns-web/src/components/SidebarTabs.tsx` | **New** — Tabbed sidebar view switcher with Explorer, Search, Favorites, Tags |
| `packages/ns-web/src/components/Ribbon.tsx` | **New** — Vertical utility strip with New Note, Audio Record, Settings, SyncSwarm |
| `packages/ns-web/src/components/NoteListPanel.tsx` | **New** — Resizable note list panel with sort controls and note count |
| `packages/ns-web/src/components/NoteList.tsx` | Updated — Content snippets, relative dates, accent-colored tag pills |
| `packages/ns-web/src/components/TagBrowser.tsx` | Updated — Toggleable list/pill layouts, sort options, filter input |
| `packages/ns-web/src/components/FavoritesPanel.tsx` | Updated — Header title and icons, double-click to open in tab |
| `packages/ns-web/src/components/FolderTree.tsx` | Updated — Expand arrows on all folders, collapsible header removed |
| `packages/ns-web/src/components/SearchSnippet.tsx` | Updated — Moved to sidebar Search tab, matches NoteList row style |
| `packages/ns-web/src/components/ResizeDivider.tsx` | Updated — Drag dividers between panels |
| `packages/ns-web/src/components/Dashboard.tsx` | Updated — refreshKey prop for no-flash updates |

## Tests

- No dedicated tests for this feature (layout and navigation changes are integration-level).
