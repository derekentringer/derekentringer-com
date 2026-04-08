# 37 — Import from Competitors

**Status:** Planned
**Phase:** Phase 2 — Paid Tier Foundation
**Priority:** Medium

## Summary

Reduce switching friction by supporting import from popular note apps. The existing markdown folder import covers basic cases, but dedicated importers handle the specific export formats of each competitor.

## Import Sources

### Obsidian Vault

- **Format:** Folder of .md files with `[[wiki-links]]`, YAML frontmatter, attachments subfolder
- **What to preserve:** Note content, folder structure, wiki-links (already compatible), tags (from frontmatter), images/attachments
- **Implementation:** Mostly works with existing folder import. Add frontmatter tag extraction, attachment file handling.
- **Effort:** Low

### Notion Export

- **Format:** ZIP of markdown + CSV files. Nested folders. Inline images as separate files. Database pages as CSV.
- **What to preserve:** Note content, folder structure, images (re-upload to R2)
- **Challenges:** Notion markdown has UUID suffixes on filenames, inline image references need remapping
- **Implementation:** Unzip, strip UUID suffixes from titles, remap image references, upload images, create notes
- **Effort:** Medium

### Bear Export

- **Format:** ZIP of .md files. Tags as `#tag` inline (not frontmatter). Images embedded as Bear-specific references.
- **What to preserve:** Note content, tags (extract from `#tag` syntax), images
- **Implementation:** Parse `#tag` from content, convert to NoteSync tags, handle Bear image references
- **Effort:** Medium

### Apple Notes Export

- **Format:** No native export. Third-party tools export as HTML or markdown.
- **Implementation:** Accept HTML and convert to markdown (use turndown or similar)
- **Effort:** Medium

### Standard Notes Export

- **Format:** JSON/ZIP with encrypted notes (user provides password to decrypt)
- **What to preserve:** Note content, tags
- **Implementation:** Decrypt with user password, extract content, create notes with tags
- **Effort:** Medium-High

### Evernote Export

- **Format:** ENEX (XML-based). Notes as HTML with embedded attachments.
- **What to preserve:** Note content (convert HTML to markdown), tags, attachments
- **Implementation:** Parse ENEX XML, convert HTML to markdown, extract attachments, upload to R2
- **Effort:** High

## User Flow

1. Settings → Import → Choose source
2. Upload export file (ZIP, ENEX, JSON) or select folder (Obsidian vault)
3. Preview: show count of notes, folders, tags, images to be imported
4. Confirm → import with progress indicator
5. Notes appear in an "Imported" folder (or preserve original folder structure)

## Priority Order

1. Obsidian (largest target audience, lowest effort)
2. Notion (very popular, medium effort)
3. Bear (Apple users, medium effort)
4. Standard Notes (privacy crowd, same target market)
5. Evernote (declining but still has users)
6. Apple Notes (everyone has it, but export is hard)

## Verification

- Import 100+ note Obsidian vault with folders, tags, wiki-links, images
- Import Notion export with nested pages and images
- All imported notes are searchable
- Wiki-links between imported notes work
- Images display correctly after import
- Tags are preserved
- No data loss compared to source
