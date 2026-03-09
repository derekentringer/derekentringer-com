# 11 — File Import

**Status:** Not Started
**Phase:** 8 — External Sources
**Priority:** Low

## Summary

Import wizard that imports existing text and markdown files from local directories into the local SQLite database as notes. Supports individual file selection and folder import with directory structure preserved.

## Requirements

- **Import methods**:
  - "Import Files" — native OS file picker for individual files (Tauri dialog API)
  - "Import Folder" — native OS folder picker to import all supported files recursively
- **Supported formats**:
  - `.txt` — plain text files
  - `.md` — markdown files
  - `.markdown` — markdown files (alternate extension)
  - File extension validation before import
- **Import wizard UI**:
  - Display a preview list of all found files with:
    - File name (becomes note title)
    - File path (shown for context)
    - File size
    - Preview of first few lines
  - Checkbox to select/deselect individual files
  - "Select All" / "Deselect All" controls
  - "Import Selected" button
- **Import behavior**:
  - File name (without extension) becomes the note title
  - File content becomes the note body (raw text / markdown)
  - Directory structure becomes folder assignments (e.g., `notes/work/meeting.txt` → folder: `work`), auto-creating nested folders as needed
  - Preserve original file creation/modification dates as `createdAt`/`updatedAt` if available
  - Generate UUID for each imported note
  - Set `syncStatus` to `pending` for all imported notes
- **Progress & results**:
  - Progress indicator during import (file count / total)
  - Summary screen after import: "Imported X notes into Y folders"
  - Error handling: skip files that can't be read, report success/failure counts at the end

## Technical Considerations

- Tauri's `dialog` plugin for native folder picker
- Tauri's `fs` plugin for reading file contents and metadata
- File reading happens in Rust (Tauri backend), passed to React frontend via Tauri commands
- Batch SQLite inserts for performance (wrap in a transaction)
- Large files: consider a reasonable size limit (e.g., 10MB per file) with a warning
- Character encoding: assume UTF-8; warn on files that fail to decode
- This is a one-time operation — no file watcher or ongoing sync with the file system

## Dependencies

- [00 — Project Scaffolding](../features/00-project-scaffolding.md) — needs Tauri app shell and SQLite database

## Open Questions

- Should subdirectory names automatically become folders/tags, or should the user map them manually during import?
- Maximum file size before warning?
- Should duplicate detection (same title + content) prevent re-importing files already in the database?
