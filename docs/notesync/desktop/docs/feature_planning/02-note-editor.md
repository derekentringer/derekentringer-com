# 02 — Note Editor

**Status:** Not Started
**Phase:** 2 — Notes Core
**Priority:** High

## Summary

Markdown-based note editor using CodeMirror 6 with syntax highlighting, auto-save to local SQLite, and an optional split-pane preview. Supports full CRUD operations on notes.

## Requirements

- **Editor**:
  - CodeMirror 6 with markdown language support (`@codemirror/lang-markdown`)
  - Syntax highlighting for markdown elements (headings, bold, italic, code blocks, links, lists)
  - Line numbers (toggleable)
  - Word wrap
  - Keyboard shortcuts for common markdown formatting (Ctrl+B bold, Ctrl+I italic, etc.)
  - Optional split-pane mode: editor on left, rendered markdown preview on right (using `react-markdown`)
  - Toggle between editor-only, split-pane, and preview-only modes
- **Note CRUD**:
  - Create new note: opens a blank editor with auto-generated title ("Untitled Note") and cursor in the content area
  - Edit existing note: opens the note's markdown content in the editor
  - Delete note: soft delete (sets `deletedAt` timestamp); confirmation dialog before delete
  - Rename note title inline (click title to edit)
- **Auto-save**:
  - Debounced auto-save to local SQLite (500ms after last keystroke)
  - Visual save indicator ("Saved" / "Saving..." / "Unsaved changes")
  - Set `syncStatus` to `modified` on save (triggers sync when online)
  - Update `updatedAt` timestamp on every save
- **Note metadata**:
  - Title, folder, tags displayed above the editor
  - Created/updated timestamps shown in a footer or info panel
  - Tag editing: add/remove tags inline
  - Folder assignment: dropdown or move-to dialog
- **Note list**:
  - Sidebar list of all notes, grouped by folder
  - Click to open in editor
  - Show title, folder, last modified date
  - Visual indicator for unsaved/unsynced notes

## Technical Considerations

- CodeMirror 6 is framework-agnostic; use `@uiw/react-codemirror` or a thin React wrapper around `EditorView`
- Markdown preview via `react-markdown` with `remark-gfm` for GitHub Flavored Markdown (tables, strikethrough, task lists)
- Auto-save writes to SQLite via Tauri commands (Rust backend)
- Debounce implementation: `setTimeout` in the CodeMirror `updateListener` extension
- Split-pane layout: CSS flexbox with draggable divider for resizing
- Notes stored as raw markdown strings in the `content` column
- Consider syntax highlighting theme that matches the app's dark/light mode

## Dependencies

- [00 — Project Scaffolding](00-project-scaffolding.md) — needs Tauri app shell and SQLite database

## Open Questions

- Default mode: editor-only or split-pane?
- Should the editor support image embedding (drag-and-drop images into markdown)?
- Code block syntax highlighting in preview (e.g., `highlight.js` or `prism.js`)?
