# 04 — Version History

**Status:** Complete
**Phase:** 4 — UI Features
**Priority:** High

## Summary

Automatic version snapshots of notes on save, with a version list panel in a right-side sliding drawer, unified/split diff views, and two-step restore with success toast. Configurable snapshot interval (0–60 min) stored in localStorage. Matches the ns-web implementation for feature parity.

**Sync-ready design**: Schema includes an `origin` column (`'desktop'` or `'web'`) so the Phase 6 sync engine can merge version histories from both platforms without ambiguity. UUIDs prevent ID collisions.

## What Was Implemented

### SQLite Migration 005 (`src-tauri/migrations/005.sql`)

- `note_versions` table with `id`, `note_id`, `title`, `content`, `origin`, `created_at`
- Foreign key to `notes(id)` with `ON DELETE CASCADE` for automatic cleanup
- Composite index on `(note_id, created_at DESC)` for newest-first queries
- `origin` column defaults to `'desktop'`; `'web'` used for versions pulled from server during sync (Phase 6)
- Migration registered in `src-tauri/src/lib.rs` (version 5)

### Shared Type Update (`packages/ns-shared/src/types.ts`)

- Added `origin: string` to `NoteVersion` interface (e.g., `"desktop"`, `"web"`)
- Updated ns-api mapper (`packages/ns-api/src/lib/mappers.ts`) to set `origin: "web"` for server-created versions

### Database Functions (`src/lib/db.ts`)

- `NoteVersionRow` interface and `rowToNoteVersion` mapper — maps `note_id` → `noteId`, `created_at` → `createdAt`, `origin` → `origin`
- `captureVersion(noteId, title, content, intervalMinutes)` — creates snapshot if elapsed time exceeds interval; interval of 0 captures every save (skips cooldown check); inserts with `uuidv4()` ID and `origin = 'desktop'`; enforces 50-version cap by deleting oldest
- `listVersions(noteId)` — returns versions newest-first with total count
- `getVersion(versionId)` — returns single version or null
- `restoreVersion(noteId, versionId)` — gets version, updates note title + content via existing `updateNote()`, returns updated note; throws if version not found

### Diff Library (`src/lib/diff.ts`)

- Pure LCS-based line diff algorithm, no external dependencies
- Copied from `packages/ns-web/src/lib/diff.ts`
- Exports `DiffLine` interface (`{ type: "same" | "added" | "removed"; text: string }`) and `diffLines()` function

### VersionHistoryPanel (`src/components/VersionHistoryPanel.tsx`)

- Side panel showing timestamped version list with relative time formatting (5m ago, 2h ago, etc.)
- Calls `listVersions()` from `../lib/db.ts` directly (no API fetch — local SQLite)
- Clicking a version sets it as selected; selected version highlighted with primary background
- Empty state: "No versions yet"
- Loading state with spinner
- `cursor-pointer` on all version items

### DiffView (`src/components/DiffView.tsx`)

- Replaces editor when viewing a version
- Header layout: Unified/Split toggle, Restore button, Close button
- Unified view: full-width +/- lines with green/red backgrounds
- Split view: two columns (Version / Current) with matched lines
- Title diff shown at top when title changed
- Two-step restore: click Restore → Confirm/Cancel buttons appear
- Close button clears selected version and returns to editor
- `cursor-pointer` on all buttons

### Editor Settings (`src/hooks/useEditorSettings.ts`)

