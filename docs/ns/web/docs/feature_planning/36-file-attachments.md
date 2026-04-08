# 36 — PDF & File Attachments

**Status:** Planned
**Phase:** Phase 2 — Paid Tier Foundation
**Priority:** Medium

## Summary

Currently only images can be attached to notes. Add support for PDFs, documents, spreadsheets, and other files. Users expect to attach reference material to their notes.

## Supported File Types

| Category | Extensions | Preview in note? |
|---|---|---|
| PDF | .pdf | Inline preview (first page thumbnail + link) |
| Documents | .doc, .docx, .txt, .rtf | Download link with icon |
| Spreadsheets | .xls, .xlsx, .csv | Download link with icon |
| Presentations | .ppt, .pptx | Download link with icon |
| Archives | .zip, .tar.gz | Download link with icon |
| Audio | .mp3, .wav, .m4a | Inline audio player |
| Video | .mp4, .webm | Download link (too large for inline) |

## Implementation

### Storage

- Same Cloudflare R2 bucket as images
- Key format: `{attachmentId}.{ext}`
- Separate `Attachment` model (or extend existing `Image` model)
- File size limits: 10MB free, 50MB personal, 100MB pro (per file)
- Total storage limits per tier (see feature plan 34)

### API

- `POST /attachments/upload` — multipart upload, MIME validation
- `GET /attachments/:id` — redirect to R2 public URL
- `DELETE /attachments/:id` — soft delete

### Markdown Syntax

Attachments render as special links in markdown:
```markdown
[document.pdf](https://files.newname.com/abc123.pdf)
```

The preview renderer detects file extensions and renders appropriate icons/players instead of plain links.

### Drag & Drop

Extend the existing `imageUploadExtension` in CodeMirror to handle non-image files. On drop/paste:
- Images: existing behavior (inline `![](url)`)
- PDFs/files: insert as `[filename](url)`

## Verification

- Drag PDF into editor → uploads and inserts link
- Preview shows PDF icon with filename
- Click downloads the file
- Audio files show inline player
- File size limits enforced per tier
- Storage quota tracked and displayed in settings
