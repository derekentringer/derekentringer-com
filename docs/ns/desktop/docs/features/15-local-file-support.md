# 15 — Local File Support

**Status:** Complete
**Phase:** 10 — Local File Support
**Priority:** Low
**Completed:** v1.76.0

## Summary

Link notes to local `.md`/`.txt`/`.markdown` files with bidirectional sync. When a note is linked to a local file, edits in the NoteSync editor write back to the file on disk, and external changes to the file are detected and reflected in the editor. Linked notes continue to sync to the cloud via the existing sync engine, enabling cross-device access with conflict awareness.

---

## What Was Implemented

### 1. Data Model Changes

**Shared types** (`packages/ns-shared/src/types.ts`):
- Added `isLocalFile: boolean` to `Note` interface
- Added `isLocalFile?: boolean` to `UpdateNoteRequest` interface

**Server** (`packages/ns-api`):
- Prisma schema: `isLocalFile Boolean @default(false)` on Note model
- Migration `20260312000000_add_is_local_file` adds column
- Migration `20260312100000_fix_folder_unique_indexes` fixes folder unique indexes to exclude soft-deleted rows and include `userId` in root-level constraint
- `toNote()` mapper includes `isLocalFile`
- Sync routes pass `isLocalFile` through in push create/update
- Notes routes allow `isLocalFile` in PATCH and POST bodies

**Desktop SQLite** (`packages/ns-desktop`):
- Migration `009.sql`: adds `is_local_file INTEGER`, `local_path TEXT`, `local_file_hash TEXT` columns to notes table
- `NoteRow` type extended with local file fields
- `rowToNote()` maps `is_local_file` to `isLocalFile` boolean

### 2. Desktop Database Functions

**File**: `packages/ns-desktop/src/lib/db.ts`

New functions for local file management:
- `linkNoteToLocalFile(noteId, localPath, localFileHash)` — sets `is_local_file=1`, `local_path`, `local_file_hash` + enqueues sync
- `unlinkLocalFile(noteId)` — clears local file fields, sets `is_local_file=0` + enqueues sync
- `updateLocalFileHash(noteId, hash)` — updates stored content hash
- `fetchLocalFileNotes()` — returns all notes with `is_local_file=1` and `local_path` set
- `findNoteByLocalPath(path)` — finds existing note linked to a path (duplicate detection)
- `getNoteLocalPath(noteId)` — returns `local_path` for a note
- `getNoteLocalFileHash(noteId)` — returns `local_file_hash` for a note

Updated existing functions:
- `createNote()` supports `is_local_file` in INSERT
- `updateNote()` supports `isLocalFile` in SET clauses
- `upsertNoteFromRemote()` preserves `local_path` and `local_file_hash` (desktop-only fields) while syncing `is_local_file` from server

### 3. Tauri Infrastructure

**Rust dependencies** (`Cargo.toml`):
- `tauri-plugin-fs` with `watch` feature
- `tauri-plugin-dialog`

**Plugin registration** (`lib.rs`):
- `.plugin(tauri_plugin_fs::init())`
- `.plugin(tauri_plugin_dialog::init())`

**Capabilities** (`default.json`):
- File system permissions: read, write, exists, stat, remove, watch, unwatch, read-dir
- Dialog permissions: open, save
- Broad `fs:scope` with `["**"]` for re-establishing watchers on restart

**NPM dependencies** (`package.json`):
- `@tauri-apps/plugin-fs`
- `@tauri-apps/plugin-dialog`

### 4. Local File Service

**File**: `packages/ns-desktop/src/lib/localFileService.ts` (Created)

Encapsulates all filesystem operations:

**Core operations** (via `@tauri-apps/plugin-fs`):
- `readLocalFile(path)` — reads file content
- `writeLocalFile(path, content)` — writes with suppression, returns SHA-256 hash
- `computeContentHash(content)` — SHA-256 via Web Crypto API
- `fileExists(path)`, `getFileStat(path)`, `isDirectory(path)`, `validateFileSize(size)`
- `deleteLocalFile(path)` — removes file from disk

**File picker dialogs** (via `@tauri-apps/plugin-dialog`):
- `pickLocalFiles()` — multi-select file picker filtered to `.md/.txt/.markdown`
- `pickSaveLocation(defaultName)` — save dialog for "Save As" flow