- Added `versionIntervalMinutes` to `EditorSettings` interface
- Default: 15, clamped to 0–60 range (0 = every save)
- Stored in localStorage (consistent with desktop's existing settings pattern)

### NotesPage Integration (`src/pages/NotesPage.tsx`)

- **Drawer state**: `drawerTab` ("history"), `drawerOpen`, `selectedVersion`, `successToast`
- **Drawer resize**: `useResizable` with `direction: "vertical"`, `initialSize: 300`, `min: 200`, `max: 500`, `invert: true`, persisted to `ns-drawer-width`
- **Version capture on save**: fire-and-forget `captureVersion()` call after `updateNote()` succeeds (same pattern as `syncNoteLinks`)
- **Sliding drawer**: fixed-position panel with `translateX` animation, matching web app's drawer pattern
- **Tab button**: clock icon positioned absolutely with `right-full` and `bottom: 38` (above backlinks panel); active state uses primary background; only shown when a note is selected and not in trash view
- **DiffView replaces editor**: when `selectedVersion` is set, DiffView renders instead of the editor/preview area
- **Version restore handler**: updates title, content, refs, notes list; clears selected version; shows "Version restored" success toast (auto-dismiss after 3s)
- **Clear version on note switch**: `setSelectedVersion(null)` in `selectNote()`
- **Success toast**: fixed bottom-right with dismiss button, `cursor-pointer` on interactive elements

## Tests

### `src/__tests__/diff.test.ts`
- 7 tests: identical text, added lines, removed lines, mixed changes, empty old text, empty new text, both empty

### `src/__tests__/VersionHistoryPanel.test.tsx`
- 5 tests: renders version list, empty state, selected highlighting, click callback, relative time formatting
- Mocks `listVersions` from `../lib/db.ts`

### `src/__tests__/DiffView.test.tsx`
- 7 tests: unified/split rendering, mode toggle, title diff visibility, two-step restore confirmation, close callback

### `src/__tests__/VersionHistory.test.ts`
- 11 tests for DB functions (mocked SQL plugin):
  - `captureVersion`: creates version, skips within interval, creates when interval exceeded, always captures at interval=0, enforces 50-version cap
  - `listVersions`: returns versions newest-first with total, empty list
  - `getVersion`: found and not found cases
  - `restoreVersion`: updates note title+content, throws when version not found

### `src/__tests__/useEditorSettings.test.ts` (updated)
- Added tests for `versionIntervalMinutes`: default (15), persistence, clamping below 0, clamping above 60, allows 0 (every save)

## Files Changed

| File | Action |
|------|--------|
| `packages/ns-shared/src/types.ts` | Edited — added `origin` to `NoteVersion` |
| `packages/ns-api/src/lib/mappers.ts` | Edited — added `origin: "web"` to `toNoteVersion` |
| `src-tauri/migrations/005.sql` | Created |
| `src-tauri/src/lib.rs` | Edited — registered migration 5 |
| `src/lib/db.ts` | Edited — added 5 functions + row mapper + constant |
| `src/lib/diff.ts` | Created |
| `src/components/VersionHistoryPanel.tsx` | Created |
| `src/components/DiffView.tsx` | Created |
| `src/hooks/useEditorSettings.ts` | Edited — added `versionIntervalMinutes` |
| `src/pages/NotesPage.tsx` | Edited — drawer, version capture, DiffView, restore, toast |
| `src/__tests__/diff.test.ts` | Created |
| `src/__tests__/VersionHistoryPanel.test.tsx` | Created |
| `src/__tests__/DiffView.test.tsx` | Created |
| `src/__tests__/VersionHistory.test.ts` | Created |
| `src/__tests__/useEditorSettings.test.ts` | Edited — added interval tests |

## Dependencies

- [01 — Note Editor](01-note-editor.md) — CodeMirror editor and save flow for triggering version captures
- [02 — Search & Organization](02-search-and-organization.md) — notes with titles stored in SQLite

## Deferred

- **Version sync** — versions are local-only until Phase 6 sync engine; `origin` column is ready for merge
- **Settings UI** — version interval is configurable via `useEditorSettings` but has no dedicated settings page control yet (deferred to Phase 5: Settings & Preferences)
- **Word-level diff** — currently line-level only; word-level highlighting deferred
- **Pagination** — all versions loaded at once (max 50 per note); pagination not needed at this scale
