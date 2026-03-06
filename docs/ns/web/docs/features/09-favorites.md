# 09 — Favorites

## Overview

Users can mark notes and folders as favorites for quick access. A collapsible "Favorites" panel appears above the Folders section in the sidebar, showing all favorited items. Users toggle favorites via right-click context menus on notes and folders. Favorited items display a small star indicator in the FolderTree and NoteList.

## Database

- **`favorite` column on Note model** — `Boolean @default(false)` in `ns-api/prisma/schema.prisma`
- **`favorite` column on Folder model** — `Boolean @default(false)` in `ns-api/prisma/schema.prisma`
- Migration: `20260307000000_add_favorites/migration.sql`

## Backend

### Note Store (`ns-api/src/store/noteStore.ts`)

- `updateNote()` — handles `favorite` field updates (does not trigger `captureVersion` or `syncNoteLinks`)
- `listFavoriteNotes()` — returns all non-deleted notes with `favorite: true`, ordered by title ascending
- `toggleFolderFavorite(folderId, favorite)` — updates folder's favorite flag via `prisma.folder.update()`
- `buildFolderTree()` — includes `favorite: f.favorite` in FolderInfo mapping
- Raw SQL SELECTs (`keywordSearch`, `semanticSearch`, `hybridSearch`) — `"favorite"` added to all three column lists

### Mapper (`ns-api/src/lib/mappers.ts`)

- `toNote()` — includes `favorite: row.favorite` in output

### API Routes (`ns-api/src/routes/notes.ts`)

- `GET /notes/favorites` — returns `{ notes: Note[] }` of all favorite notes (auth required)
- `PATCH /notes/folders/:id/favorite` — toggles folder favorite flag, validates UUID, returns `{ id, favorite }`
- `PATCH /notes/:id` — `favorite` added to update schema and empty-body check

## Shared Types (`shared/src/ns/types.ts`)

- `Note` — added `favorite: boolean`
- `UpdateNoteRequest` — added `favorite?: boolean`
- `FolderInfo` — added `favorite: boolean`

## Frontend

### API Client (`ns-web/src/api/notes.ts`)

- `fetchFavoriteNotes()` → `{ notes: Note[] }` — GET `/notes/favorites`
- `toggleFolderFavoriteApi(folderId, favorite)` → `{ id, favorite }` — PATCH `/notes/folders/:id/favorite`

### Offline Support (`ns-web/src/api/offlineNotes.ts`)

- `fetchFavoriteNotes` and `toggleFolderFavoriteApi` re-exported as passthrough (online-only)
- Offline `createNote` includes `favorite: false` default
- Offline `updateNote` merges `favorite` field from update data or cached value

### FavoritesPanel (`ns-web/src/components/FavoritesPanel.tsx`)

- Collapsible section with localStorage persistence (`ns-favorites-collapsed`)
- Header: "Favorites" label (uppercase, `text-sm text-muted-foreground tracking-wider`) with collapse toggle (▾ chevron)
- Renders nothing (not even the header) when no favorites exist
- Folders listed first (📁 icon), then notes
- Items styled to match FolderTree/NoteList: `px-2 py-1.5 rounded-md text-sm`, active state with `bg-accent`
- Right-click context menu with "Unfavorite" option (fixed-position pattern matching FolderTree/NoteList)
- Scrollable content with `max-h-[200px] overflow-y-auto`

### FolderTree Updates (`ns-web/src/components/FolderTree.tsx`)

- `onToggleFavorite` prop passed through to `FolderTreeNode`
- Star indicator after folder name: `★` in `text-[10px] text-primary`
- "Favorite" / "Unfavorite" context menu item (before Delete, after Export)
- Collapsible Folders section header with localStorage persistence (`ns-folders-collapsed`) and ▾ chevron toggle

### NoteList Updates (`ns-web/src/components/NoteList.tsx`)

- `onToggleFavorite` prop on `NoteListProps` and `SortableNoteItemProps`
- Star indicator before note title: `★` in `text-[10px] text-primary`
- "Favorite" / "Unfavorite" context menu item (before Delete, after Export)

