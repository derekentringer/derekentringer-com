# 29 — Rename and Move Detection

**Status:** Planned
**Priority:** High
**Depends on:** [26 — Frontmatter Support](26-frontmatter-support.md), [27 — Directory Watching](27-directory-watching.md), [28 — External Delete Handling](28-external-delete-handling.md)

## Summary

When a file is renamed or moved within a managed directory outside of NoteSync, detect that it's the same note rather than treating it as a delete + new file. Update the note's `local_path` and (if moved to a different subdirectory) its `folderId` to match the new filesystem location.

## Current State

- A file rename/move fires as two watcher events: delete at the old path + create at the new path
- The delete sets the note to "missing" status (feature 28 will soft-delete it)
- The create is invisible because NoteSync only watches known files, not directories
- Result: the user loses the note's version history, backlinks, and embeddings, and gets an orphaned "missing" note plus an untracked file

## Requirements

### Rename/Move Detection Strategy

File system APIs do not provide a native "rename" event that links old and new paths. The detection relies on correlating a delete event with a subsequent create event within a short time window:

1. When a **delete** event fires for a tracked file, don't immediately process it. Instead, hold it in a pending-delete buffer with a timestamp.
2. When a **create** event fires for a new supported file, check the pending-delete buffer for a match:
   - **Match by frontmatter**: Parse the new file's frontmatter. If it contains the same `title` + `date` combination (or a NoteSync note ID if we add one to frontmatter) as a pending-delete note, it's a rename/move.
   - **Match by content hash**: If frontmatter doesn't match (e.g., file has no frontmatter), compare the content hash of the new file against the pending-delete note's `local_file_hash`. Same hash = same file.
3. **Buffer timeout**: If a pending-delete has no matching create within 500ms, process it as a real deletion (feature 28).
4. **On match**: Cancel the pending delete. Update the note's `local_path` to the new file path. Update `folderId` if the parent directory changed (feature 30). Enqueue a sync action.

### NoteSync-Initiated Renames

When the user renames a note in the NoteSync UI (changes the title):

- If the note is locally-managed, update the frontmatter `title` field
- Optionally rename the file on disk to match the new title (configurable in Settings: "Rename local files when note title changes" — default off)
- If renaming the file, suppress the watcher event to avoid a feedback loop

### NoteSync-Initiated Moves

When the user moves a note to a different folder in the NoteSync UI:

- If the note is locally-managed, move the file on disk to the corresponding subdirectory (feature 30 handles the folder ↔ directory mapping)
- Suppress the watcher event
- Update `local_path` in SQLite

### What's Preserved on Rename/Move Detection

When a rename/move is successfully detected, the following are preserved:

- Note ID (same database row)
- Version history
- Backlinks (wiki-links pointing to this note)
- Embeddings
- Sync history
- Tags and all frontmatter metadata
- Favorite status and sort order

## Edge Cases

- **Rapid successive renames**: User renames a file multiple times quickly. Each rename is a delete + create pair. The buffer should handle chained renames by matching each create against the most recent pending delete.
- **Rename + edit simultaneously**: Some editors rename a file and immediately write new content. The content hash won't match, but frontmatter should still match. Frontmatter matching takes priority over hash matching.
- **File moved outside managed directory**: Treated as a delete (the new location is outside NoteSync's watch scope). The note is soft-deleted per feature 28. If the file is moved back in, it's detected as a new file and auto-indexed.
- **Two files with identical content**: Hash-based matching could falsely link a delete to the wrong create. Frontmatter matching (which includes title and date) is checked first and is more specific. If both files have identical frontmatter, fall back to proximity heuristic (same parent directory preferred).
- **Batch rename** (e.g., a script renaming many files): The buffer handles multiple pending deletes simultaneously. Each create is checked against all pending deletes. Matches are resolved greedily (first match wins).

## Technical Considerations

- **Buffer implementation**: In-memory `Map<string, { noteId, hash, metadata, timestamp }>` keyed by old path. Entries expire after 500ms via `setTimeout`.
- **Frontmatter note ID**: Consider adding a `notesync_id` field to frontmatter during feature 26. This would make rename detection near-perfect — no ambiguity. However, this is NoteSync-specific metadata that other tools would ignore. Decision: add it, but don't require it for detection (graceful degradation for files without it).
- **File path update in sync**: `local_path` is desktop-only and doesn't sync. Only `folderId` changes (from a move) need to sync.

## Data Model Changes

None — uses existing `local_path` column and `folderId` on notes. The pending-delete buffer is in-memory only.

## Settings

- "Rename local files when note title changes" — boolean, default off. When on, changing a note's title in NoteSync renames the file on disk to match (`sanitized-title.md`).
- Visible in Settings → Local Directories section (feature 27)

## Dependencies

- [26 — Frontmatter Support](26-frontmatter-support.md) — frontmatter metadata used for matching
- [27 — Directory Watching](27-directory-watching.md) — directory watcher provides create/delete events
- [28 — External Delete Handling](28-external-delete-handling.md) — unmatched deletes fall through to deletion handling
- [30 — Folder Structure Mirroring](30-folder-structure-mirroring.md) — moves between subdirectories update `folderId`

## Testing

- File renamed in Finder → note's `local_path` updated, history/backlinks preserved
- File moved to subdirectory → `local_path` and `folderId` updated
- File moved outside managed directory → treated as delete
- Rename detection via frontmatter match (content changed)
- Rename detection via content hash match (no frontmatter)
- Buffer timeout → unmatched delete processed as deletion
- Rapid successive renames handled correctly
- Batch rename (script renaming 10 files) → all correctly re-linked
- NoteSync title change → file renamed on disk (when setting enabled)
- NoteSync folder move → file moved on disk
- Watcher suppression on NoteSync-initiated rename/move