**Dropped path expansion**:
- `collectFilePaths(paths)` — recursively expands directories, filters to supported extensions

**File watching**:
- `startWatching(noteId, path, onExternalChange, onFileDeleted)` — establishes watcher per note
- `stopWatching(noteId)`, `stopAllWatchers()` — cleanup

**Write suppression**: Before writing, the path is added to a `suppressedPaths` Set. After write + 100ms delay, it's removed. Watcher callbacks check suppression to ignore app-initiated writes.

**Startup**:
- `reestablishWatchers(localFileNotes, onExternalChange, onFileDeleted)` — re-checks files, re-establishes watchers, returns status per note

**Poll backup**:
- `startPollTimer()` / `stopPollTimer()` — 30-second fallback polling with hash comparison

### 5. Sync Engine Modifications

**File**: `packages/ns-desktop/src/lib/syncEngine.ts`

- Extended `SyncEngineCallbacks` with `onLocalFileCloudUpdate?: (noteId: string) => void` and `onNoteRemoteDeleted?: (noteId: string) => void`
- In pull flow `applyNoteChange()`: after `upsertNoteFromRemote()`, checks if note has a local file link and the file exists on disk; if content hash changed, fires `onLocalFileCloudUpdate` callback
- Skips `onLocalFileCloudUpdate` when local file is missing — prevents overriding "missing" status with "cloud_newer"
- On remote delete: fires `onNoteRemoteDeleted` callback to close open tabs
- Push flow: parses `SyncPushResponse` and throws on `rejected > 0` to preserve queue entries for retry
- Cleanup in `destroySyncEngine()` for new callbacks

### 6. UI Components

**ImportChoiceDialog** (`packages/ns-desktop/src/components/ImportChoiceDialog.tsx`):
- Shown on drag-drop or Import Button file selection
- Two options: "Import to NoteSync" (copies content) vs "Keep Local" (links file)
- Displays file count in title

**LocalFileDeleteDialog** (`packages/ns-desktop/src/components/LocalFileDeleteDialog.tsx`):
- Shown when deleting a local file note
- "Delete from NoteSync" (soft-delete, leave file) vs "Delete Completely" (soft-delete + delete file)

**ExternalChangeDialog** (`packages/ns-desktop/src/components/ExternalChangeDialog.tsx`):
- Shown when dirty buffer + external file change detected
- Options: Reload / Keep Mine / View Diff

**LocalFileDiffView** (`packages/ns-desktop/src/components/LocalFileDiffView.tsx`):
- Side-by-side or unified diff view using `diffLines()` from `lib/diff.ts`
- Toggle between unified/split modes
- "Save to File" / "Use Local Version" action buttons

**NoteList modifications** (`packages/ns-desktop/src/components/NoteList.tsx`):
- Status dot indicator after note title:
  - Green (`bg-green-500`): in sync
  - Amber (`bg-amber-500`): cloud newer or external change
  - Red (`bg-red-500`): missing/moved
- Context menu items (conditional on note type):
  - "Save As Local File" (cloud-only notes)
  - "Unlink Local File" (local file notes)
  - "Save to File" (when cloud_newer)
  - "Use Local Version" (when external_change)
  - "View Diff" (when cloud_newer or external_change)

**TabBar modifications** (`packages/ns-desktop/src/components/TabBar.tsx`):
- Extended `Tab` interface with `isLocalFile?` and `localFileStatus?`
- Red warning triangle (`▲`) for missing file status

### 7. NotesPage Integration

**File**: `packages/ns-desktop/src/pages/NotesPage.tsx`

**State**:
- `localFileStatuses: Map<string, LocalFileStatus>` — per-note file status
- `lastProcessedHashRef: Map<string, string>` — in-memory hash dedup for watcher events
- Dialog state for ImportChoiceDialog, LocalFileDeleteDialog, ExternalChangeDialog, LocalFileDiffView

**Import flow**:
- Drag-drop and Import Button show ImportChoiceDialog
- "Import to NoteSync" — existing copy behavior
- "Keep Local": validates size (5MB), reads file, checks duplicates via `findNoteByLocalPath`, creates note with `isLocalFile=true`, links via `linkNoteToLocalFile`, starts watcher, opens tab
- Duplicate detection: if file already linked, re-enqueues sync for the existing note + folder and switches to its tab

