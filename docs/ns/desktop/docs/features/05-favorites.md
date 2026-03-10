# 05 — Favorites

**Status:** Complete
**Phase:** 4 — UI Features
**Priority:** High

## Summary

Favorite notes and folders with a dedicated collapsible sidebar panel, star indicators in note list and folder tree, and context menu integration. Matches the ns-web implementation for feature parity.

**Migration 007** — adds `favorite_sort_order INTEGER NOT NULL DEFAULT 0` column to `notes` table for manual drag-and-drop reordering within the favorites panel. `notes.favorite` (migration 002) and `folders.favorite` (migration 003) columns already existed. `updateNote()` in db.ts already handled `{ favorite: boolean }`.

## What Was Implemented

### Database Functions (`src/lib/db.ts`)

- `toggleFolderFavorite(folderId, favorite)` — updates folder's `favorite` column and `updated_at`, returns refreshed folder tree via `fetchFolders()`
- `fetchFavoriteNotes({ sortBy?, sortOrder? })` — queries favorites with configurable sort; supports `updatedAt` (default, desc), `createdAt`, `title` (with `COLLATE NOCASE`), or `sortOrder` (maps to `favorite_sort_order`); returns mapped `Note[]`
- `reorderFavoriteNotes(order)` — batch-updates `favorite_sort_order` column for manual drag-and-drop reordering
- `updateNote()` — when `favorite` is set to `true`, auto-assigns next `favorite_sort_order` (MAX + 1)
- `NoteRow` type includes `favorite_sort_order: number`; `rowToNote()` maps to `favoriteSortOrder`
- `upsertNoteFromRemote()` includes `favorite_sort_order` in both UPDATE and INSERT SQL

### FavoritesPanel (`src/components/FavoritesPanel.tsx`)

- Ported from `packages/ns-web/src/components/FavoritesPanel.tsx`
- Props: `favoriteFolders`, `favoriteNotes`, `activeFolder`, `selectedNoteId`, `onSelectFolder`, `onSelectNote`, `onUnfavoriteFolder`, `onUnfavoriteNote`, `favSortBy`, `favSortOrder`, `onFavSortByChange`, `onFavSortOrderChange`
- Returns `null` when no favorites exist (hides section entirely)
- Header row: collapsible toggle with sort dropdown and asc/desc button inline on the right (only shown when expanded)
- Sort controls: dropdown (Manual/Modified/Created/Title) + direction button (↑/↓), matching notes sort styling
- Notes wrapped in `SortableContext` from `@dnd-kit/sortable` with `verticalListSortingStrategy`; each note uses `SortableFavoriteNoteItem` sub-component with `useSortable`; drag handle (☰) shown only in manual sort mode
- Max-height 200px scrollable list
- Folder icon for folders, no icon for notes
- Right-click context menu with "Unfavorite" option
- Active state styling matches selected folder/note (bg-accent)
- `cursor-pointer` on all interactive elements

### NoteList Updates (`src/components/NoteList.tsx`)

- **Star indicator**: `★` shown before note title for favorited notes (`text-[10px] text-primary mr-1`)
- **New prop**: `onToggleFavorite?: (noteId: string, favorite: boolean) => void`
- **Context menu**: added "Favorite"/"Unfavorite" button before existing "Delete" button; menu opens when either `onDeleteNote` or `onToggleFavorite` is provided; closes after toggling via `onContextMenuClose`

### FolderTree Updates (`src/components/FolderTree.tsx`)

- **New prop**: `onToggleFavorite?: (folderId: string, favorite: boolean) => void`
- **Context menu**: added "Favorite"/"Unfavorite" button after "Move to Root" and before "Delete"
- Star indicator on folder names already existed from migration 003 (no change needed)

### NotesPage Integration (`src/pages/NotesPage.tsx`)

- **New imports**: `fetchFavoriteNotes`, `toggleFolderFavorite` from db.ts; `FavoritesPanel` component
- **New state**: `favoriteNotes` (`Note[]`), `favSortBy` / `favSortOrder` with localStorage persistence (`ns-fav-sort-by`, `ns-fav-sort-order`); default: `updatedAt` / `desc` (Modified Descending)
- **New callbacks**:
  - `loadFavoriteNotes` — calls `fetchFavoriteNotes({ sortBy, sortOrder })`, sets state; `useCallback` with `[favSortBy, favSortOrder]` deps
  - `favoriteFolders` useMemo — recursive collect from folder tree where `f.favorite === true`
