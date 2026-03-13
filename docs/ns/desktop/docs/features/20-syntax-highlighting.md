# 20 — Syntax Highlighting in Code Blocks

## Summary

Adds syntax highlighting to fenced code blocks in the markdown preview. Code blocks with language hints (e.g., ` ```js `) now colorize tokens (keywords, strings, comments, numbers, functions, variables) using `rehype-highlight` + `highlight.js`. Custom CSS theme using CSS variables ensures automatic dark/light theme support. Applies to both `MarkdownPreview` and `QAPanel` components. Mirrors the ns-web implementation.

## What Was Built

### rehype-highlight Integration (`ns-desktop`)
- **`MarkdownPreview.tsx`** — Added `rehypeHighlight` import and `rehypePlugins={[rehypeHighlight]}` to `<ReactMarkdown>`
- **`QAPanel.tsx`** — Same pattern for AI assistant chat answer rendering

### CSS Theme (`ns-desktop`)
- 6 new CSS custom properties in `@theme` block for dark mode defaults:
  - `--color-hljs-keyword: #c792ea` (purple)
  - `--color-hljs-string: #c3e88d` (green)
  - `--color-hljs-comment: #636d83` (gray)
  - `--color-hljs-number: #f78c6c` (orange)
  - `--color-hljs-function: #82aaff` (blue)
  - `--color-hljs-variable: #f07178` (red)
- Light theme overrides in both `[data-theme="light"]` and `@media (prefers-color-scheme: light) [data-theme="system"]`
- 7 CSS rule groups targeting highlight.js class names (`.hljs-keyword`, `.hljs-string`, `.hljs-comment`, `.hljs-number`, `.hljs-function`, `.hljs-variable`, `.hljs-addition`)
- No built-in highlight.js theme imported — all styling via custom CSS variables

## Files Changed

| File | Change |
|------|--------|
| `packages/ns-desktop/package.json` | Added `rehype-highlight` + `highlight.js` dependencies |
| `packages/ns-desktop/src/components/MarkdownPreview.tsx` | Added `rehypeHighlight` import and `rehypePlugins` prop |
| `packages/ns-desktop/src/components/QAPanel.tsx` | Added `rehypeHighlight` import and `rehypePlugins` prop |
| `packages/ns-desktop/src/styles/global.css` | Added hljs theme variables (dark + light) and syntax token CSS rules |

## Tests

- 4 new tests in `MarkdownPreview.test.tsx` (`Syntax highlighting` describe block):
  - Fenced code block with language hint gets `hljs` class on the `<code>` element
  - Keywords in highlighted code produce `<span>` elements with `hljs-keyword` class
  - Inline code is NOT affected by syntax highlighting (no hljs classes)
  - Copy button still works correctly with syntax-highlighted code