**Three-write save** (in `handleSave`):
- After SQLite write: if note has `local_path` and file exists, writes to file → updates hash → sets "synced"
- If file missing: sets "missing" status, saves to cloud only

**File watcher lifecycle**:
- Startup: `fetchLocalFileNotes()` → `reestablishWatchers()` → update statuses → `startPollTimer()`
- Unmount: `stopAllWatchers()`, `stopPollTimer()`

**External change handling** (with hash dedup):
- `lastProcessedHashRef` prevents duplicate processing of same file content (macOS FSEvents fires multiple events)
- Clean buffer: silent auto-reload → updateNote → set "synced"
- Dirty buffer: show ExternalChangeDialog
- File deleted: set "missing", stop watcher

**Context menu handlers**:
- Save As Local File: `pickSaveLocation` → `writeLocalFile` → `linkNoteToLocalFile` → `startWatching`
- Unlink Local File: `stopWatching` → `unlinkLocalFile` → update note
- Save to File: write SQLite content to file → set "synced"
- Use Local Version: read file → update note → set "synced"
- View Diff: read both versions → show LocalFileDiffView

**Delete flow**:
- Local file notes show LocalFileDeleteDialog
- "Delete from NoteSync": stop watcher → soft delete (file untouched)
- "Delete Completely": stop watcher → soft delete → delete file from disk

**Remote delete tab closing**:
- `closeDeletedNoteTabRef` handles sync engine delete callback
- Removes tab, selects next available tab

**Sync callback**:
- `onLocalFileCloudUpdate`: sets status to "cloud_newer" (only when file exists on disk)

### 8. Web App Changes

**NoteList** (`packages/ns-web/src/components/NoteList.tsx`):
- Shows muted file icon indicator with tooltip "Linked to a local file" for notes where `isLocalFile` is true

**NotesPage** (`packages/ns-web/src/pages/NotesPage.tsx`):
- Info bar in editor area: "This note is linked to a local file on a desktop device"
- `closeDeletedNoteTabsRef`: checks all open tabs via `fetchNote` API — 404 means deleted, closes those tabs
- Uses functional state updaters to avoid stale closure issues in SSE handlers

**offlineNotes** (`packages/ns-web/src/api/offlineNotes.ts`):
- `isLocalFile` included in offline cache serialization

## Bug Fixes During Implementation

- **Sync push rejection handling**: `pushChanges()` now parses `SyncPushResponse` and throws when `rejected > 0`, preserving queue entries for retry instead of silently dropping them
- **Folder unique constraint**: Fixed `folders_root_name_key` and `folders_userId_parentId_name_key` indexes to include `userId` and exclude soft-deleted rows (`WHERE deletedAt IS NULL`)
- **External change dialog false positives**: Added `lastProcessedHashRef` in-memory hash cache to prevent race conditions where watcher fires after write suppression window expires
- **Duplicate toast messages**: Same hash dedup prevents processing the same file content twice from macOS FSEvents
- **Missing file status override**: Sync engine skips `onLocalFileCloudUpdate` when local file doesn't exist, preventing "missing" status from being overridden with "cloud_newer"
- **Web tab not closing on remote delete**: Fixed stale closure bug using `setOpenTabs` and `setSelectedId` functional updaters

## Files Changed

### New Files

| File | Description |
|------|-------------|
| `packages/ns-api/prisma/migrations/20260312000000_add_is_local_file/migration.sql` | Add `isLocalFile` column |
| `packages/ns-api/prisma/migrations/20260312100000_fix_folder_unique_indexes/migration.sql` | Fix folder unique indexes |
| `packages/ns-desktop/src-tauri/migrations/009.sql` | Desktop SQLite migration for local file fields |
| `packages/ns-desktop/src/lib/localFileService.ts` | File system operations library |
| `packages/ns-desktop/src/components/ImportChoiceDialog.tsx` | Import choice dialog |
| `packages/ns-desktop/src/components/LocalFileDeleteDialog.tsx` | Delete choice dialog |
| `packages/ns-desktop/src/components/ExternalChangeDialog.tsx` | External change dialog |
| `packages/ns-desktop/src/components/LocalFileDiffView.tsx` | Diff view component |
| `packages/ns-desktop/src/__tests__/ImportChoiceDialog.test.tsx` | 10 tests |
| `packages/ns-desktop/src/__tests__/LocalFileDeleteDialog.test.tsx` | 9 tests |
| `packages/ns-desktop/src/__tests__/ExternalChangeDialog.test.tsx` | 9 tests |
| `packages/ns-desktop/src/__tests__/LocalFileDiffView.test.tsx` | 10 tests |
| `packages/ns-desktop/src/__tests__/localFileService.test.ts` | 20 tests |

