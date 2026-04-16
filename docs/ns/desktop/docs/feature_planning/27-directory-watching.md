# 27 — Directory Watching

**Status:** Planned
**Priority:** High
**Depends on:** [26 — Frontmatter Support](26-frontmatter-support.md)

## Summary

Upgrade local file management from per-file watchers to recursive directory watchers. When a user imports a folder with "Keep Local," NoteSync watches the entire directory tree and automatically detects new files, so that files added outside NoteSync are indexed without manual import.

This is the foundation for gaps 28–30 (external delete handling, rename detection, folder mirroring) — all require knowing what's happening at the directory level, not just on individual known files.

## Current State

- `localFileService.ts` watches individual files via `startWatching(noteId, path, ...)`
- Watchers are keyed by `noteId` — only files NoteSync already knows about are monitored
- New files appearing in a mapped directory via Finder, VS Code, or `git pull` are invisible to NoteSync
- `collectFilePaths(paths)` exists for recursively expanding directories on import, but only runs once at import time

## Requirements

### Managed Directories

- When a user imports a folder with "Keep Local," the folder path is registered as a **managed directory**
- Managed directory paths are persisted in SQLite (new `managed_directories` table) so they survive app restart
- Each managed directory has: `id`, `path`, `created_at`
- A managed directory can be removed (unmanaged) from Settings or context menu, which stops watching and unlinks all notes in that directory

### Recursive Directory Watcher

- Establish a single recursive watcher per managed directory using Tauri's `watch()` with `recursive: true`
- The watcher detects:
  - **File created**: new `.md`/`.txt`/`.markdown` file appears → auto-index (see below)
  - **File modified**: existing tracked file changed → existing external change handling (unchanged)
  - **File deleted**: tracked file removed → handled by [28 — External Delete Handling](28-external-delete-handling.md)
  - **File renamed/moved**: tracked file path changed → handled by [29 — Rename and Move Detection](29-rename-move-detection.md)
  - **Directory created**: new subfolder appears → handled by [30 — Folder Structure Mirroring](30-folder-structure-mirroring.md)
  - **Directory deleted**: subfolder removed → handled by [30 — Folder Structure Mirroring](30-folder-structure-mirroring.md)
- Filter events to supported extensions only (`.md`, `.txt`, `.markdown`)
- Ignore hidden files and directories (starting with `.`)
- Ignore common non-content directories (`.git`, `node_modules`, `.obsidian`, etc.)

### Auto-Indexing New Files

When a new supported file is detected in a managed directory:

1. Check `findNoteByLocalPath(path)` — if already tracked, skip (duplicate)
2. Read file content
3. Parse frontmatter (feature 26) to extract title, tags, dates, etc.
4. Create a note in SQLite with `isLocalFile: true`, `local_path`, `local_file_hash`
5. Assign `folderId` based on the file's parent directory relative to the managed directory root (feature 30)
6. Update FTS5 index
7. Queue embedding generation if semantic search is enabled
8. Enqueue sync action to push the new note to the server
9. If the file has no frontmatter, inject a minimal block (`title` derived from filename, `date` from file creation time)

### Startup Reconciliation

On app launch, for each managed directory:

1. Recursively scan the directory for all supported files
2. Compare against known `local_path` values in SQLite
3. **New files** (on disk but not in SQLite): auto-index as above
4. **Missing files** (in SQLite but not on disk): mark as missing (feature 28)
5. **Changed files** (hash mismatch): trigger existing external change handling
6. Re-establish the recursive directory watcher

This ensures the database stays in sync even if files were added/removed while the app was closed.

### Migration from Per-File Watchers

- Existing per-file watchers for notes inside managed directories are replaced by the directory watcher
- Notes linked to individual files outside any managed directory continue to use per-file watchers (unchanged behavior)
- `localFileService.ts` retains both capabilities: `startDirectoryWatching(dirPath, callbacks)` and the existing `startWatching(noteId, filePath, ...)`

## Technical Considerations

- **Watcher event batching**: File system events can arrive in bursts (e.g., `git pull` updating many files). Batch events with a short debounce (~200ms) before processing to avoid redundant database writes
- **Ignore patterns**: Configurable list of directories/patterns to ignore (`.git`, `node_modules`, `.obsidian`, `.DS_Store`, `Thumbs.db`). Stored in Settings, with sensible defaults
- **File size limit**: Same 5MB limit applies to auto-indexed files. Files exceeding the limit are ignored with a console warning
- **Large directories**: Initial scan of a directory with thousands of files needs progress indication and should be async/chunked to avoid blocking the UI
- **Watcher reliability**: Tauri's `watch()` uses native OS APIs (FSEvents on macOS, ReadDirectoryChanges on Windows). The existing 30-second poll backup should also scan managed directories, not just individual files
- **Nested managed directories**: Prevent registering a directory that is inside an already-managed directory (or vice versa) to avoid duplicate events

## Data Model Changes

### SQLite (new table)

```sql
CREATE TABLE managed_directories (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Settings UI

- New section in Settings: "Local Directories"
- Lists all managed directories with path and file count
- "Add Directory" button opens folder picker
- "Remove" button per directory (stops watching, prompts: unlink notes or keep as database notes)

## Constraints

- Desktop only — web and mobile do not have filesystem access
- Managed directories must be local filesystem paths (not network drives, cloud-synced folders)
- Maximum managed directories: no hard limit, but warn at > 10 (watcher resource usage)

## Dependencies

- [15 — Local File Support](../features/15-local-file-support.md) — existing per-file watcher infrastructure
- [26 — Frontmatter Support](26-frontmatter-support.md) — new files parsed for metadata on auto-index

## Testing

- New file added to managed directory → auto-indexed with correct metadata
- File added while app is closed → detected on startup reconciliation
- Nested subdirectory files detected
- Hidden files and ignored directories filtered out
- Duplicate detection (same file not indexed twice)
- File exceeding size limit ignored gracefully
- Managed directory removed → watchers stopped
- Multiple managed directories work independently
- Watcher survives app backgrounding and foregrounding
- Burst of file changes (e.g., git checkout) handled without race conditions
