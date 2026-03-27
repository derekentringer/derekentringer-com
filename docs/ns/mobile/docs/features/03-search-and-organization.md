# 03 — Search & Organization

**Status:** Complete
**Phase:** 2 — Organization & Sync
**Priority:** High
**Completed:** v1.93.29

## Summary

Trash management, folder management from mobile, and bottom tab cleanup. The Search tab (placeholder) was removed — reduced to 4 bottom tabs (Dashboard, Notes, AI, Settings). Full trash lifecycle accessible from Settings. Folder create/rename/delete added to the FolderPicker bottom sheet. FTS5 local search is deferred to Feature 04 (Sync Engine) since it requires local SQLite data.

## What Was Implemented

### Navigation Changes

- **Removed Search tab** — bottom navigation reduced from 5 to 4 tabs: Dashboard, Notes, AI, Settings
- **Deleted `SearchScreen.tsx`** — placeholder screen removed
- **`SettingsStack` navigator** — Settings tab now wraps a native stack: SettingsHome → Trash → TrashNoteDetail
- **Updated `MainTabParamList`** — removed `Search`, changed `Settings` to `NavigatorScreenParams<SettingsStackParamList>`
- **Updated `SettingsStackParamList`** — added `Trash` and `TrashNoteDetail: { note: Note }` routes

### API Layer

- **`src/api/notes.ts`** — Added 4 trash API functions:
  - `fetchTrash(params?)` — `GET /notes/trash` with pagination
  - `restoreNote(id)` — `PATCH /notes/:id/restore`
  - `permanentDeleteNote(id)` — `DELETE /notes/:id/permanent`
  - `emptyTrash(ids?)` — `DELETE /notes/trash` with optional selective IDs

### Hooks

- **`src/hooks/useTrash.ts`** — 5 hooks:
  - `useTrash()` — infinite query for paginated trash list
  - `useTrashCount()` — lightweight query for count (used in Settings badge)
  - `useRestoreNote()` — mutation, invalidates trash + notes + dashboard + folders caches
  - `usePermanentDeleteNote()` — mutation, invalidates trash cache
  - `useEmptyTrash()` — mutation, invalidates trash cache

### Components

- **`src/components/notes/TrashNoteItem.tsx`** — Swipeable list item using `react-native-gesture-handler` Swipeable. Left swipe reveals green Restore action, right swipe reveals red Delete Permanently action. Shows title, content preview, relative deleted time, folder badge, and "Deleted" badge.

### Screens

- **`src/screens/TrashScreen.tsx`** — FlatList of trashed notes with pull-to-refresh, infinite pagination, "Empty Trash" header button (with confirmation alert), and empty state. Tapping a note navigates to TrashNoteDetail with the full Note object passed via route params.
- **`src/screens/TrashNoteDetailScreen.tsx`** — Read-only note viewer for trashed notes. Shows "Deleted on [date]" banner, title, folder, tags, and rendered markdown content. Header buttons: Restore (green) and Delete Permanently (red). No edit button, no favorite toggle. Note data is passed via navigation params (not fetched via API, since `GET /notes/:id` excludes deleted notes).
- **`src/screens/SettingsScreen.tsx`** — Added "Data" section with Trash row showing trash count badge and chevron. Navigates to TrashScreen.

### Folder Management

- **`src/components/notes/FolderPicker.tsx`** — Enhanced with:
  - "New Folder" button in header — custom cross-platform `PromptDialog` for name input, uses `useCreateFolder` mutation
  - Long-press on folders — custom `ActionMenuDialog` modal with Rename and Delete on the left, Cancel on the right
  - Rename — `PromptDialog` pre-filled with current name, uses `useRenameFolder` mutation
  - Delete — confirmation alert, uses `useDeleteFolder` mutation with `mode: "move-up"` (moves notes to parent)
  - Light haptic feedback on long-press and all mutations
  - System folders (All Notes, Unfiled) are excluded from long-press actions
  - Custom `PromptDialog` and `ActionMenuDialog` components replace `Alert.prompt` (iOS-only) and `Alert.alert` for full cross-platform support and layout control

