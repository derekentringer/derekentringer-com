# 08 — Markdown Rendering Parity

**Status:** Not Started
**Phase:** 4 — Polish
**Priority:** Medium

## Summary

Close the markdown rendering gap between mobile and web/desktop. The mobile app currently uses `react-native-markdown-display` which lacks several features supported on web/desktop via `react-markdown` + `remark-gfm` + `rehype-highlight` + custom plugins.

## Feature Gap Analysis

| Feature | Web/Desktop | Mobile | Gap |
|---------|-------------|--------|-----|
| Table of Contents | Custom `TocPanel` with heading extraction | Not supported | **Major** |
| Tables (GFM) | Interactive/sortable via `remark-gfm` | Not supported | **Major** |
| Syntax highlighting | `rehype-highlight` + `highlight.js` | Not supported | **Major** |
| Wiki-style links `[[]]` | Custom `remarkWikiLink` plugin | Not supported | **Major** |
| Mermaid diagrams | `mermaid` library in code blocks | Not supported | **Major** |
| Task lists (interactive) | Toggleable checkboxes | Render-only (not interactive) | **Medium** |
| Footnotes | Supported via `remark-gfm` | Not supported | **Medium** |
| Local file indicator | `isLocalFile` badge on notes linked to desktop files | Not supported | **Medium** |
| Strikethrough | Supported | Supported | Parity |
| Basic markdown | Full support | Full support | Parity |

## Requirements

### Table of Contents
- Extract headings from note markdown content
- Display as a navigable list (collapsible panel or bottom sheet)
- Tap a heading to scroll to that section in the note viewer
- Matches web/desktop `TocPanel` behavior

### GFM Tables
- Render markdown tables with headers, rows, and alignment
- Horizontal scroll for wide tables on narrow screens
- Styled to match theme (borders, alternating row colors)

### Syntax Highlighting
- Language-specific code coloring in fenced code blocks
- Support common languages (JavaScript, TypeScript, Python, JSON, SQL, etc.)
- Dark/light theme variants

### Wiki-style Links
- Parse `[[note title]]` syntax in rendered markdown
- Resolve to matching note by title
- Tappable to navigate to the linked note
- Visual styling matching web (link color, hover state)

### Mermaid Diagrams
- Render fenced code blocks with `mermaid` language tag
- Display as rendered diagrams (SVG or image)
- Support common diagram types (flowchart, sequence, class, etc.)

### Interactive Task Lists
- Render `- [ ]` and `- [x]` as checkboxes
- Tapping a checkbox toggles its state
- Update note content and trigger auto-save

### Footnotes
- Render `[^1]` references and `[^1]: text` definitions
- Tappable references that scroll to footnote definitions

### Local File Indicator
- Show badge/icon on notes where `isLocalFile` is true
- Tooltip or info text: "This note is linked to a local file on a desktop device"
- Display in note list items, note detail header, and dashboard cards
- Matches web's `isLocalFile` badge behavior

## Technical Considerations

- `react-native-markdown-display` has limited extensibility — may need to replace with a more capable library or build custom renderers
- Alternative libraries to evaluate:
  - `@ronradtke/react-native-markdown-display` (fork with more features)
  - Custom renderer using `marked` or `markdown-it` parser + React Native views
  - WebView-based rendering for complex features (tables, mermaid) as a fallback
- Syntax highlighting: `react-native-syntax-highlighter` or `react-syntax-highlighter` with React Native support
- Mermaid on mobile: consider rendering to SVG via `react-native-svg` or using a WebView for complex diagrams
- Wiki-link resolution requires access to the note list (by title) — may need a lookup hook or local SQLite query
- Table of Contents heading extraction can reuse web's `extractHeadings.ts` logic

## Dependencies

- [01 — Note List & Viewer](01-note-list-and-viewer.md) — markdown viewer is the base
- [02 — Note Editor](02-note-editor.md) — interactive task lists need editor integration
- [04 — Sync Engine](04-sync-engine.md) — wiki-link resolution needs local note data

## Open Questions

- Should we replace `react-native-markdown-display` entirely, or extend it with custom renderers?
- Is WebView-based rendering acceptable for complex features (mermaid, tables), or must everything be native?
- Should syntax highlighting support all highlight.js languages, or a curated subset for mobile performance?
- Priority order for implementing individual features?
