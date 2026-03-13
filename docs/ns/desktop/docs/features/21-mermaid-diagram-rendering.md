# 21 — Mermaid Diagram Rendering in Code Blocks

## Summary

Fenced code blocks with ` ```mermaid ` now render as visual diagrams instead of raw code text. Uses the `mermaid` library (v11+) with `mermaid.render()` for React-friendly SVG generation. Lazy-loaded via dynamic `import()` so the ~2MB library only loads when a mermaid block is present. Theme-aware (dark/light) with automatic re-render on theme change. Applies to both `MarkdownPreview` and `QAPanel` components. Mirrors the ns-web implementation.

## What Was Built

### MermaidDiagram Component (`ns-desktop`)
- **`MermaidDiagram.tsx`** — New component that lazy-loads mermaid and renders SVG via `dangerouslySetInnerHTML` (safe because mermaid uses DOMPurify internally)
- **Dynamic import** — `await import("mermaid")` ensures the library only loads when a diagram exists
- **`mermaid.render()`** — Returns SVG string; better for React than `mermaid.run()` which scans the DOM
- **Module-level `idCounter`** — Simpler than `useId()` (which produces colons that mermaid rejects)
- **Theme reactivity** — MutationObserver on `data-theme` attribute + `matchMedia` listener for system theme; diagram re-renders when theme changes
- **Error fallback** — Shows raw code + error message if rendering fails
- **Safe `matchMedia` guard** — `typeof window.matchMedia === "function"` check for jsdom test compatibility

### CodeBlock Language Detection (`ns-desktop`)
- **`CodeBlock.tsx`** — Added `getLanguage()` helper that extracts language from `<code>` element's `className` (`language-*` pattern)
- Mermaid blocks are intercepted before `<pre>` rendering and delegated to `MermaidDiagram`
- Non-mermaid code blocks continue to render with copy button and syntax highlighting

### QAPanel Integration (`ns-desktop`)
- **`QAPanel.tsx`** — Added `components={{ pre: CodeBlock }}` to `<ReactMarkdown>` so AI assistant answers also get mermaid rendering and copy buttons on code blocks

### CSS Styles (`ns-desktop`)
- `.mermaid-diagram` — Centered flex container with `var(--color-input)` background, border, and border-radius matching `pre` blocks
- `.mermaid-diagram svg` — Responsive with `max-width: 100%` and `height: auto`
- `.mermaid-error` — Raw code fallback container
- `.mermaid-error-message` — Error text in `var(--color-error)` color
- `.mermaid-loading` — Centered loading state with muted text

## Files Changed

| File | Change |
|------|--------|
| `packages/ns-desktop/package.json` | Added `mermaid` dependency |
| `packages/ns-desktop/src/components/MermaidDiagram.tsx` | **New** — Lazy-loaded mermaid renderer with theme support |
| `packages/ns-desktop/src/components/CodeBlock.tsx` | Added language detection, delegate mermaid to MermaidDiagram |
| `packages/ns-desktop/src/components/QAPanel.tsx` | Added `components={{ pre: CodeBlock }}` for mermaid + copy button |
| `packages/ns-desktop/src/styles/global.css` | Added `.mermaid-diagram` / `.mermaid-error` / `.mermaid-loading` CSS |

## Tests

- 4 new tests in `MarkdownPreview.test.tsx` (`Mermaid diagrams` describe block):
  - Mermaid code block renders as a `.mermaid-diagram` container (not a `<pre>` block)
  - Non-mermaid code blocks still render normally with copy button
  - Error state shows raw code + error message when `mermaid.render` rejects
  - Inline `` `mermaid` `` code does not trigger diagram rendering
- Mock: `vi.mock("mermaid")` returns a fake `{ svg: "<svg>diagram</svg>" }` response since jsdom can't run mermaid's real rendering
