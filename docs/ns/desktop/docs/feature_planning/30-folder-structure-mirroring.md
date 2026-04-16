# 30 — Folder Structure Mirroring

**Status:** Planned
**Priority:** High
**Depends on:** [27 — Directory Watching](27-directory-watching.md)

## Summary

Bidirectional sync between the filesystem directory structure inside managed directories and NoteSync's folder tree. Creating a subdirectory in Finder creates a folder in NoteSync. Creating a folder in NoteSync creates a subdirectory on disk. Moving files between subdirectories updates `folderId`. The filesystem and NoteSync's folder hierarchy stay in agreement.

## Current State

- NoteSync's folder tree is entirely database-driven (`folders` table with `parent_id` adjacency list)
- Local files have a `local_path` but the parent directory of that path is not mapped to a NoteSync folder
- If a user creates subdirectories in a managed folder via Finder, NoteSync's folder tree doesn't reflect them
- If a user moves a file between subdirectories on disk, the note's `folderId` doesn't update
- The folder tree and filesystem can drift apart silently

## Requirements

### Directory → Folder (Filesystem to NoteSync)

When the directory watcher detects changes in a managed directory's structure:

**New subdirectory created:**
1. Create a corresponding folder in SQLite with `name` matching the directory name
2. Set `parent_id` based on the directory's position relative to the managed directory root
3. Enqueue a sync action to push the new folder to the server
4. Nested subdirectories handled recursively

**Subdirectory deleted:**
1. Soft-delete the corresponding NoteSync folder
2. Notes inside are handled by [28 — External Delete Handling](28-external-delete-handling.md) (files are gone)
3. Enqueue sync delete for the folder

**Subdirectory renamed:**
1. Update the NoteSync folder's `name` to match the new directory name
2. Detected via the rename buffer from [29 — Rename and Move Detection](29-rename-move-detection.md) (applied to directories, not just files)
3. Enqueue sync update

### Folder → Directory (NoteSync to Filesystem)

When the user makes folder changes in the NoteSync UI:

**New folder created (inside a managed directory's tree):**
1. Create the corresponding subdirectory on disk
2. Suppress the watcher event

**Folder deleted:**
1. Move or delete the corresponding subdirectory on disk
2. If the folder contains files, prompt the user: "Delete directory and files?" or "Move files to parent directory?"
3. Suppress watcher events

**Folder renamed:**
1. Rename the corresponding subdirectory on disk
2. Update `local_path` for all notes inside the folder (paths changed)
3. Suppress watcher events

**Folder moved (reparented):**
1. Move the corresponding subdirectory on disk
2. Update `local_path` for all notes inside (paths changed)
3. Suppress watcher events

### Path ↔ Folder Mapping

The managed directory root maps to a top-level NoteSync folder (or the root of the folder tree, configurable at import time). Subdirectories map to child folders:

```
/Users/me/notes/           ← managed directory root → NoteSync folder "notes" (or root)
/Users/me/notes/work/      → NoteSync folder "work" (child of root)
/Users/me/notes/work/q2/   → NoteSync folder "q2" (child of "work")
/Users/me/notes/personal/  → NoteSync folder "personal" (child of root)
```

The mapping is derived from the relative path between the file/directory and the managed directory root. No explicit mapping table is needed — the directory structure *is* the mapping.

### File ↔ Folder Assignment

When a file's parent directory maps to a NoteSync folder, the note's `folderId` should match:

- On auto-index (feature 27): set `folderId` based on the file's parent directory
- On file move detection (feature 29): update `folderId` to match the new parent directory
- On NoteSync folder move: move the file on disk to the corresponding new directory

### Initial Import of a Directory

When a user imports a folder with "Keep Local":

1. Recursively scan the directory tree
2. Create NoteSync folders mirroring each subdirectory
3. Import each supported file as a note with `folderId` matching its parent directory's folder
4. Establish the recursive directory watcher
5. Show progress (file count, current file) for large directories

### Startup Reconciliation

On app launch, for each managed directory:

1. Scan the directory tree and compare against NoteSync's folder tree
2. **New directories** (on disk but no folder in SQLite): create folders
3. **Missing directories** (in SQLite but not on disk): soft-delete folders
4. **Renamed directories**: detect via the rename buffer heuristic (same parent, similar timing)
5. Reconcile note `folderId` assignments: if a file's parent directory maps to a different folder than the note's current `folderId`, update the note

## Edge Cases

- **Empty directories**: Create corresponding NoteSync folders even if they contain no supported files. The user may intend to add files later.
- **Deeply nested directories**: No depth limit, but warn if nesting exceeds 10 levels (unusual and likely unintentional)
- **Directory names with special characters**: NoteSync folder names are freeform strings, so no restrictions. The filesystem path is stored separately.
- **Conflicting folder names**: If a managed directory contains a subdirectory named "work" and NoteSync already has a folder named "work" (from another source), the import should link to the existing folder if it's at the same tree position, or create a new one if not
- **Managed directory root**: The root directory itself can map to either a new top-level folder named after the directory, or the NoteSync root (user chooses at import time)
- **Symlinks in directory tree**: Follow symlinks for files (index the target), but do not follow directory symlinks (could create cycles). Log a warning for directory symlinks.

## Data Model Changes

### managed_directories table (from feature 27)

Already includes `path`. Add:

```sql
ALTER TABLE managed_directories ADD COLUMN root_folder_id TEXT;
```

`root_folder_id` links the managed directory to its corresponding NoteSync root folder. This anchors the path ↔ folder mapping.

### Utility Functions

Add to `db.ts`:

- `findFolderByManagedPath(managedDirId, relativePath)` → folder ID or null
- `createFolderForDirectory(managedDirId, relativePath, name)` → new folder ID
- `getRelativePath(managedDirPath, filePath)` → relative path string
- `resolveNoteFolder(managedDirId, filePath)` → folder ID for a file based on its parent directory

## Dependencies

- [27 — Directory Watching](27-directory-watching.md) — directory create/delete/rename events
- [28 — External Delete Handling](28-external-delete-handling.md) — files in deleted directories
- [29 — Rename and Move Detection](29-rename-move-detection.md) — directory rename detection uses same buffer strategy

## Testing

- New subdirectory in Finder → NoteSync folder created
- Subdirectory deleted in Finder → NoteSync folder soft-deleted
- Subdirectory renamed in Finder → NoteSync folder renamed
- NoteSync folder created → subdirectory created on disk
- NoteSync folder deleted → subdirectory removed (with prompt if non-empty)
- NoteSync folder renamed → subdirectory renamed, all note paths updated
- File moved between subdirectories → note `folderId` updated
- Initial import of nested directory tree → correct folder hierarchy
- Startup reconciliation detects directory additions and removals
- Deeply nested directories handled correctly
- Empty directories create folders
- Managed directory root maps to correct NoteSync folder
- Symlinks: file symlinks followed, directory symlinks ignored