### Dashboard Polish

- **`src/components/notes/DashboardNoteCard.tsx`** — Folder name and time always pinned to card bottom via flex spacer; tile cards have `minHeight: 120` for consistent sizing

## Files Summary

| Action | File | Description |
|--------|------|-------------|
| Created | `src/hooks/useTrash.ts` | Trash query + mutations |
| Created | `src/components/notes/TrashNoteItem.tsx` | Swipeable trash list item |
| Created | `src/screens/TrashScreen.tsx` | Trash list with swipe actions |
| Created | `src/screens/TrashNoteDetailScreen.tsx` | Read-only trashed note viewer |
| Modified | `src/api/notes.ts` | Added fetchTrash, restoreNote, permanentDeleteNote, emptyTrash |
| Modified | `src/navigation/types.ts` | Removed Search, added Trash/TrashNoteDetail to SettingsStack |
| Modified | `src/navigation/AppNavigator.tsx` | Removed Search tab, added SettingsNavigator stack |
| Modified | `src/screens/SettingsScreen.tsx` | Added Trash row with count badge |
| Modified | `src/components/notes/FolderPicker.tsx` | Custom PromptDialog + ActionMenuDialog, long-press rename/delete with haptics |
| Modified | `src/components/notes/DashboardNoteCard.tsx` | Folder/time pinned to bottom, minHeight on tile cards |
| Deleted | `src/screens/SearchScreen.tsx` | Removed placeholder |

## Verification

1. `npx tsc --noEmit` — clean
2. Bottom nav shows 4 tabs (Dashboard, Notes, AI, Settings)
3. Settings → Trash shows count badge, tapping opens trash list
4. Trash list shows deleted notes with relative delete time
5. Swipe left on trash note → Restore button (green)
6. Swipe right on trash note → Delete Permanently button (red, with confirmation)
7. Tap trash note → read-only detail view with Restore/Delete in header
8. "Empty Trash" button with confirmation clears all trash
9. Pull-to-refresh on trash list
10. Folder picker → "New Folder" button creates folder
11. Long-press folder → rename/delete options work
12. Delete folder moves notes to parent (mode: "move-up")

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Pass Note object via route params | `GET /notes/:id` excludes deleted notes. Trash list already has full Note data. |
| Trash accessible from Settings | Matches common mobile patterns (iOS Settings → Trash). Keeps bottom tabs clean. |
| Swipeable list items | Native-feeling interaction using react-native-gesture-handler Swipeable. |
| Deferred FTS5 search | Requires local SQLite data from sync engine (Feature 04). API-based search already works in Notes tab. |
| Folder management in FolderPicker | No separate Folder Management screen needed. Long-press is intuitive on mobile. |
| Custom dialogs over Alert.prompt/Alert.alert | `Alert.prompt` is iOS-only (silent no-op on Android). `Alert.alert` button positioning is OS-controlled. Custom Modal dialogs provide cross-platform support and precise button layout. |
| "move-up" delete mode | Safest option — notes move to parent folder instead of being orphaned or deleted. |

## Key Patterns Reused

| Pattern | Source | Adaptation |
|---------|--------|------------|
| Markdown rendering + mdStyles | `NoteDetailScreen.tsx` | Same themed markdown styles for trash note preview |
| NoteListItem layout | `NoteListItem.tsx` | TrashNoteItem mirrors the card layout with added swipe actions |
| Infinite query pattern | `useNotes.ts` | Same `useInfiniteQuery` pattern for paginated trash |
| Folder resolution | `findFolderName` from `lib/folders.ts` | Resolves folderId to folder name in trash items |
| Haptic feedback | Feature 02 patterns | Applied to restore, delete, and folder mutations |
| EmptyState/ErrorCard/SkeletonCard | `components/common/` | Consistent loading/error/empty states |

## What's Next

- Feature 04: Sync Engine — offline-first sync with SQLite ↔ ns-api, enables FTS5 local search
- Feature 05: AI Features — AI writing assistance, tagging, summarization
