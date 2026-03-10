# 05 — Favorites

**Status:** Complete
**Phase:** 4 — UI Features
**Priority:** High

## Summary

Favorite notes and folders with a dedicated collapsible sidebar panel, star indicators in note list and folder tree, and context menu integration. Matches the ns-web implementation for feature parity.

**No migration needed** — `notes.favorite` (migration 002) and `folders.favorite` (migration 003) columns already existed. `updateNote()` in db.ts already handled `{ favorite: boolean }`.

## What Was Implemented

### Database Functions (`src/lib/db.ts`)

- `toggleFolderFavorite(folderId, favorite)` — updates folder's `favorite` column and `updated_at`, returns refreshed folder tree via `fetchFolders()`
- `fetchFavoriteNotes()` — queries `SELECT * FROM notes WHERE favorite = 1 AND is_deleted = 0 ORDER BY title ASC`, returns mapped `Note[]`

### FavoritesPanel (`src/components/FavoritesPanel.tsx`)

- Ported from `packages/ns-web/src/components/FavoritesPanel.tsx`
- Props: `favoriteFolders`, `favoriteNotes`, `activeFolder`, `selectedNoteId`, `onSelectFolder`, `onSelectNote`, `onUnfavoriteFolder`, `onUnfavoriteNote`
- Returns `null` when no favorites exist (hides section entirely)
- Collapsible header with localStorage persistence (`ns-favorites-collapsed`)
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
- **New state**: `favoriteNotes` (`Note[]`)
- **New callbacks**:
  - `loadFavoriteNotes` — calls `fetchFavoriteNotes()`, sets state
  - `favoriteFolders` useMemo — recursive collect from folder tree where `f.favorite === true`
- **Load on mount**: `loadFavoriteNotes()` called from `loadData()`
- **Handlers**:
  - `handleToggleNoteFavorite(noteId, favorite)` — calls `updateNote()`, updates notes state, reloads favorites
  - `handleToggleFolderFavorite(folderId, favorite)` — calls `toggleFolderFavorite()`, sets folders from returned tree
  - `handleFavoriteNoteClick(noteId)` — finds note in current list or fetches by ID via `fetchNoteById`, then selects it
- **Sidebar layout**: `FavoritesPanel` placed above `FolderTree` inside the folder resize container; only renders when favorites exist
- **Props wired**: `onToggleFavorite={handleToggleNoteFavorite}` passed to both NoteList instances; `onToggleFavorite={handleToggleFolderFavorite}` passed to FolderTree

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
| `src/lib/db.ts` | Edited — added `toggleFolderFavorite`, `fetchFavoriteNotes` |
| `src/components/FavoritesPanel.tsx` | Created (ported from ns-web) |
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

- **Favorite sort order** — favorites are listed alphabetically; custom drag-and-drop reordering within the panel not implemented
- **Favorite limit** — unlimited favorites; no maximum enforced
- **Favorite sync** — favorites are local-only until Phase 6 sync engine
