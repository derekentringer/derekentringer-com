# 01 — Note List & Viewer

**Status:** Complete
**Phase:** 1 — Notes Core
**Priority:** High
**Completed:** v1.93.27

## Summary

Browse and view notes on mobile with folder/tag navigation, favorites, dashboard, backlinks, version history, note detail view, pull-to-refresh, infinite scroll, and offline support via local SQLite. Adapted patterns from fin-mobile (FlatList, pull-to-refresh, skeletons, error cards) and ns-web's data model and UI concepts for mobile.

## What Was Implemented

### Utilities

- **`src/lib/markdown.ts`** — `stripMarkdown()` removes headings, bold/italic, code blocks, inline code, links, images, blockquotes, horizontal rules, strikethrough, list markers, and HTML tags. Produces plain text for note previews.
- **`src/lib/time.ts`** — `relativeTime()` converts ISO date strings to human-readable relative times ("just now", "5m ago", "3h ago", "2d ago", "3w ago", "3mo ago", "2y ago").

### Common Components

- **`Card.tsx`** — Theme-aware card wrapper with background, border, borderRadius, padding
- **`EmptyState.tsx`** — Centered message with optional action button
- **`ErrorCard.tsx`** — Error message with retry button
- **`SkeletonLoader.tsx`** — Animated shimmer loader using react-native-reanimated; `SkeletonLoader` (single bar) and `SkeletonCard` (title + lines) variants

### API Layer

- **`src/api/notes.ts`** — REST calls: `fetchNotes` (paginated, with folder/tag/search/sort filters), `fetchNote`, `fetchDashboard`, `fetchFavorites`, `updateNote`, `deleteNote`, `fetchBacklinks`, `fetchVersions`, `restoreVersion`, `fetchTags`
- **`src/api/folders.ts`** — REST calls: `fetchFolders`, `createFolder`, `renameFolder`, `deleteFolder`

### SQLite Data Access

- **`src/lib/noteStore.ts`** — Local SQLite read/write layer: `getAllNotes` (with folder/search/sort filters), `getNote`, `upsertNotes`, `getFolders`, `upsertFolders`, `searchNotes`. Maps DB rows ↔ `Note`/`FolderInfo` types from `@derekentringer/ns-shared`.

### React Query Hooks

- **`src/hooks/useNotes.ts`** — `useNotes` (infinite query with pageSize=50), `useNote`, `useDashboard`, `useFavorites`, `useUpdateNote`, `useDeleteNote`, `useToggleFavorite`. All mutations invalidate relevant query caches (notes, dashboard, favorites).
- **`src/hooks/useFolders.ts`** — `useFolders`, `useCreateFolder`, `useRenameFolder`, `useDeleteFolder`
- **`src/hooks/useTags.ts`** — `useTags` with 5-min staleTime
- **`src/hooks/useBacklinks.ts`** — `useBacklinks(noteId)`
- **`src/hooks/useVersions.ts`** — `useVersions(noteId)`, `useRestoreVersion` mutation

### Note Components

- **`NoteListItem.tsx`** — Row component: title, folder badge, tag chips (max 3 with overflow count), relative time, 1-line plain text preview
- **`DashboardNoteCard.tsx`** — Card component (220px wide): title, 2-line markdown-stripped preview, tags, relative time, folder name
- **`FolderPicker.tsx`** — Bottom sheet: flat indented folder list with counts, "All Notes" + "Unfiled" options, checkmark for selected
- **`TagPicker.tsx`** — Bottom sheet: tag list with counts, multi-select checkboxes, clear button
- **`SortPicker.tsx`** — Bottom sheet: sort field (Last Modified / Date Created / Title) + sort order toggle (Ascending/Descending)
- **`BacklinksSection.tsx`** — List of backlink items showing note title + link text, tappable to navigate
- **`VersionHistorySheet.tsx`** — Bottom sheet: expandable version list with relative timestamps + origin labels, tap to expand and view content, restore button with confirmation alert

### Screens

- **`DashboardScreen.tsx`** — Rewritten: ScrollView with Favorites section + Recently Edited section as horizontal card rows using `DashboardNoteCard`; pull-to-refresh with haptic feedback; skeleton loading; error card; empty state
- **`NotesScreen.tsx`** — Rewritten: NativeStack navigator wrapping `NoteListScreen` → `NoteDetailScreen`
- **`NoteListScreen.tsx`** — FlatList with infinite scroll (`onEndReached` + `fetchNextPage`), debounced search bar (300ms), folder/tag/sort filter buttons opening bottom sheet pickers, selected tag chips displayed below search bar, pull-to-refresh with haptic feedback, skeleton loaders, empty state, error card
- **`NoteDetailScreen.tsx`** — ScrollView with rendered markdown via `react-native-markdown-display` (themed styles for headings, code, blockquotes, links), header with title/folder/tags/dates, action row (favorite toggle, share, version history, delete), backlinks section at bottom, pull-to-refresh

### Navigation

