# 14 — Import Button + Export

**Status:** Complete
**Phase:** 8 — External Sources
**Priority:** Low

## Summary

Import button with file/folder picker and export functionality for notes and folders. Achieves import/export feature parity with ns-web.

## What Was Built

### Import Button
- `ImportButton` component in sidebar footer with upload icon (w-7 h-7)
- Dropdown menu opening upward with "Import Files" and "Import Folder" options
- "Import Files" triggers hidden file input accepting `.md`, `.txt`, `.markdown`
- "Import Folder" triggers hidden directory input (`webkitdirectory`)
- Click-outside detection to close dropdown

### Export Functions
- **Export as .md** — downloads note content as markdown file
- **Export as .txt** — downloads note content as plain text file
- **Export as .pdf** — opens print window with styled HTML (Helvetica Neue, 800px max-width, print-optimized CSS)
- **Export as .zip** — JSZip archive with folder structure preserved, deduplicated filenames

### Context Menus
- Right-click note → "Export as .md", "Export as .txt", "Export as .pdf" (before Favorite/Delete)
- Right-click folder → "Export as .zip" (before Favorite, after Move to Root)

## Dependencies Added

- `jszip` — ZIP archive generation for folder export
- `marked` — Markdown-to-HTML conversion for PDF export (lazy-loaded via dynamic import)

## Tests

- `importExport.test.ts` — 29 tests (existing import tests + new export tests for text download and PDF print window)
- `ImportButton.test.tsx` — 4 tests (render, dropdown open, file input trigger, click-outside close)

## Files Changed

| File | Change |
|------|--------|
| `packages/ns-desktop/package.json` | Added `jszip` + `marked` dependencies |
| `packages/ns-desktop/src/lib/importExport.ts` | Added export functions (md, txt, pdf, zip) + helpers |
| `packages/ns-desktop/src/components/ImportButton.tsx` | New component |
| `packages/ns-desktop/src/components/NoteList.tsx` | Added `onExportNote` prop + 3 context menu items |
| `packages/ns-desktop/src/components/FolderTree.tsx` | Added `onExportFolder` prop + context menu item |
| `packages/ns-desktop/src/pages/NotesPage.tsx` | Wired ImportButton, export handlers, passed props |
| `packages/ns-desktop/src/__tests__/importExport.test.ts` | Added export tests |
| `packages/ns-desktop/src/__tests__/ImportButton.test.tsx` | New test file |
