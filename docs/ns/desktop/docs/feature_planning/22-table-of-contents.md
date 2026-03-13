# 22 — Table of Contents Panel

## Overview

A Table of Contents (TOC) tab in the right-side drawer (alongside AI Assistant and Version History) that shows document structure from markdown headings and allows click-to-scroll navigation in the preview pane. Mirrors the ns-web implementation.

## Goals

1. Parse markdown headings (h1–h6) from raw content, skipping fenced code blocks
2. Display heading hierarchy with indentation in a new drawer tab
3. Click a heading to smooth-scroll to the corresponding element in the preview
4. Slugs match between TOC and rendered heading IDs (`rehype-slug` + `github-slugger`)
5. Real-time updates as note content changes
6. Empty state when no headings are present

## Technical Approach

- **`rehype-slug`** added to `MarkdownPreview` rehype plugin chain — adds `id` attributes to rendered headings
- **`github-slugger`** used in `extractHeadings.ts` utility to generate matching slugs
- **`TocPanel`** component with `useMemo` for efficient heading extraction
- **Drawer integration** — new `"toc"` value in `DrawerTab` union type, tab button with list icon
- **Scroll handler** — `CSS.escape()` for safe selectors, `scrollIntoView({ behavior: "smooth" })`
- Visible when `selectedId && sidebarView !== "trash"` (desktop uses `drawerOpen` state)
- No-op in editor-only mode (no preview container to scroll)

## Dependencies

- `rehype-slug` — adds `id` to headings in rendered HTML
- `github-slugger` — slug generation matching rehype-slug algorithm
