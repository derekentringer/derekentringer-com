# 22 — Table of Contents Panel

## Summary

Notes with headings now have a Table of Contents tab in the right-side drawer (alongside AI Assistant and Version History). The TOC shows document structure extracted from markdown headings (h1–h6) and allows click-to-scroll navigation to any heading in the preview pane. Uses `rehype-slug` for heading IDs in rendered HTML and `github-slugger` for matching slug generation in the TOC panel. Mirrors the ns-web implementation.

## What Was Built

### extractHeadings Utility (`ns-desktop`)
- **`extractHeadings.ts`** — Parses raw markdown text via regex, skips fenced code blocks, strips inline formatting (bold, italic, code, links, images, strikethrough)
- **`GithubSlugger`** — Fresh instance per call ensures duplicate heading numbering matches rehype-slug output (`intro`, `intro-1`, `intro-2`)
- Returns array of `{ level, text, slug }` objects

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

### NotesPage Drawer Integration (`ns-desktop`)
- **`DrawerTab`** type expanded to `"assistant" | "history" | "toc"`
- TOC tab button with Lucide "list" icon (lines with dots), visible when `selectedId && sidebarView !== "trash"`
- `handleTocHeadingClick(slug)` — queries `.markdown-preview` for heading by `CSS.escape(slug)`, calls `scrollIntoView({ behavior: "smooth", block: "start" })`
- Uses `drawerOpen` state (desktop pattern) instead of `qaOpen` (web pattern)
- No-op in editor-only mode (no preview container rendered)

## Files Changed

| File | Change |
|------|--------|
| `packages/ns-desktop/package.json` | Added `rehype-slug` + `github-slugger` dependencies |
| `packages/ns-desktop/src/lib/extractHeadings.ts` | **New** — Heading extraction with slug generation |
| `packages/ns-desktop/src/components/TocPanel.tsx` | **New** — TOC drawer panel component |
| `packages/ns-desktop/src/components/MarkdownPreview.tsx` | Added `rehypeSlug` to rehype plugins |
| `packages/ns-desktop/src/pages/NotesPage.tsx` | Expanded DrawerTab, added TOC tab + panel + scroll handler |

## Tests

- 12 new tests in `extractHeadings.test.ts`:
  - Empty content, no headings, single heading, multiple levels
  - Code block headings skipped, bold/italic/code/link/image stripping
  - Duplicate slug numbering, non-heading `#` lines ignored, h6 headings
- 6 new tests in `TocPanel.test.tsx`:
  - Empty state, renders heading items, header label
  - Click calls `onHeadingClick` with slug, indentation by level, content updates re-render
- 3 new tests in `MarkdownPreview.test.tsx` (`Heading IDs (rehype-slug)` describe block):
  - h1 gets ID, multiple levels get IDs, duplicate headings get incremented slugs
