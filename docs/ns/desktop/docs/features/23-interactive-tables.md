# 23 — Interactive Tables

## Summary

GFM tables in the markdown preview become interactive when `onContentChange` is provided: click a column header to sort rows (ascending/descending toggle), double-click a cell to edit its raw markdown inline. Edits and sorts rewrite the underlying markdown (source of truth). Trash view tables remain static (read-only). Mirrors the ns-web implementation.

## What Was Built

### tableMarkdown Utility (`ns-desktop`)
- **`tableMarkdown.ts`** — Pure functions for parsing and manipulating GFM tables in raw markdown
- **`findTables()`** — Line-by-line scan detecting header → separator → body row sequences, skips fenced code blocks (0–3 space indent per CommonMark), returns array of `ParsedTable` with `startLine`, `endLine`, `headers`, `alignments`, `rows`
- **`parseRow()`** — Splits pipe-delimited rows handling `\|` escaping via placeholder substitution
- **`parseAlignments()`** — Extracts left/center/right/none from separator row markers (`:---`, `:---:`, `---:`, `---`)
- **`serializeTable()`** — Rebuilds GFM table with padded columns, alignment markers, and consistent formatting
- **`updateCell()`** — Updates a specific cell value and returns the full updated document
- **`sortTableByColumn()`** — Sorts rows by column with natural sort (`localeCompare({ numeric: true, sensitivity: 'base' })`), ascending or descending

### InteractiveTable Component (`ns-desktop`)
- **`InteractiveTable.tsx`** — Self-rendering table component replacing react-markdown's default `<table>`
- Parses raw markdown via `findTables(content)[tableIndex]` to get structured table data
- **Sort**: Click column header toggles asc ↔ desc, calls `onContentChange` with sorted markdown; `SortIndicator` SVG arrow only shown on active column
- **Edit**: Double-click cell enters edit mode with `<input>`, auto-focused; Enter/blur commits, Escape cancels, Tab/Shift+Tab navigates between cells with row wrapping
- **Fallback**: Returns `<table>{children}</table>` if table parsing fails
- Each cell rendered via inline `<ReactMarkdown>` with `<p>` stripping for formatted display

### MarkdownPreview Integration (`ns-desktop`)
- **`MarkdownPreview.tsx`** — Added `table` to `components` override map when `onContentChange` is provided
- Table index determined by matching `node.position.start.line` (HAST node from react-markdown) against `findTables()` results
- **Stable component references**: `useRef` for `content` and `onContentChange`, `useMemo` dependency `[!!onContentChange]` — prevents React from remounting InteractiveTable on content changes (preserves sort state)
- Checkbox handler also reads from refs for consistency

### CSS Styles (`ns-desktop`)
- **`global.css`** — Sortable header styles (cursor, hover background, user-select), sort indicator (inline-flex, margin, opacity transitions), active sort state (full opacity, accent color), editable cell hover outline, cell edit input (border, padding, sizing)

## Files Changed

| File | Change |
|------|--------|
| `packages/ns-desktop/src/lib/tableMarkdown.ts` | **New** — Table parsing, serialization, cell update, sort |
| `packages/ns-desktop/src/components/InteractiveTable.tsx` | **New** — Self-rendering interactive table component |
| `packages/ns-desktop/src/components/MarkdownPreview.tsx` | Added `table` component override with stable refs, `useRef` for content/onContentChange |
| `packages/ns-desktop/src/styles/global.css` | Added sortable header + editable cell + edit input CSS |

## Tests

- 36 unit tests in `tableMarkdown.test.ts`:
  - `parseRow`: simple row, escaped pipes, empty cells, trimming, with/without outer pipes
  - `parseAlignments`: left/right/center/none, mixed
  - `findTables`: single table, multiple tables, skip code blocks, table at start/end, no body rows, empty doc, cells with formatting
  - `serializeTable`: simple table, alignment preserved, column padding, empty cells, escaped pipes
  - `updateCell`: single-table doc, multi-table doc, preserves surrounding content, empty string, out-of-range no-op
  - `sortTableByColumn`: asc/desc alphabetical, numeric sort, mixed values, single-row table, correct table in multi-table doc, alignment preserved
- 9 component tests in `InteractiveTable.test.tsx`:
  - Renders headers and body cells
  - Sort indicator appears on header click
  - Toggles asc ↔ desc on repeated clicks
  - Calls `onContentChange` with sorted markdown
  - Double-click enters edit mode with input
  - Enter commits edit, Escape cancels
  - Tab navigates to next cell
  - Falls back to static table when parsing fails
- 3 integration tests in `MarkdownPreview.test.tsx` (`Interactive tables` describe block):
  - Renders interactive table when `onContentChange` provided
  - Renders static table when `onContentChange` absent (trash view)
  - Multiple tables in one document have correct indices
