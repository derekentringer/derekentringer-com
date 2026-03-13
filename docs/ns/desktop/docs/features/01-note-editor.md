# 01 — Note Editor

**Status:** Complete
**Phase:** 2 — Notes Core
**Priority:** High

## Summary

Markdown-based note editor using CodeMirror 6 with syntax highlighting, auto-save to local SQLite, and an optional split-pane preview. Supports full CRUD operations on notes.

## What Was Implemented

### SQLite Migration 002

- Added columns to `notes` table for future phases: `tags`, `summary`, `favorite`, `sort_order`, `deleted_at`, `sync_status`
- Migration applied automatically on app launch via Tauri SQL plugin
- Defensive INSERT: only writes migration-001 columns, then re-reads row to get migration-002 defaults

### SQLite CRUD Layer (`src/lib/db.ts`)

- Singleton `Database.load("sqlite:notesync.db")` connection
- `fetchNotes()` — non-deleted notes ordered by `updated_at DESC`
- `fetchNoteById(id)` — single note lookup
- `createNote(data)` — generates UUID, inserts row, returns full Note
- `updateNote(id, data)` — dynamic parameterized query for partial updates
- `softDeleteNote(id)` — sets `is_deleted = 1` and `deleted_at` timestamp
- `hardDeleteNote(id)` — permanent deletion
- Maps snake_case SQLite rows to camelCase `Note` type from `@derekentringer/ns-shared`
- Tauri capabilities configured: `sql:allow-execute`, `sql:allow-select`

### CodeMirror 6 Markdown Editor (`src/components/MarkdownEditor.tsx`)

- `forwardRef` with imperative handle: `focus()`, `insertBold()`, `insertItalic()`
- 4 Compartments for dynamic reconfiguration: theme, lineNumbers, wordWrap, tabSize
- Dark and light theme factories with accent color support
- Syntax highlighting styles matching app theme (headings, bold, italic, links, code)
- Keyboard shortcuts: `Mod-s` (save), `Mod-b` (bold), `Mod-i` (italic), `indentWithTab`
- External value sync via `useEffect` comparing doc content
- `onChange` callback fires on EditorView dispatch

### Markdown Preview (`src/components/MarkdownPreview.tsx`)

- `react-markdown` with `remark-gfm` for GitHub Flavored Markdown
- Styled via `.markdown-preview` CSS classes in `global.css`
- Headings, code blocks, blockquotes, tables, lists, links, horizontal rules, images, checkboxes
- Interactive checkboxes: GFM task list checkboxes are clickable in preview and split modes; toggling updates the underlying markdown and triggers autosave; DOM-based index lookup for reliable identification; disabled in trash view; `onContentChange` prop with `toggleCheckbox` utility (`src/lib/toggleCheckbox.ts`)

### Editor Toolbar (`src/components/EditorToolbar.tsx`)

- View mode toggle: Editor / Split / Preview
- Formatting buttons: Bold (B), Italic (I), Line Numbers (#)
- Formatting buttons hidden in preview-only mode
- Exports `ViewMode` type

### Note List (`src/components/NoteList.tsx`)

- Scrollable list of notes with title display
- Click to select a note
- Active note highlighted with accent background
- Right-click context menu with "Delete" option
- Confirm dialog before deletion (via `ConfirmDialog` component)

### Notes Page (`src/pages/NotesPage.tsx`)

- Layout: `[Sidebar | ResizeDivider | Editor/Preview area]`
- State management: notes array, selected note, title/content, view mode, save status
- Auto-save with configurable debounce timer
- Save indicator: "Saving..." / "Unsaved" / "Saved"
- Inline two-step delete confirmation in toolbar status bar
- Title input with focus-to-clear "Untitled" and blur-to-restore behavior
- Error toast at bottom-right with dismiss button
- Sidebar with smooth width transition

### Supporting Components

- **ConfirmDialog** — Modal overlay with Cancel/Delete buttons
- **ResizeDivider** — Draggable divider for resizable panels (sidebar + split view)
- **NsLogo** — SVG logo with configurable className

### Hooks

- **useEditorSettings** — localStorage-persisted editor preferences (theme, view mode, font size, tab size, word wrap, line numbers, auto-save delay, accent color)
- **useResizable** — PointerEvent-based drag resize with localStorage persistence and min/max clamping

### Theming

- Dark/light/system theme support via `data-theme` attribute
- 11 accent color presets with dark/light variants
- CSS custom property injection for accent colors
- Themed scrollbars matching app theme
- Full markdown preview styling (headings, code, blockquotes, tables, lists)
- `user-select: none` on body to prevent accidental text selection on right-click across app chrome (sidebar, toolbars, buttons); `user-select: text` re-enabled on `input`, `textarea`, `.cm-editor`, and `.markdown-preview`

### Testing

- Vitest with jsdom environment, `@testing-library/react`, `@testing-library/jest-dom`
- 86 tests across 9 test files:
  - `useEditorSettings.test.ts` — defaults, localStorage, clamping, validation
  - `useResizable.test.ts` — initial size, persistence, drag behavior
  - `db.test.ts` — CRUD operations, row mapping, mocked SQL plugin
  - `ConfirmDialog.test.tsx` — rendering, callbacks
  - `EditorToolbar.test.tsx` — view modes, formatting buttons
  - `NsLogo.test.tsx` — SVG rendering, className
  - `ResizeDivider.test.tsx` — cursor classes, drag state
  - `MarkdownPreview.test.tsx` — markdown rendering, GFM features
  - `NoteList.test.tsx` — selection, context menu, delete flow

### Dependencies Added

- `@codemirror/commands`, `@codemirror/lang-markdown`, `@codemirror/language`, `@codemirror/language-data`, `@codemirror/state`, `@codemirror/view`
- `@lezer/highlight`
- `react-markdown`, `remark-gfm`
- `uuid` (+ `@types/uuid`)
- `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`

## What Was Deferred

- **Focus mode** (Ctrl+Shift+D) — not implemented in Phase 2
- **Note metadata display** (tags, folder below title) — deferred to Phase 3 (Search & Organization); timestamps implemented in status bar (Created date + Modified date+time)
- **Tag editing and folder assignment UI** — deferred to Phase 3
- **Sidebar grouping by folder** — deferred to Phase 3
- **Unsaved/unsynced visual indicators in note list** — deferred to Phase 6 (Sync Engine)
- **Code block syntax highlighting in preview** — deferred
- **Image embedding** — deferred

## Resolved Open Questions

- **Default mode**: Editor-only (configurable via settings)
- **CodeMirror wrapper**: Thin custom `forwardRef` wrapper around `EditorView` (no `@uiw/react-codemirror`)
- **Auto-save delay**: Configurable via `useEditorSettings`, defaults to 1500ms