### Modified Files

| File | Changes |
|------|---------|
| `packages/ns-shared/src/types.ts` | `isLocalFile` on Note + UpdateNoteRequest |
| `packages/ns-api/prisma/schema.prisma` | `isLocalFile` field on Note model |
| `packages/ns-api/src/lib/mappers.ts` | Map `isLocalFile` in `toNote()` |
| `packages/ns-api/src/routes/sync.ts` | Pass `isLocalFile` in push handler |
| `packages/ns-api/src/routes/notes.ts` | Allow `isLocalFile` in create/update |
| `packages/ns-desktop/src-tauri/Cargo.toml` | Added fs + dialog plugin deps |
| `packages/ns-desktop/src-tauri/Cargo.lock` | Lock file updates |
| `packages/ns-desktop/src-tauri/src/lib.rs` | Migration 9, plugin registration |
| `packages/ns-desktop/src-tauri/capabilities/default.json` | fs + dialog permissions |
| `packages/ns-desktop/src-tauri/tauri.conf.json` | Version bump |
| `packages/ns-desktop/package.json` | Added @tauri-apps/plugin-fs, @tauri-apps/plugin-dialog |
| `packages/ns-desktop/src/lib/db.ts` | NoteRow, rowToNote, 7 new local file functions |
| `packages/ns-desktop/src/lib/syncEngine.ts` | Extended callbacks, cloud_newer + missing file detection, rejection handling |
| `packages/ns-desktop/src/components/NoteList.tsx` | Status dots, context menu items, new callback props |
| `packages/ns-desktop/src/components/TabBar.tsx` | Local file fields, missing file triangle |
| `packages/ns-desktop/src/pages/NotesPage.tsx` | Full integration: import flow, save flow, watchers, dialogs, context menus |
| `packages/ns-web/src/components/NoteList.tsx` | Local file indicator |
| `packages/ns-web/src/pages/NotesPage.tsx` | Info bar, tab closing on remote delete |
| `packages/ns-web/src/api/offlineNotes.ts` | `isLocalFile` in offline cache |

## Tests

| Test File | Tests |
|-----------|-------|
| `packages/ns-desktop/src/__tests__/localFileService.test.ts` | 20 tests — hash consistency, size validation, write suppression, watcher management |
| `packages/ns-desktop/src/__tests__/ImportChoiceDialog.test.tsx` | 10 tests — render, callbacks, cancel |
| `packages/ns-desktop/src/__tests__/LocalFileDeleteDialog.test.tsx` | 9 tests — render, callbacks, cancel |
| `packages/ns-desktop/src/__tests__/ExternalChangeDialog.test.tsx` | 9 tests — render, callbacks, cancel |
| `packages/ns-desktop/src/__tests__/LocalFileDiffView.test.tsx` | 10 tests — render diff, toggle modes, action buttons |
| `packages/ns-desktop/src/__tests__/NoteList.test.tsx` | +354 lines — local file indicator dots, context menu items |
| `packages/ns-desktop/src/__tests__/TabBar.test.tsx` | +60 lines — missing file indicator |
| `packages/ns-desktop/src/__tests__/TrashView.test.tsx` | +43 lines — trash view with local file notes |

## Dependencies

- [01 — Note Editor](01-note-editor.md) — editor integration for content reload and dirty buffer detection
- [09 — Sync Engine](09-sync-engine.md) — three-write save extends existing sync push; cloud newer detection
- [11 — File Drag-and-Drop Import](11-file-drag-and-drop-import.md) — import flow modified to show choice dialog
- [14 — Import Button + Export](14-import-export.md) — import button flow modified to show choice dialog
