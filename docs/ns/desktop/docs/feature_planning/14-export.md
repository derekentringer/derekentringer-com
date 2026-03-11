# 14 — Export

**Status:** Complete
**Phase:** 8 — External Sources
**Priority:** Low

## Summary

Export notes in multiple formats with folder structure preservation. Supports individual note export and bulk folder export. Matches the ns-web export functionality for feature parity.

## Requirements

- **Export formats**:
  - Markdown (.md) — raw note content as-is
  - Text (.txt) — plain text export
  - PDF — rendered markdown exported as PDF
  - ZIP — multiple notes with folder structure preserved
- **Export triggers**:
  - Right-click context menu on a note: "Export" with format submenu
  - Right-click context menu on a folder: "Export as ZIP" (exports all notes in the folder with structure)
- **File naming**:
  - Sanitized note title as filename (strip control characters, enforce max length)
  - Folder structure preserved in ZIP exports (e.g., `work/meeting-notes.md`)
- **Single note export**:
  - Save dialog with format selection
  - Default filename: sanitized note title with appropriate extension
- **Bulk folder export**:
  - Export all notes in a folder (and subfolders) as a ZIP archive
  - Preserve nested folder structure inside the ZIP

## Technical Considerations

- Tauri's `dialog` plugin for native save-file dialog
- Tauri's `fs` plugin for writing exported files
- ZIP generation: use a JavaScript library (e.g., `jszip`) or Rust-side ZIP creation
- PDF generation: render markdown to HTML, then use a PDF library (e.g., `html2pdf.js` or Tauri's print-to-PDF)
- File sanitization: replace invalid filename characters, truncate at OS limits

## Dependencies

- [01 — Note Editor](01-note-editor.md) — needs notes with content to export
- [02 — Search & Organization](02-search-and-organization.md) — needs folder structure for ZIP exports

## Open Questions

- Should PDF export include custom styling (matching the app's theme)?
- Should export include note metadata (tags, created/updated dates) as frontmatter in markdown?
- Export location: always prompt with save dialog, or allow a default export directory in settings?