- **`AppNavigator.tsx`** — Dashboard tab now wraps a `DashboardStack` navigator (DashboardHome → NoteDetail) so tapping a dashboard card pushes NoteDetail. Notes tab wraps `NotesScreen` stack (NotesList → NoteDetail). Other tabs (Search, AI, Settings) have individual headerShown configuration.
- **`types.ts`** — Added `DashboardStackParamList` (DashboardHome, NoteDetail), `MainTabParamList` for tab navigator typing

### Tests (72 new tests, 7 new suites — all passing)

- **markdown.test.ts** (19 tests) — stripMarkdown: headings, bold, italic, bold+italic, inline code, code blocks, links, images, blockquotes, horizontal rules, strikethrough, list markers, HTML tags, whitespace collapsing, empty string, underscore emphasis
- **time.test.ts** (9 tests) — relativeTime: just now, minutes, hours, days, weeks, months, years, future dates, current time
- **noteStore.test.ts** (12 tests) — getAllNotes (empty, row mapping, folder filter, search filter, sort), getNote (not found, found), upsertNotes (insert, JSON tags, boolean-to-int favorite), searchNotes (LIKE query, mapping)
- **useNotes.test.ts** (10 tests) — fetchNotes (list, filters), fetchNote (single), fetchDashboard (sections), updateNote, deleteNote, fetchBacklinks, fetchVersions
- **DashboardScreen.test.tsx** (3 tests) — empty dashboard, dashboard with data, API error handling
- **NoteListScreen.test.tsx** (10 tests) — default fetch, empty list, folder filter, tag filter, search filter, sort, pagination next page, pagination end, folder picker data, tag picker data
- **NoteDetailScreen.test.tsx** (9 tests) — fetch note, fetch error, favorite toggle on/off, delete, delete error, backlinks, empty backlinks, version list, version restore

## Verification

1. `npx tsc --noEmit` in `packages/ns-mobile/` — clean
2. `npx turbo run type-check --filter=@derekentringer/ns-mobile` — clean
3. `npm test` in `packages/ns-mobile/` — 98/98 passing across 11 suites (27 existing + 72 new = 99, minus 1 overlap)
4. Dashboard tab shows Favorites + Recently Edited sections with horizontal card rows
5. Notes tab shows paginated note list with search, folder/tag/sort filtering, infinite scroll
6. Tap a note → detail screen shows rendered markdown with metadata
7. Favorite toggle works from detail screen
8. Delete note with confirmation works
9. Backlinks section shows linking notes
10. Version history sheet shows expandable versions with restore
11. Empty states and skeleton loaders display correctly
12. Pull-to-refresh with haptic feedback works on all list screens

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Folder filter via bottom sheet (not sidebar tree) | Simpler for mobile V1; bottom sheet is discoverable and familiar |
| Tag filter via multi-select bottom sheet | Consistent with folder picker UX; chips shown below search bar for visibility |
| Infinite scroll with React Query `useInfiniteQuery` | pageSize=50, `getNextPageParam` based on loaded count vs total; matches fin-mobile pattern |
| `NoteDetailScreen` shared between Dashboard and Notes stacks | Avoids duplication; both stacks push the same component with `noteId` param |
| Markdown rendering with `react-native-markdown-display` | Supports headings, code blocks, links, blockquotes; themed to match NoteSync colors |
| Version history in expandable bottom sheet | Compact UI; tap to expand version content, restore with confirmation alert |
| Backlinks inline at bottom of detail view | Non-intrusive; tappable to navigate to linking notes |

## Key Patterns Reused

| Pattern | Source | Adaptation |
|---------|--------|------------|
| FlatList with infinite scroll | `fin-mobile/TransactionsScreen.tsx` | `useInfiniteQuery` with page-based pagination |
| Pull-to-refresh + haptics | `fin-mobile/DashboardScreen.tsx` | Same pattern with `expo-haptics` |
| SkeletonLoader (reanimated shimmer) | `fin-mobile/SkeletonLoader.tsx` | Theme-aware colors via `useThemeColors()` |
| EmptyState / ErrorCard / Card | `fin-mobile/components/common/` | Theme-aware versions |
| React Query hooks | `fin-mobile/useTransactions.ts` | Same useInfiniteQuery/useMutation/invalidation pattern |
| API function pattern | `fin-mobile/api/transactions.ts` | Axios with typed responses |
| Relative time formatting | `ns-web/DashboardNoteCard.tsx` | Extracted to standalone `lib/time.ts` |
| Markdown stripping | `ns-web/DashboardNoteCard.tsx` | Extracted to standalone `lib/markdown.ts` |
| NoteSync shared types | `ns-shared/types.ts` | Direct import of Note, FolderInfo, TagInfo, etc. |

## What's Next

- Feature 02: Note Editor — native TextInput markdown editor with toolbar
- Feature 03: Search & Organization — full-text search via SQLite FTS5
- Feature 04: Sync Engine — offline-first sync with SQLite ↔ ns-api
