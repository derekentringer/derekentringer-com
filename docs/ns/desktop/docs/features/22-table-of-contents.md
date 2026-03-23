# 22 — Table of Contents Panel

## Summary

Notes with headings now have a Table of Contents tab in the right-side drawer (alongside AI Assistant and Version History). The TOC shows document structure extracted from markdown headings (h1–h6) and allows click-to-scroll navigation to any heading. In preview/split mode, scrolls to the rendered heading via `scrollIntoView()`; in editor mode, scrolls the CodeMirror editor to the heading's source line via `scrollToLine()`. Uses `rehype-slug` for heading IDs in rendered HTML and `github-slugger` for matching slug + line number generation in the TOC panel. Applied to both ns-desktop and ns-web.

## What Was Built

### extractHeadings Utility (`ns-desktop` + `ns-web`)
- **`extractHeadings.ts`** — Parses raw markdown text via regex, skips fenced code blocks, strips inline formatting (bold, italic, code, links, images, strikethrough)
- **`GithubSlugger`** — Fresh instance per call ensures duplicate heading numbering matches rehype-slug output (`intro`, `intro-1`, `intro-2`)
- Returns array of `{ level, text, slug, lineNumber }` objects — `lineNumber` (1-based) enables editor-mode scroll-to-heading

### TocPanel Component (`ns-desktop`)
- **`TocPanel.tsx`** — Drawer panel matching VersionHistoryPanel styling pattern
- `useMemo(() => extractHeadings(content), [content])` for efficient re-computation
- Empty state: "No headings found" when content has no headings
- Header: uppercase "Table of Contents" label with `border-b border-border`
- Heading items: buttons with `paddingLeft` based on `(level - minLevel) * 16 + 12` px for hierarchy indentation
- `truncate` class for long heading text, `cursor-pointer`, `hover:bg-accent`

### MarkdownPreview rehype-slug Integration (`ns-desktop`)
- **`MarkdownPreview.tsx`** — Added `rehypeSlug` before `rehypeHighlight` in the `rehypePlugins` array
- `## My Section` now renders as `<h2 id="my-section">My Section</h2>`

### MarkdownEditor scrollToLine (`ns-desktop` + `ns-web`)
- **`MarkdownEditorHandle`** — Added `scrollToLine(line: number)` method
- Uses `EditorView.scrollIntoView()` with `{ y: "start" }` to scroll CodeMirror to the target line
- Moves cursor to the start of the target line for visual feedback

### NotesPage Drawer Integration (`ns-desktop`)
- **`DrawerTab`** type expanded to `"assistant" | "history" | "toc"`
- TOC tab button with Lucide "list" icon (lines with dots), visible when `selectedId && sidebarView !== "trash"`
- `handleTocHeadingClick(slug, lineNumber)` — in preview/split mode, queries `.markdown-preview` for heading by `CSS.escape(slug)` and calls `scrollIntoView({ behavior: "smooth", block: "start" })`; in editor mode, calls `editorRef.current.scrollToLine(lineNumber)` to scroll the CodeMirror editor to the heading's source line
- Uses `drawerOpen` state (desktop pattern) instead of `qaOpen` (web pattern)
- Works in all view modes (editor, split, preview)

## Files Changed

| File | Change |
|------|--------|
| `packages/ns-desktop/package.json` | Added `rehype-slug` + `github-slugger` dependencies |
| `packages/ns-desktop/src/lib/extractHeadings.ts` | **New** — Heading extraction with slug + lineNumber generation |
| `packages/ns-desktop/src/components/TocPanel.tsx` | **New** — TOC drawer panel component, passes slug + lineNumber to callback |
| `packages/ns-desktop/src/components/MarkdownPreview.tsx` | Added `rehypeSlug` to rehype plugins |
| `packages/ns-desktop/src/components/MarkdownEditor.tsx` | Added `scrollToLine()` to `MarkdownEditorHandle` |
| `packages/ns-desktop/src/pages/NotesPage.tsx` | Expanded DrawerTab, added TOC tab + panel + multi-mode scroll handler |
| `packages/ns-web/src/lib/extractHeadings.ts` | Added `lineNumber` field to `Heading` interface |
| `packages/ns-web/src/components/TocPanel.tsx` | Updated callback to pass slug + lineNumber |
| `packages/ns-web/src/components/MarkdownEditor.tsx` | Added `scrollToLine()` to `MarkdownEditorHandle` |
| `packages/ns-web/src/pages/NotesPage.tsx` | Updated `handleTocHeadingClick` for multi-mode scroll |

## Tests

- 14 tests in `extractHeadings.test.ts` (ns-desktop + ns-web):
  - Empty content, no headings, single heading, multiple levels
  - Code block headings skipped, bold/italic/code/link/image stripping
  - Duplicate slug numbering, non-heading `#` lines ignored, h6 headings
  - Line number tracking with mixed content (headings, paragraphs, code blocks)
- 6 tests in `TocPanel.test.tsx` (ns-desktop + ns-web):
  - Empty state, renders heading items, header label
  - Click calls `onHeadingClick` with slug + lineNumber, indentation by level, content updates re-render
- 3 tests in `MarkdownPreview.test.tsx` (`Heading IDs (rehype-slug)` describe block):
  - h1 gets ID, multiple levels get IDs, duplicate headings get incremented slugs
