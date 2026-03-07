# 12 — Editor Tabs (VS Code-Style)

**Status:** Complete
**Phase:** UI Enhancement
**Priority:** Medium
**Completed:** v1.54.0

## Summary

VS Code-style editor tab bar for NoteSync, allowing users to keep multiple notes open and switch between them. Supports permanent tabs (via double-click) and preview tabs (via single-click when tabs exist), matching VS Code's tab semantics.

## Behavior

| Action | Result |
|--------|--------|
| Single-click note (no tabs open) | Load in editor, no tab created |
| Double-click note | Open as permanent tab |
| Single-click note (tabs open) | Open as italic preview tab (replaces existing preview) |
| Double-click preview tab | Pin it (becomes permanent) |
| Edit preview tab content | Auto-pin (becomes permanent) |
| Click a tab | Switch to that note |
| Close active tab (others remain) | Switch to adjacent tab |
| Close last tab | Clear editor |
| Delete/trash note | Tab auto-removed |
| Create new note | Opens as permanent tab |
| Deep-link / wiki-link / favorites | Opens as permanent tab |
| Tab overflow | Horizontal scroll |
| Switch to trash view | Tabs hidden, active tab remembered |
| Return to notes view | Active tab restored |

## Components

### TabBar (new)
- Horizontal tab bar above the editor toolbar
- Active tab: `bg-card text-foreground border-t-2 border-primary`
- Inactive tab: `bg-background text-muted-foreground hover:bg-accent`
- Preview tab: italic title text
- Dirty indicator: `●` dot in primary color
- Close button (×): visible on hover for inactive, always visible for active
- Middle-click closes tab
- Double-click preview tab pins it
- Scroll active tab into view on change

### Toolbar compacted
- Icon-only buttons (Summarize, Suggest tags, Copy link, Delete)
- Reduced padding and gaps
- Delete confirmation: "Delete? Yes / No" inline

## Files Changed

| File | Action |
|------|--------|
| `packages/ns-web/src/components/TabBar.tsx` | Created — tab bar component |
| `packages/ns-web/src/components/NoteList.tsx` | Modified — added `onDoubleClick` prop |
| `packages/ns-web/src/pages/NotesPage.tsx` | Modified — tab state, handlers, preview logic, toolbar compaction, trash view tab hiding |
| `packages/ns-web/src/__tests__/TabBar.test.tsx` | Created — 11 tab bar tests |
| `packages/ns-web/src/__tests__/NotesPage.test.tsx` | Modified — 11 tab integration tests, toolbar selector updates |

## Tests

- `TabBar.test.tsx` — 11 tests: renders titles, dirty indicator, click/close callbacks, active/inactive styling, middle-click close, empty title fallback, italic preview styling, double-click pin
- `NotesPage.test.tsx` — 11 new tests: no tab on single-click, no tab on switch, tab on double-click, no promote on double-click, preview tab on single-click with tabs, preview replacement, double-click pins preview, close active switches adjacent, close last clears editor, delete removes tab, create opens tab
