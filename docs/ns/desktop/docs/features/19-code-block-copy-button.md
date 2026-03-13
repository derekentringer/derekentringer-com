# 19 — Code Block Copy Button

## Summary

Adds a "Copy" button to fenced code blocks in the markdown preview pane. Hovering over a code block reveals a copy button in the top-right corner; clicking it copies the code content to the clipboard with a checkmark visual feedback for 2 seconds. Works in all preview contexts including trash view (read-only). Mirrors the ns-web implementation.

## What Was Built

### New Component (`ns-desktop`)
- **`CodeBlock.tsx`** — Custom `<pre>` wrapper for react-markdown's `components.pre` override
  - Wraps `<pre>` in a `div.code-block-wrapper` (position: relative)
  - Copy button with inline SVG icons (clipboard + checkmark), hidden until hover via CSS opacity transition
  - `extractText()` recursively walks React children to extract plain text from `<code>` elements
  - `navigator.clipboard.writeText()` with `useState` for copied state (2s timeout)
  - `cursor-pointer` on button, `aria-label` for accessibility ("Copy code" / "Copied")

### MarkdownPreview Refactor (`ns-desktop`)
- `markdownComponents` useMemo now always builds a components object with `pre: CodeBlock`
- Checkbox `input` component conditionally added only when `onContentChange` is present
- Ensures copy button works everywhere (including trash view where `onContentChange` is absent)

### CSS (`ns-desktop`)
- `.code-block-wrapper` — relative positioning container
- `.code-block-copy` — absolute positioned button (top-right), opacity 0 by default, fades in on wrapper hover
- `.code-block-copy:hover` — foreground color highlight
- `.code-block-copy.copied` — green color (#4ade80) for checkmark feedback state

## Files Changed

| File | Change |
|------|--------|
| `packages/ns-desktop/src/components/CodeBlock.tsx` | New — copy button wrapper component |
| `packages/ns-desktop/src/components/MarkdownPreview.tsx` | Refactored markdownComponents to always build, added `pre: CodeBlock` |
| `packages/ns-desktop/src/styles/global.css` | Added `.code-block-wrapper` / `.code-block-copy` CSS |

## Tests

- 5 new tests in `MarkdownPreview.test.tsx`:
  - Fenced code block renders with a copy button
  - Clicking copy calls `navigator.clipboard.writeText` with the code text
  - Button shows copied state after click (class change + aria-label)
  - Inline `code` does NOT get a copy button
  - Copy button present even without `onContentChange` (trash view)
