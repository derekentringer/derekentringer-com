# 28 — External Delete Handling

**Status:** Planned
**Priority:** High
**Depends on:** [27 — Directory Watching](27-directory-watching.md)

## Summary

When a file is deleted from a managed directory outside of NoteSync, the corresponding note should be removed from the database rather than left as an orphan with a "missing" status. The filesystem is the source of truth for locally-managed notes — if the file is gone, the note is gone.

## Current State

- When a watched file is deleted, the watcher fires and `handleFileDeleted` sets the note's `LocalFileStatus` to `"missing"` and stops the watcher
- The note remains in the database and sidebar with a red indicator dot
- The user must manually decide what to do (unlink, delete, etc.)
- There is no automatic cleanup

## Requirements

### Behavior for Notes in Managed Directories

When a file deletion is detected (via directory watcher or startup reconciliation) for a note that belongs to a managed directory:

1. **Soft-delete the note** from SQLite (set `is_deleted = 1`, `deleted_at` = now)
2. **Enqueue a sync delete** so the deletion propagates to the server and other devices
3. **Close the tab** if the note is currently open
4. **Show a toast notification**: "Note '{title}' removed — file deleted from disk" with an **Undo** action (30-second window)
5. **Undo**: restores the note in SQLite, re-creates the file on disk from the database content (including frontmatter), and re-establishes tracking

### Behavior for Individually-Linked Notes (Not in a Managed Directory)

Notes linked to individual files (not inside a managed directory) retain the current behavior:

- Status set to "missing"
- Red indicator in sidebar and tab bar
- User manually decides: unlink, re-link to a new path, or delete

This distinction exists because individually-linked files are more likely to have been accidentally moved or temporarily unavailable, whereas files in a managed directory being deleted is a deliberate filesystem action.

### Bulk Delete Handling

When multiple files are deleted at once (e.g., deleting a subdirectory in Finder, `git clean`, emptying a folder):

- Process deletions as a batch
- Show a single summary toast: "12 notes removed — folder deleted from disk" with **Undo All** action
- Undo restores all notes and recreates all files

### Startup Reconciliation

During the startup scan (feature 27), files that are in SQLite but no longer on disk:

- Same soft-delete behavior as runtime detection
- Toast notification summarizing removals: "3 notes removed since last session — files no longer on disk"
- Undo available for 30 seconds after the notification

## Edge Cases

- **File deleted then immediately recreated** (e.g., some editors do delete + write on save): The debounce window (200ms from feature 27) should absorb this — if the file reappears within the debounce window, no deletion is processed
- **File moved to Trash (macOS)**: FSEvents reports this as a delete. The note is soft-deleted. If the user restores the file from Trash, the startup reconciliation detects the file again and the directory watcher picks it up as a "new" file (feature 27 auto-indexing) — it should re-link to the existing soft-deleted note if the frontmatter matches (same note ID or title + date)
- **Managed directory itself deleted**: All notes inside are soft-deleted. The managed directory entry is marked as invalid. Show a prominent notification. Remove the directory from managed list on user confirmation.

## Data Model Changes

None — uses existing soft-delete (`is_deleted`, `deleted_at`) and sync queue infrastructure.

## Dependencies

- [27 — Directory Watching](27-directory-watching.md) — deletion events come from directory watchers
- [26 — Frontmatter Support](26-frontmatter-support.md) — undo recreates files with frontmatter intact

## Testing

- File deleted in Finder → note soft-deleted, toast shown, tab closed
- Undo within 30 seconds → note restored, file recreated with correct content and frontmatter
- Undo after 30 seconds → no longer available
- Bulk delete (directory removed) → batch toast, undo all works
- File deleted while app closed → detected on startup, toast shown
- Individually-linked note deletion → retains current "missing" behavior
- File delete + recreate within debounce window → no deletion processed
- Managed directory itself deleted → all notes removed, directory unmanaged
