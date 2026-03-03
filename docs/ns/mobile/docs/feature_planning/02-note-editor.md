# 02 — Note Editor

**Status:** Not Started
**Phase:** 1 — Notes Core
**Priority:** High

## Summary

Mobile-optimized markdown editor for creating, editing, and deleting notes. Auto-saves to local SQLite with sync queue integration.

## Requirements

- **Editor screen**:
  - Title field at the top (editable, large font)
  - Markdown text input below (multi-line, full screen)
  - Markdown-aware toolbar above the keyboard:
    - Bold (`**`), Italic (`*`), Heading (`#`), Link (`[]()`), List (`-`), Checkbox (`- [ ]`), Code (`` ` ``), Quote (`>`)
    - Tap a toolbar button to wrap selected text or insert markdown syntax at cursor
  - Monospace font for the editor (markdown source editing, not WYSIWYG)
  - Syntax highlighting if feasible (optional; plain monospace is acceptable)
- **Note CRUD**:
  - **Create**: "+" FAB (floating action button) on the note list screen; opens blank editor
  - **Edit**: tap "Edit" from note viewer; opens existing note content in editor
  - **Delete**: accessible from note viewer or editor menu; soft delete with confirmation; haptic feedback on delete
- **Auto-save**:
  - Debounced save to local SQLite (500ms after last keystroke)
  - Visual indicator: "Saved" / "Saving..."
  - On save: set `syncStatus` to `modified`, update `updatedAt`, write to `sync_queue`
- **Note metadata**:
  - Folder assignment: bottom sheet picker to select/change folder
  - Tag management: add/remove tags via bottom sheet; tag autocomplete
  - View created/updated timestamps in an info section
- **Preview mode**:
  - Toggle between edit mode and rendered markdown preview
  - Preview uses `react-native-markdown-display`
  - Button in the header to switch modes
- **Keyboard handling**:
  - Toolbar stays visible above the keyboard (KeyboardAvoidingView)
  - Tab key inserts spaces (not navigate away)
  - Dismiss keyboard on scroll or explicit action

## Technical Considerations

- Use React Native `TextInput` with `multiline` for the editor; no CodeMirror on mobile
- Markdown toolbar: custom component with buttons that manipulate the TextInput's text and selection
- Auto-save writes to SQLite via expo-sqlite; sync queue entry created for each save
- `KeyboardAvoidingView` or `react-native-keyboard-aware-scroll-view` to keep toolbar visible
- Haptic feedback via `expo-haptics` on destructive actions (delete) and key interactions
- Bottom sheets via `@gorhom/bottom-sheet` for folder picker and tag management
- Consider `useRef` for TextInput to access selection state and programmatically insert text

## Dependencies

- [00 — Project Setup & Auth](00-project-setup-and-auth.md) — needs app shell and SQLite database
- [01 — Note List & Viewer](01-note-list-and-viewer.md) — editor is accessed from the note list/viewer

## Open Questions

- Is syntax highlighting in a React Native TextInput feasible, or should we accept plain monospace?
- Should the markdown toolbar be customizable (reorder buttons, hide unused ones)?
- Maximum note length on mobile before performance degrades?
