# 01 — .txt Import

**Status:** Not Started
**Phase:** 2 — Notes Core
**Priority:** High

## Summary

One-time migration wizard that imports existing `.txt` files from a local directory into the local SQLite database as markdown notes.

## Requirements

- Import wizard UI:
  - "Select Folder" button that opens the native OS file picker (Tauri dialog API)
  - Recursively scan the selected directory for `.txt` files
  - Display a preview list of all found files with:
    - File name (becomes note title)
    - File path (shown for context)
    - File size
    - Preview of first few lines
  - Checkbox to select/deselect individual files
  - "Select All" / "Deselect All" controls
  - "Import Selected" button
- Import behavior:
  - File name (without `.txt` extension) becomes the note title
  - File content becomes the note body (raw text is valid markdown)
  - Directory structure becomes folder assignments (e.g., `notes/work/meeting.txt` → folder: `work`)
  - Preserve original file creation/modification dates as `createdAt`/`updatedAt` if available
  - Generate UUID for each imported note
  - Set `syncStatus` to `pending` for all imported notes
- Progress indicator during import (file count / total)
- Summary screen after import: "Imported X notes into Y folders"
- Error handling: skip files that can't be read, report them at the end

## Technical Considerations

- Tauri's `dialog` plugin for native folder picker
- Tauri's `fs` plugin for reading file contents and metadata
- File reading happens in Rust (Tauri backend), passed to React frontend via Tauri commands
- Batch SQLite inserts for performance (wrap in a transaction)
- Large files: consider a reasonable size limit (e.g., 10MB per file) with a warning
- Character encoding: assume UTF-8; warn on files that fail to decode
- This is a one-time operation — no file watcher or ongoing sync with the file system

## Dependencies

- [00 — Project Scaffolding](00-project-scaffolding.md) — needs Tauri app shell and SQLite database

## Open Questions

- Should subdirectory names automatically become folders/tags, or should the user map them manually during import?
- Maximum file size before warning?
- Should duplicate detection (same title + content) prevent re-importing files already in the database?
