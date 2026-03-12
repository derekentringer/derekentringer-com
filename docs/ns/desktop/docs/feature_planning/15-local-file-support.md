# 15 — Local File Support

**Status:** Complete — see [features/15-local-file-support.md](../features/15-local-file-support.md)
**Phase:** 10 — Local File Support
**Priority:** Low

## Summary

Link notes to local `.md`/`.txt`/`.markdown` files with bidirectional sync. When a note is linked to a local file, edits in the NoteSync editor write back to the file on disk, and external changes to the file are detected and reflected in the editor. Linked notes continue to sync to the cloud via the existing sync engine, enabling cross-device access with conflict awareness.

## Requirements

### Import Flow

- **Drag-drop and Import Button** trigger a choice dialog instead of immediately importing:
  - **Import to NoteSync** — existing behavior; copies file content into a cloud-only note, no ongoing file link
  - **Keep Local** — creates a note linked to the original file path; ongoing bidirectional sync between the editor and the file on disk
- Choice dialog shows the file name, path, and size for context
- "Keep Local" stores the file path and a content hash for change detection

### Save Flow (Three-Write Save)

- When saving a linked note, three writes happen in order:
  1. **File** — write updated content to the local file on disk
  2. **SQLite** — persist the note content and updated hash to the local database
  3. **Sync** — push the change to the server via the existing sync engine
- If the file write fails (e.g., file moved, permissions error), surface an error toast and do not proceed with SQLite/sync writes
- Auto-save and manual save (Cmd/Ctrl+S) both use the three-write flow for linked notes

### File Watcher with Write Suppression

- Establish a file system watcher (Tauri `fs` watch or `notify` crate) on each linked file path
- **Write suppression**: when the app itself writes to the file (step 1 of three-write save), suppress the resulting file watcher event to avoid a feedback loop
- **Poll backup**: as a fallback for unreliable watcher events, poll linked files every 30 seconds by comparing content hashes
- Watchers are established on app startup and when a new file is linked

### External Change Detection

- When an external change is detected (file modified outside NoteSync):
  - **Clean buffer** (no unsaved editor changes): silently reload the file content into the editor and update SQLite
  - **Dirty buffer** (unsaved editor changes in progress): show a dialog:
    - "File changed externally. Keep your edits or load the external changes?"
    - Options: **Keep Mine** / **Load External** / **View Diff**
    - "View Diff" opens the diff view (see below) before choosing

### Missing File Detection

- On startup and periodically (every 30s poll cycle), check that each linked file still exists at its stored path
- **Missing file indicators**:
  - Red warning icon on the note in the sidebar note list
  - Red banner in the editor area: "Linked file not found at {path}"
  - Tooltip with the last known file path
- **Save As prompt**: when attempting to save a note whose linked file is missing, prompt a native save dialog to re-establish the file link at a new (or same) location
- User can also choose to **Unlink** the note (convert it back to cloud-only)

### Cross-Device Cloud Sync

- The `isLocalFile` boolean syncs to the server so web and other devices know the note is file-linked
- `local_path` and `local_file_hash` are desktop-only fields in SQLite (not synced to server)
- **Web edits**: when the note is edited on the web, the server `updatedAt` advances; on the desktop, the sync engine detects `cloud_newer`
- **Cloud newer detection**: when the desktop pulls a cloud-newer version for a linked note:
  - If the local file content matches the local SQLite content (no local drift): auto-apply the cloud version to both SQLite and the local file
  - If the local file has drifted from SQLite (edited externally while offline): show a diff dialog letting the user choose which version to keep or merge manually

### Diff View

- Side-by-side (split) or unified diff view for comparing two versions of a note
- Uses `diffLines()` (from a diff library like `diff` or `jsdiff`) for line-level comparison
- Diff view is triggered from:
  - External change dialog ("View Diff" option)
  - Cloud newer detection dialog for linked notes
- Color coding: green for additions, red for deletions, gray for unchanged context lines
- User can toggle between unified and split view modes

### Delete Flow

- When deleting a linked note, show a choice dialog:
  - **Delete from NoteSync** — removes the note from SQLite and the server; leaves the local file on disk untouched
  - **Delete Completely** — removes the note from SQLite and the server, and also deletes the local file from disk
- Default selection: "Delete from NoteSync" (safer option)

### Unlink Local File

- Right-click context menu option: "Unlink Local File"
- Converts the note back to a cloud-only note:
  - Removes the file watcher
  - Clears `local_path` and `local_file_hash` from SQLite
  - Sets `isLocalFile` to `false` and syncs the change to the server
  - Note content is preserved in SQLite and cloud as-is
- The local file on disk is left untouched

### Server-Side Changes

- `isLocalFile` boolean field on the Note model (syncs across devices)
- Web app shows a subtle indicator (e.g., small icon or badge) on notes where `isLocalFile` is `true`, so the user knows the note is locally linked on another device
- `local_path` and `local_file_hash` are not part of the API schema — desktop-only SQLite columns

### Startup Behavior

- On app launch:
  1. Query all linked notes from SQLite (where `local_path` is set)
  2. Re-check each file path: mark missing files with red indicators
  3. Re-establish file watchers on all existing linked files
  4. Compare file hashes to detect changes that occurred while the app was closed
  5. For changed files with clean buffers, silently update SQLite and sync
  6. For changed files where cloud is also newer, show diff dialog

## Constraints

- **File size limit**: 5MB maximum for linked files; larger files are rejected with a toast message
- **Supported extensions**: `.md`, `.txt`, `.markdown` only
- **Poll interval**: 30-second backup polling cycle for linked file change detection
- **No recursive folder linking**: only individual files can be linked (folder import uses the existing import flow)
- **Single device per file**: a local file path is meaningful only on the device where it was linked; other devices see the note as cloud-only with an `isLocalFile` indicator

## Technical Considerations

- **File watcher**: Tauri's `fs` plugin watch API or the Rust `notify` crate via a Tauri command; must handle macOS FSEvents, Windows ReadDirectoryChanges, and Linux inotify
- **Write suppression**: maintain a set of "expected write" timestamps or content hashes; ignore watcher events that match a recent app-initiated write
- **Content hashing**: SHA-256 hash of file content for efficient change detection without reading the full file into diff
- **SQLite schema**: add `local_path TEXT`, `local_file_hash TEXT`, and `is_local_file INTEGER DEFAULT 0` columns to the notes table (new migration)
- **Prisma schema**: add `isLocalFile Boolean @default(false)` to the Note model on ns-api
- **Diff library**: `diff` npm package (`diffLines()` function) for line-level diff computation
- **Dialog components**: reuse existing dialog/modal patterns from the app for choice dialogs and diff view

## Dependencies

- [01 — Note Editor](../features/01-note-editor.md) — editor integration for content reload and dirty buffer detection
- [09 — Sync Engine](../features/09-sync-engine.md) — three-write save extends existing sync push; cloud newer detection for linked notes
- [11 — File Drag-and-Drop Import](../features/11-file-drag-and-drop-import.md) — import flow modified to show choice dialog
- [14 — Import Button + Export](../features/14-import-export.md) — import button flow modified to show choice dialog

## Open Questions

- Should the app support re-linking a note to a different file path (move/rename detection)?
- Should there be a "Linked Files" section in Settings showing all linked paths and their statuses?
- Should the diff view support manual merge (editing both sides) or only whole-version selection?
- Should the poll interval be configurable in Settings?
- How should symlinks be handled — follow them or reject them?
