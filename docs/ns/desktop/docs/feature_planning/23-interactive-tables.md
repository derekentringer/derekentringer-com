# 23 — Interactive Tables

## Summary

GFM tables in the markdown preview become interactive when `onContentChange` is provided: click a column header to sort rows (ascending/descending toggle), double-click a cell to edit its raw markdown inline. Edits and sorts rewrite the underlying markdown (source of truth). Trash view tables remain static (read-only). Mirrors the ns-web implementation.

## Scope

### Sort
- Click any column header to sort ascending, click again for descending, click again for ascending
- Sort indicator arrow appears only on the actively sorted column
- Sorting rewrites the markdown rows (persistent, not just visual)
- Natural sort via `localeCompare({ numeric: true, sensitivity: 'base' })`

### Edit
- Double-click any body cell to enter edit mode (inline `<input>`)
- Enter or blur commits the edit, Escape cancels
- Tab / Shift+Tab navigates between cells with row wrapping
- Edits update the raw markdown via `updateCell()`

### Table Parsing
- `tableMarkdown.ts` utility: `findTables()` parses all GFM tables in a markdown document, skipping fenced code blocks
- `serializeTable()` rebuilds table with padded columns and alignment markers
- `parseRow()` handles escaped pipes (`\|`)
- `parseAlignments()` extracts column alignment from separator row

### Component Stability
- `MarkdownPreview` uses `useRef` for `content` and `onContentChange` so the `components.table` override has a stable function reference
- This prevents React from remounting `InteractiveTable` on content changes (which would lose sort state)
- `useMemo` dependency is `[!!onContentChange]` — only recreates when editing capability is toggled

## Files

| File | Change |
|------|--------|
| `packages/ns-desktop/src/lib/tableMarkdown.ts` | **New** — Table parsing, serialization, cell update, sort |
| `packages/ns-desktop/src/components/InteractiveTable.tsx` | **New** — Self-rendering interactive table component |
| `packages/ns-desktop/src/components/MarkdownPreview.tsx` | Added `table` component override with stable refs |
| `packages/ns-desktop/src/styles/global.css` | Added sortable header + editable cell + edit input CSS |

## Tests

- 36 unit tests in `tableMarkdown.test.ts`
- 9 component tests in `InteractiveTable.test.tsx`
- 3 integration tests added to `MarkdownPreview.test.tsx`
