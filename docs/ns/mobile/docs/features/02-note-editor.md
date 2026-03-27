# 02 — Note Editor

**Status:** Complete
**Phase:** 1 — Notes Core
**Priority:** High
**Completed:** v1.93.28

## Summary

Mobile-optimized markdown editor for creating, editing, and deleting notes with auto-save, markdown toolbar, preview toggle, folder assignment, tag management, and copy-link sharing. Follows the same layout patterns as ns-web and ns-desktop.

## What Was Implemented

### Utilities

- **`src/lib/editorActions.ts`** — Pure functions for markdown text manipulation: `toggleBold`, `toggleItalic`, `insertHeading` (cycles #→######→remove), `insertLink`, `insertList`, `insertCheckbox`, `insertCode` (inline backtick or fenced block for multiline), `insertQuote`. Each takes `(text, start, end)` and returns `{ text, selection }`.
- **`src/lib/folders.ts`** — Shared `findFolderName()` utility that recursively searches a folder tree to resolve a `folderId` to a folder name string. Used by DashboardScreen, NoteDetailScreen, and NoteEditorScreen.
- **`src/lib/time.ts`** — Added `formatCreatedDate()` and `formatModifiedDate()` to match web/desktop date formatting (`Jan 1, 2026` and `Jan 1, 2026, 12:00 PM`).

### Components

- **`src/components/notes/MarkdownToolbar.tsx`** — Horizontal ScrollView with 8 formatting buttons (Bold, Italic, Heading, Link, List, Checkbox, Code, Quote). `keyboardShouldPersistTaps="always"` prevents keyboard dismissal on tap. Full-width styling with border separator.
- **`src/components/notes/TagInput.tsx`** — Inline tag management: tag chips with remove button, text input with autocomplete from existing tags (filtered, limited to 5 suggestions). Comma or Enter to add, Backspace to remove last tag.
- **`src/components/notes/DashboardNoteCard.tsx`** — Updated with `compact` prop for tile layout and `folderName` prop for resolved folder names.

### Hooks

- **`src/hooks/useAutoSave.ts`** — Debounced save hook (500ms default). Tracks `isSaving`/`isSaved`/`error` state. First save calls `createNote` then switches to `updateNote` via `onCreated` callback. `flush()` method for immediate save on navigation away.
- **`src/hooks/useNotes.ts`** — Added `useCreateNote()` mutation with cache invalidation for notes, dashboard, tags, and folders.

### API

- **`src/api/notes.ts`** — Added `createNote(body: CreateNoteRequest): Promise<Note>` — `POST /notes`.

### Screens

- **`src/screens/NoteEditorScreen.tsx`** — Full editor screen with create/edit mode based on `noteId` param. Layout: Status line (Saved/Created/Modified) → Title input → Folder button + Tags → Toolbar (full-width) → Content (monospace TextInput). Preview toggle and delete button in header right. Auto-save on title/content changes. Folder picker via reused FolderPicker bottom sheet (Keyboard.dismiss() on open). Tag add/remove saved immediately. Sends both `folder` name and `folderId` to API to keep denormalized field in sync.
- **`src/screens/NoteDetailScreen.tsx`** — Moved action icons to header right: Edit (pencil), Favorite (star), Copy Link (link icon). Overflow menu for Version History and Delete. Added `useFocusEffect` refetch for stale data. Status line format matches web. Folder resolved from `folderId` via folders list. Copy Link copies `https://ns.derekentringer.com/notes/<noteId>` to clipboard with haptic feedback.
- **`src/screens/NoteListScreen.tsx`** — Added FAB (floating action button) for creating new notes.
- **`src/screens/DashboardScreen.tsx`** — Replaced horizontal FlatLists with 2-column tile grid. Added FAB matching Notes page. Folder names resolved from `folderId` via folders list.

### Navigation

- **`src/navigation/types.ts`** — Added `NoteEditor: { noteId?: string }` to `DashboardStackParamList`.
- **`src/screens/NotesScreen.tsx`** — Added `NoteEditor` screen to Notes stack navigator.
- **`src/navigation/AppNavigator.tsx`** — Added `NoteEditor` screen to Dashboard stack navigator.

### Bug Fixes

- **Missing icons on Android** — Added `useFonts({ ...MaterialCommunityIcons.font })` to `App.tsx` with loading state.
- **Token refresh logout after ~15 minutes** — Added missing `X-Requested-With: XMLHttpRequest` header to `mobileTokenAdapter.ts`. The ns-api requires this for CSRF protection on `/auth/refresh`; without it, every refresh was rejected with 403.
- **Stale folder data** — NoteDetailScreen now uses `useFocusEffect` to refetch when returning from editor. Folder names resolved from `folderId` using folders list instead of relying on denormalized `note.folder` field.

### Tests (31 new tests, 2 new suites — all passing)

- **editorActions.test.ts** (20 tests) — toggleBold (wrap, insert, unwrap), toggleItalic (wrap, unwrap), insertHeading (add, cycle, remove, middle line), insertLink (selection, cursor), insertList (add, remove), insertCheckbox (add, remove), insertCode (inline, fence, unwrap), insertQuote (add, remove)
- **NoteEditorScreen.test.tsx** (11 tests) — create mode (new note, with folder/tags, error), edit mode (load, update content/title/tags/folder), delete (success, error), auto-save flow (create then update)

## Verification

1. `npx tsc --noEmit` — clean
2. `npm test` — 129/129 passing across 13 suites
3. FAB on note list → opens blank editor (create mode)
4. Type title and content → auto-saves after 500ms, "Saving..."/"Saved" indicator
5. Toolbar buttons insert correct markdown syntax at cursor/selection
6. Preview toggle shows rendered markdown
7. Assign folder via bottom sheet (keyboard dismisses)
8. Add/remove tags with autocomplete
9. Back button → returns to list, new note appears
10. Edit button on note detail → opens editor with existing content
11. Delete from editor → confirmation alert → navigates back
12. FAB on dashboard → opens blank editor
13. Dashboard tiles show folder names correctly
14. Copy link button copies note URL to clipboard
15. Token refresh works correctly (no ~15-minute logout)

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Create vs edit via `noteId` param | `NoteEditor: { noteId?: string }` — undefined = create, string = edit. Simple routing. |
| Auto-save with 500ms debounce | Timer resets on each keystroke. First save creates note, subsequent saves update. |
| Pure editor action functions | Decoupled from TextInput; testable; inspired by ns-web's `wrapSelection`. |
| Preview toggle (not split) | Mobile screen too narrow for split view. Header button toggles modes. |
| Folder picker reuse | Same `FolderPicker` bottom sheet from Feature 01; `Keyboard.dismiss()` added. |
| Send both `folder` + `folderId` to API | Keeps denormalized `folder` name field in sync in the database. |
| Resolve folder names from `folderId` | Matches ns-web pattern; avoids stale denormalized `note.folder` values. |
| Copy link instead of share content | Matches web/desktop "Copy link" behavior; uses `expo-clipboard`. |
| Tile grid on dashboard | 2-column `flexWrap` grid uses screen space better than horizontal scroll. |

## Key Patterns Reused

| Pattern | Source | Adaptation |
|---------|--------|------------|
| FolderPicker bottom sheet | Feature 01 `FolderPicker.tsx` | Reused directly for folder assignment |
| Markdown preview styles | `NoteDetailScreen.tsx` mdStyles | Same themed styles for editor preview |
| FAB button | Common mobile pattern | Consistent across NoteList and Dashboard |
| `useFocusEffect` refetch | React Navigation | Fixes stale cache when returning from editor |
| Token refresh adapter | `ns-web/webTokenAdapter.ts` | Added missing `X-Requested-With` header |
| Date formatting | ns-web date display | Matching `Created/Modified` format |

## What's Next

- Feature 03: Search & Organization — full-text search via SQLite FTS5, folder/tag browsing, trash
- Feature 04: Sync Engine — offline-first sync with SQLite ↔ ns-api
