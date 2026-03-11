# 11 — File Drag-and-Drop Import

**Status:** Complete
**Phase:** 8 — External Sources
**Priority:** Low

## Summary

Drag-and-drop file import for NoteSync desktop. Users can drag `.md`, `.txt`, or `.markdown` files directly into the editor area to import them as notes. Includes a visual drag overlay, import progress indicator, and folder-aware imports that preserve directory structure.

## What Was Built

### Import Utilities (`src/lib/importExport.ts`)
- `isSupportedFile(filename)` — validates file extension (`.md`, `.txt`, `.markdown`)
- `titleFromFilename(filename)` — strips extension to derive note title
- `sanitizeFilename(name)` — replaces invalid filesystem characters
- `readFileAsText(file)` — FileReader wrapper returning file content as text
- `parseFileList(files)` — filters supported files, extracts `webkitRelativePath` segments
- `extractFolderPaths(entries)` — derives unique folder paths sorted by depth
- `ensureFolderHierarchy(paths, existingFolders, createFolderFn)` — creates missing folders preserving nesting
- `importFiles(entries, targetFolderId, folders, createNoteFn, createFolderFn, onProgress)` — main import orchestrator

### Drag-and-Drop UI (`src/pages/NotesPage.tsx`)
- `handleDragOver` — validates `Files` type, sets drop effect to `copy`, shows overlay
- `handleDragLeave` — hides overlay (ignores child element transitions via `contains` check)
- `handleFileDrop` — processes dropped files, triggers import
- `handleImportFiles` — parses files, creates notes in active folder, opens last imported note as tab, shows success/error toasts
- Drag overlay: translucent background with dashed border and "Drop files to import" text (z-40)
- Progress toast: fixed bottom-right with file counter, current filename, and animated progress bar

### Tauri Configuration
- Set `dragDropEnabled: false` in `src-tauri/tauri.conf.json` window config to allow HTML5 drag events to reach the webview (Tauri's native DnD interceptor was preventing standard drag events)

## Bug Fix (Web)

Fixed a bug in `ns-web/src/pages/NotesPage.tsx` where dragging a file into the web app imported the note but didn't open a tab for it. Changed `selectNote(lastCreatedNote)` → `openNoteAsTab(lastCreatedNote)` to match the behavior of `handleCreate`.

## Test Coverage

26 tests in `src/__tests__/importExport.test.ts`:
- `isSupportedFile` — 6 tests (accepts .md/.txt/.markdown, case insensitive, rejects unsupported/no extension)
- `titleFromFilename` — 5 tests (strips extensions, handles multiple dots, no-extension passthrough)
- `sanitizeFilename` — 3 tests (replaces invalid chars, empty → "Untitled", preserves valid names)
- `parseFileList` — 3 tests (filters supported files, flat path segments, webkitRelativePath parsing)
- `extractFolderPaths` — 2 tests (unique depth-sorted paths, empty for flat files)
- `ensureFolderHierarchy` — 3 tests (reuses existing, creates missing, nested parent resolution)
- `importFiles` — 4 tests (correct note data, progress callback, error handling, directory folder mapping)

## Dependencies

- [00 — Project Scaffolding](00-project-scaffolding.md) — Tauri app shell and SQLite database
- [02 — Search & Organization](02-search-and-organization.md) — Folder structure for directory imports
- [06 — Editor Tabs](06-editor-tabs.md) — `openNoteAsTab` for post-import tab creation

## Files Changed

| File | Action |
|------|--------|
| `ns-desktop/src/lib/importExport.ts` | Created — import utilities |
| `ns-desktop/src/pages/NotesPage.tsx` | Modified — drag handlers, overlay, progress UI |
| `ns-desktop/src-tauri/tauri.conf.json` | Modified — `dragDropEnabled: false` |
| `ns-desktop/src/__tests__/importExport.test.ts` | Created — 26 tests |
| `ns-web/src/pages/NotesPage.tsx` | Modified — `selectNote` → `openNoteAsTab` bug fix |
