# 06 — Editor Tabs

**Status:** Complete
**Phase:** 4 — UI Features
**Priority:** High

## Summary

VS Code-style tab bar for opening multiple notes simultaneously, with preview tabs (single-click) and permanent tabs (double-click), drag-and-drop reorder, and middle-click close. Matches the ns-web implementation for feature parity.

## Requirements

- **Tab bar**:
  - Horizontal tab bar above the editor area
  - Each tab shows the note title
  - Active tab visually highlighted
  - Compact icon-only toolbar (view mode, formatting) to save vertical space
- **Preview vs. permanent tabs**:
  - Single-click a note in the sidebar: opens as a preview tab (italic title)
  - Preview tab is replaced when another note is single-clicked
  - Double-click a note: opens as a permanent tab (normal title)
  - Editing a preview tab auto-pins it as permanent
  - Close button (×) on each tab
- **Tab interactions**:
  - Middle-click a tab to close it
  - Drag-and-drop tabs to reorder (horizontal axis only)
  - Close tab with unsaved changes: prompt to save or discard
- **Trash view integration**:
  - Tabs preserved when switching between notes view and trash view
  - Restore from trash re-opens the note tab
- **State persistence**:
  - Open tabs and their order persisted in localStorage
  - Active tab restored on app launch

## Technical Considerations

- Tab state managed in React context or zustand store: `openTabs: Tab[]`, `activeTabId: string`
- Drag-and-drop: `@dnd-kit/sortable` with `restrictToHorizontalAxis` modifier (same as ns-web)
- Tab overflow: horizontal scrolling when too many tabs to fit, or a dropdown menu for hidden tabs
- Preview tab logic: track `isPinned` boolean per tab; un-pinned tabs are replaced on next single-click open
- Keyboard shortcuts: Ctrl+W to close current tab, Ctrl+Tab / Ctrl+Shift+Tab to cycle tabs

## Dependencies

- [01 — Note Editor](01-note-editor.md) — needs the editor to display note content within tabs

## Open Questions

- Should tabs sync across devices, or be device-local only?
- Maximum number of open tabs before performance degrades?
- Should there be a "Close All" or "Close Others" context menu on tabs?
