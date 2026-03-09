# 03 — Note Linking + Backlinks

**Status:** Not Started
**Phase:** 4 — UI Features
**Priority:** High

## Summary

Wiki-link syntax (`[[note title]]`) for connecting notes, with CodeMirror autocomplete, a backlinks panel showing incoming references, and deep-linking to specific notes. Matches the ns-web implementation for feature parity.

## Requirements

- **Wiki-link syntax**:
  - `[[note title]]` syntax in markdown for linking to other notes
  - Case-insensitive title resolution
  - CodeMirror autocomplete triggered on `[[` — suggests matching note titles
  - Clicking a wiki-link navigates to the linked note
  - Visual distinction for resolved (existing) vs. broken (no matching note) links
- **Backlinks panel**:
  - Collapsible panel below the editor showing notes that link to the current note
  - Each backlink shows note title and a snippet of surrounding context
  - Click a backlink to navigate to the referencing note
  - Flash-free navigation (no flicker when jumping between linked notes)
- **Deep-linking**:
  - Notes addressable by ID for direct navigation
  - Copy-link button with clipboard feedback for sharing note references
- **NoteLink model**:
  - SQLite table tracking source → target note relationships
  - Cascade delete when a note is removed
  - Links updated on note save (parse content for `[[...]]` patterns)

## Technical Considerations

- Reuse the same wiki-link parsing logic from ns-web (`[[note title]]` regex)
- CodeMirror decoration for wiki-links: custom `WidgetDecoration` or `MarkDecoration` with click handler
- Backlinks query: `SELECT * FROM note_links WHERE target_id = ?` joined with notes for title/snippet
- Links parsed and stored on every save — replace all existing links for the note, then insert new ones
- Autocomplete: fetch all note titles on editor mount, filter client-side for performance

## Dependencies

- [01 — Note Editor](01-note-editor.md) — needs the CodeMirror editor for wiki-link syntax and autocomplete
- [02 — Search & Organization](02-search-and-organization.md) — needs notes with titles for link resolution

## Open Questions

- Should broken links auto-create a new note when clicked?
- Should backlinks update in real-time as other notes are edited, or only on panel refresh?