- **Load on mount**: `loadFavoriteNotes()` called from `loadData()`
- **Reload on sort change**: `useEffect` depends on `[loadFavoriteNotes]` to avoid stale closure issues
- **Handlers**:
  - `handleToggleNoteFavorite(noteId, favorite)` — calls `updateNote()`, updates notes state, reloads favorites
  - `handleToggleFolderFavorite(folderId, favorite)` — calls `toggleFolderFavorite()`, sets folders from returned tree
  - `handleFavSortByChange` / `handleFavSortOrderChange` — update state + persist to localStorage
  - `handleReorderFavoriteNotes(activeId, overId)` — strips `fav-note:` prefix, reorders with `arrayMove`, optimistic update, calls `reorderFavoriteNotes`
  - `handleFavoriteNoteClick(noteId)` — finds note in current list or fetches by ID via `fetchNoteById`, then selects it
- **handleDragEnd** — detects `fav-note:` prefixed drag IDs and routes to `handleReorderFavoriteNotes`
- **handleSave** — re-fetches both notes (via `reloadNotes()` with folder filter) and favorites (via `loadFavoriteNotes()`) after save for correct sort order
- **Default note sort**: `updatedAt` / `desc` (Modified Descending)
- **Sidebar layout**: `FavoritesPanel` placed above `FolderTree` inside the folder resize container; only renders when favorites exist
- **Props wired**: `onToggleFavorite={handleToggleNoteFavorite}` passed to both NoteList instances; `onToggleFavorite={handleToggleFolderFavorite}` passed to FolderTree; fav sort props passed to FavoritesPanel

## Tests

### `src/__tests__/FavoritesPanel.test.tsx` (new)
- 9 tests: renders nothing when empty, renders section header, renders folders and notes, click handlers for folders/notes, context menu unfavorite for notes and folders, collapse/expand localStorage persistence

### `src/__tests__/NoteList.test.tsx` (updated)
- 4 new tests: star indicator shown for favorite notes (not for non-favorites), "Favorite"/"Unfavorite" in context menu when `onToggleFavorite` provided, shows "Unfavorite" for already-favorited notes, calls `onToggleFavorite` with correct args

### `src/__tests__/FolderTree.test.tsx` (updated)
- 3 new tests: "Favorite" in context menu when `onToggleFavorite` provided, "Unfavorite" for favorited folders, calls `onToggleFavorite` with correct args

## Files Changed

| File | Action |
|------|--------|
| `src-tauri/migrations/007.sql` | Created — adds `favorite_sort_order` column |
| `src-tauri/src/lib.rs` | Edited — added migration 7 to Rust migrations vector |
| `src/lib/db.ts` | Edited — added `toggleFolderFavorite`, `fetchFavoriteNotes` (with sort), `reorderFavoriteNotes`, `favorite_sort_order` in NoteRow/rowToNote/updateNote/upsertNoteFromRemote/createNote, `COLLATE NOCASE` for title sorting |
| `src/components/FavoritesPanel.tsx` | Created (ported from ns-web) — includes sort controls + drag-and-drop |
| `src/components/NoteList.tsx` | Edited — star indicator, `onToggleFavorite` prop, context menu |
| `src/components/FolderTree.tsx` | Edited — `onToggleFavorite` prop, context menu item |
| `src/pages/NotesPage.tsx` | Edited — state, handlers, FavoritesPanel placement, wire props |
| `src/__tests__/FavoritesPanel.test.tsx` | Created |
| `src/__tests__/NoteList.test.tsx` | Edited — added 4 favorite tests |
| `src/__tests__/FolderTree.test.tsx` | Edited — added 3 favorite tests |

## Dependencies

- [01 — Note Editor](01-note-editor.md) — notes must exist for favoriting
- [02 — Search & Organization](02-search-and-organization.md) — folders and FolderTree for folder favorites

## Deferred

- **Favorite limit** — unlimited favorites; no maximum enforced