### NotesPage Integration (`ns-web/src/pages/NotesPage.tsx`)

- `favoriteNotes` state with `loadFavoriteNotes()` callback (fetched on mount and after toggles)
- `favoriteFolders` derived from `folders` state via `useMemo` (recursive collect where `f.favorite`)
- `handleToggleNoteFavorite(noteId, favorite)` — calls `updateNote()`, updates local notes state, reloads favorites
- `handleToggleFolderFavorite(folderId, favorite)` — calls `toggleFolderFavoriteApi()`, refreshes folder tree
- `handleFavoriteNoteClick(noteId)` — navigates to favorited note (switches to "All Notes" if note not in current folder)
- FavoritesPanel inserted above FolderTree in sidebar
- `handleSave` syncs title/content changes to `favoriteNotes` state for real-time panel updates
- Section headers (Favorites, Folders, Notes) all use `text-sm` (14px)

## Tests

### Backend (ns-api)

- `notes.test.ts` — PATCH favorite on/off, GET `/notes/favorites` (auth/unauth), PATCH `/notes/folders/:id/favorite` (toggle/404/unauth)
- `helpers/mockPrisma.ts` — `favorite: false` added to default mock note row

### Frontend (ns-web)

- `FavoritesPanel.test.tsx` — renders nothing when empty, renders header and items, click handlers, context menu unfavorite, collapse/expand persistence
- `NotesPage.test.tsx` — `fetchFavoriteNotes` and `toggleFolderFavoriteApi` mock setup
- All test files updated with `favorite: false` in mock objects: `notes-api.test.ts`, `db.test.ts`, `offlineNotes.test.ts`, `FolderTree.test.tsx`, `importExport.test.ts`, `ai-api.test.ts`, `useOfflineCache.test.ts`

## Files Changed

| File | Action |
|------|--------|
| `ns-api/prisma/schema.prisma` | Modified — `favorite` on Note + Folder |
| `ns-api/prisma/migrations/20260307000000_add_favorites/migration.sql` | Created |
| `ns-api/src/lib/mappers.ts` | Modified — `favorite` in `toNote()` |
| `ns-api/src/store/noteStore.ts` | Modified — updateNote, buildFolderTree, listFavoriteNotes, toggleFolderFavorite, raw SQL SELECTs |
| `ns-api/src/routes/notes.ts` | Modified — schema, favorites endpoint, folder favorite endpoint |
| `ns-api/src/__tests__/helpers/mockPrisma.ts` | Modified — favorite default |
| `ns-api/src/__tests__/notes.test.ts` | Modified — favorite route tests |
| `shared/src/ns/types.ts` | Modified — favorite on Note, UpdateNoteRequest, FolderInfo |
| `ns-web/src/api/notes.ts` | Modified — fetchFavoriteNotes, toggleFolderFavoriteApi |
| `ns-web/src/api/offlineNotes.ts` | Modified — re-exports + offline merge |
| `ns-web/src/components/FavoritesPanel.tsx` | Created |
| `ns-web/src/components/FolderTree.tsx` | Modified — onToggleFavorite, context menu, star indicator, collapsible section |
| `ns-web/src/components/NoteList.tsx` | Modified — onToggleFavorite, context menu, star indicator |
| `ns-web/src/pages/NotesPage.tsx` | Modified — FavoritesPanel integration, handlers, state, title sync |
| `ns-web/src/__tests__/FavoritesPanel.test.tsx` | Created |
| `ns-web/src/__tests__/NotesPage.test.tsx` | Modified — favorite mocks |
| `ns-web/src/__tests__/notes-api.test.ts` | Modified — favorite default |
| `ns-web/src/__tests__/db.test.ts` | Modified — favorite default |
| `ns-web/src/__tests__/offlineNotes.test.ts` | Modified — favorite default |
| `ns-web/src/__tests__/FolderTree.test.tsx` | Modified — favorite default |
| `ns-web/src/__tests__/importExport.test.ts` | Modified — favorite default |
| `ns-web/src/__tests__/ai-api.test.ts` | Modified — favorite default |
| `ns-web/src/__tests__/useOfflineCache.test.ts` | Modified — favorite default |
