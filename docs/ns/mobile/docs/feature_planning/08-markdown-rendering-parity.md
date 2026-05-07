# 08 — Markdown Rendering Parity

**Status:** In Progress (Phases 1–4 + 5a complete; Phase 5b pending; Phase 6 deferred)
**Priority:** Medium

## Summary

Close the markdown rendering gap between mobile and web/desktop. Mobile uses `react-native-markdown-display` while web/desktop use `react-markdown` + `remark-gfm` + `rehype-highlight` + `mermaid` + custom remark plugins. Several features render unstyled or as plain text on mobile today.

## Feature Gap (as of 2026-05-07)

Verified on iOS + Android against `markdown-parity-test-fixture.md`.

| Feature | Web/Desktop | Mobile | Gap |
|---------|-------------|--------|-----|
| GFM Tables (simple, aligned, inline markdown in cells) | `remark-gfm` + custom `InteractiveTable` | Renders natively, alignment respected | Parity |
| GFM Tables (wide-table horizontal scroll) | Wrapped in scroll container | Cells wrap instead of scrolling | **Minor** |
| Code-block long-line horizontal scroll | `<pre>` overflow-x | Lines wrap instead of scrolling | **Minor** |
| Syntax highlighting | `rehype-highlight` + `CodeBlock` (lang label, copy btn) | Unstyled, no language label, no copy | **Major** |
| Mermaid diagrams | `mermaid` lib, `language="mermaid"` detection | Not rendered (deferred) | **Deferred** |
| Interactive task lists | `remark-gfm` + custom `<input type="checkbox">` updating source | Plain `[ ]`/`[x]` text, not interactive | **Major** |
| Interactive Table of Contents | `TocPanel` + `rehype-slug` + heading IDs + jump-to-anchor | No ToC, no heading anchors | **Major** |
| Wiki-link rendering | Custom `remarkWikiLink` → tappable link | Raw `[[…]]` text, not rendered as link at all | **Major** |
| Wiki-link visual styling | `.wiki-link` accent + dotted underline | n/a until rendering is fixed | (rolls into above) |
| Bare URL autolinks (`https://…`) | `remark-gfm` | Plain text, not tappable | **Major** |
| Strikethrough (`~~text~~`) | `remark-gfm` | Renders with line-through | Parity |
| Email autolinks (`<a@b>`) | Standard | Renders as tappable link | Parity |
| Raw HTML embeds | ReactMarkdown allows HTML | Escaped, visible as literal text | Parity (acceptable) |
| Frontmatter | Editor folds it | `stripFrontmatter()` runs pre-render | Parity |
| Headings, bold, italic, lists, blockquotes, inline code, basic code blocks, links, images, hr | Full support | Library defaults | Parity |

**Not supported on any platform** (out of scope here): math/LaTeX, footnotes, definition lists, emoji shortcodes.

## Phased Implementation Plan

### Phase 1 — Wiki-link rendering + bare URL autolinks ✅
**Effort:** ~1 day (actual: ~1 day)
**Status:** Complete (2026-05-07)

**Goal:** Wiki-links render as tappable, visually distinct links instead of raw `[[…]]` text. Bare URLs (`https://…`) become tappable instead of plain text.

**What shipped:**
- `resolveWikiLinks` now rewrites unresolved `[[Title]]` to `[Title](#wiki-broken:<encodedTitle>)` instead of leaving raw text. Aliases (`[[Title|alias]]`) work for both resolved and broken cases.
- New `parseBrokenWikiLinkUrl` helper for the `#wiki-broken:` scheme; both screens' `handleLinkPress` route resolved → navigate, broken → "Note not found" alert, regular URL → external open.
- Custom `link` rule in `markdownRules.ts` discriminates by URL prefix:
  - `#wiki:` → `styles.link` + `WIKI_DECOR`
  - `#wiki-broken:` → `styles.link_wiki_broken` + `WIKI_DECOR`
  - everything else → unchanged default
- `WIKI_DECOR` is `Platform.select`-ed: iOS gets `textDecorationStyle: "dotted"` (RN's `dashed` rendered as very heavy chunks); Android gets no extra decoration since it ignores `textDecorationStyle` and falls back to a misleading solid underline. On Android the missing underline on a lime word is the wiki-link cue.
- Both `NoteDetailScreen` and `NoteEditorScreen` pass `markdownit={MarkdownIt({ typographer: true, linkify: true })}` to the `Markdown` component, enabling bare URL autolinks at the parser level.
- Web/desktop CSS in `packages/ns-web/src/styles/global.css` was switched from `text-decoration: underline dashed` shorthand → longhand + `-webkit-text-decoration-*` longhand (Tauri's WKWebView was rendering the shorthand as solid). Style also changed from `dashed` → `dotted` so all four platforms match visually.
- All wiki-link colors theme-aware: mobile via `themeColors.primary`/`themeColors.muted` (per-theme `colors.ts`); web/desktop via `var(--color-primary)`/`var(--color-muted-foreground)`/`var(--color-destructive)`.

**Files touched:**
- `packages/ns-mobile/src/lib/resolveWikiLinks.ts`
- `packages/ns-mobile/src/lib/markdownRules.ts`
- `packages/ns-mobile/src/screens/NoteDetailScreen.tsx`
- `packages/ns-mobile/src/screens/NoteEditorScreen.tsx`
- `packages/ns-mobile/src/__tests__/resolveWikiLinks.test.ts` (14 tests, all green)
- `packages/ns-web/src/styles/global.css`

---

### Phase 2 — Wide-table & code-block horizontal scroll ✅
**Effort:** ~half day (actual: ~half day)
**Status:** Complete (2026-05-07)

**Goal:** Tables and code blocks that exceed the viewport scroll horizontally instead of wrapping cell/line content.

**What shipped:**
- Custom `table` rule wraps the inner table View in a horizontal `ScrollView` with `contentContainerStyle: { flexGrow: 1 }`. Simple/narrow tables still inflate to fill the viewport; wide tables overflow and scroll horizontally.
- Custom `th` / `td` rules add `minWidth: 100` so column count drives the row's natural width — once total minWidth exceeds the viewport, the outer ScrollView starts scrolling. Below that, `flex: 1` still divides the inflated row evenly.
- Custom `fence` and `code_block` rules wrap their inner Text in a horizontal `ScrollView` so long lines scroll instead of wrapping. Bordered chrome (bg, border, padding, radius) lives on the ScrollView; the Text inherits color/font from the body cascade.
- GFM column alignment continues to work — alignment lives on `node.attributes.style` and propagates through `inheritedStyles` in `AstRenderer`, so the wrap doesn't disturb it.

**Files touched:**
- `packages/ns-mobile/src/lib/markdownRules.ts`

---

### Phase 3 — Interactive Task Checkboxes ✅
**Effort:** ~1 day (actual: ~1 day)
**Status:** Complete (2026-05-07)

**Goal:** `[ ]` / `[x]` items render as tappable checkboxes that update the source markdown and persist.

**What shipped:**
- New `packages/ns-mobile/src/lib/toggleTask.ts` with three exports:
  - `markTasks(content)` — runs in the render pipeline (alongside `stripFrontmatter` and `resolveWikiLinks`) to rewrite each leading `[ ] ` / `[x] ` task marker into a markdown link with a custom URL scheme (`#task-empty:N` / `#task-done:N`), label being the Unicode checkbox glyph (☐ / ☑).
  - `toggleTask(content, taskIndex)` — flips the checked state of the N-th task in canonical source. Used against the *unmodified* note content so the round-trip representation stays as standard GFM.
  - `parseTaskUrl(url)` — distinguishes the task URL scheme.
- Extended `link` rule in `markdownRules.ts` to recognize `#task-empty:` / `#task-done:` URLs and render the glyph at 18pt with theme-tinted color (lime for done, muted for empty) plus `accessibilityRole: "checkbox"`.
- `NoteDetailScreen.handleLinkPress` dispatches on task URLs → `toggleTask` against `note.content` → `useUpdateNote.mutate(...)`. Auto-save propagates the change through the standard sync path.
- `NoteEditorScreen.handleLinkPress` does the same against the local `content` state so the editor's Preview view also responds to checkbox taps; auto-save picks it up like any other edit.
- 20 new unit tests covering markTasks (8), toggleTask (7), parseTaskUrl (4), and the round-trip (1). Full mobile suite: 336/336 green.

**Known cosmetic gap:** task items in mixed lists (test fixture 4d) show both the bullet AND the checkbox glyph (`• ☐ Task item`). The bullet stays because we don't override `list_item`. Tracked as a follow-up; can be addressed by detecting the task pattern in a custom `list_item` rule.

**Files touched:**
- `packages/ns-mobile/src/lib/toggleTask.ts` (new)
- `packages/ns-mobile/src/__tests__/toggleTask.test.ts` (new, 20 tests)
- `packages/ns-mobile/src/lib/markdownRules.ts`
- `packages/ns-mobile/src/screens/NoteDetailScreen.tsx`
- `packages/ns-mobile/src/screens/NoteEditorScreen.tsx`

---

### Phase 4 — Interactive Table of Contents ✅
**Effort:** ~1–2 days (actual: ~1 day)
**Status:** Complete (2026-05-07)

**Goal:** A bottom-sheet ToC button in the header that lists all headings and jumps the scroll position to the chosen heading.

**What shipped:**
- New `packages/ns-mobile/src/lib/extractHeadings.ts` — mobile port of the web extractor. Returns `{level, text}[]` in source order, skipping fenced code blocks and a defensive frontmatter block. Drops the `slug`/`lineNumber` fields the web version produces (mobile keys by cleaned text since we scroll to a captured Y, not a DOM anchor). 13 unit tests cover frontmatter, fenced code, inline-formatting cleanup, and the no-match cases.
- New `packages/ns-mobile/src/components/notes/TocSheet.tsx` — `BottomSheetModal` mirroring the existing `VersionHistorySheet` shape: header strip + indented heading list (`(level - minLevel) * 16` left-pad) + tap-to-dismiss handler. Empty state shown when the note has no headings.
- New `TocCaptureContext` in `markdownRules.ts` exposes a `registerHeading(text, y)` callback plus a `contentRef` (a wrapper `<View>` placed inside the ScrollView). Custom `heading1`–`heading6` rules wrap their children in a `<HeadingCapture>` whose `onLayout` calls `measureInWindow` on both the heading and the content baseline; subtracting the two window-Y values yields the heading's Y inside the scrollable content — exactly what `scrollTo({y})` consumes. No scroll-offset tracking needed because the content baseline moves with the scroll.
- Heading text is extracted by walking the AST recursively to the leaf `text` nodes (`extractAstText`). Reading `node.children[0].content` directly worked on iOS but returned empty on Android — a Hermes/markdown-it interaction we worked around.
- `NoteDetailScreen` mounts the Provider, owns the `contentRef`, adds a `format-list-bulleted` icon to the header right (only shown when the note has headings), presents the sheet on tap, and calls `scrollViewRef.current.scrollTo` on heading select.

**Why `measureInWindow` instead of `measureLayout(handle, …)`:** the new RN architecture (Fabric) rejects numeric node handles for `measureLayout`'s `relativeTo` argument. Window coords work on both legacy and Fabric renderers.

**Files touched:**
- `packages/ns-mobile/src/lib/extractHeadings.ts` (new)
- `packages/ns-mobile/src/__tests__/extractHeadings.test.ts` (new, 13 tests)
- `packages/ns-mobile/src/components/notes/TocSheet.tsx` (new)
- `packages/ns-mobile/src/lib/markdownRules.ts`
- `packages/ns-mobile/src/screens/NoteDetailScreen.tsx`

---

### Phase 5 — Syntax Highlighting (split into two sub-phases)
**Effort:** ~1 day for 5a, ~1–2 days for 5b

#### Phase 5a — Code-block chrome (no real coloring) ✅
**Effort:** ~1 day (actual: ~half day)
**Status:** Complete (2026-05-07)

**Goal:** Code fences look like code blocks — monospace font, theme-aware bg, language label, copy-to-clipboard button — but glyphs are still single-colored.

**What shipped:**
- New `packages/ns-mobile/src/components/notes/MarkdownCodeBlock.tsx`. Visual: bordered card → header strip (language label on the left, copy icon on the right) → horizontally-scrollable monospace body. When the fence has no language hint (test fixture 6g), the header strip collapses to a tighter mini-header with just the copy button right-aligned, so plain ``` fences don't show an empty label slot.
- Copy button uses `expo-clipboard.setStringAsync`, fires a Light haptic, swaps to a checkmark for 1.5s, then resets. Stale-timer guard cleans up across re-taps and unmount.
- Updated the `fence` rule in `markdownRules.ts` to read `node.sourceInfo` (the markdown-it fence info string, surfaced through `tokensToAST`) and render the new component.
- The indented `code_block` rule (4-space-indented code) keeps the simpler Phase-2 chrome — no language hint exists for indented blocks, so the chrome adds no value there.
- Phase 2's long-line horizontal scroll is preserved inside the new component.

**Files touched:**
- `packages/ns-mobile/src/components/notes/MarkdownCodeBlock.tsx` (new)
- `packages/ns-mobile/src/lib/markdownRules.ts`

#### Phase 5b — Actual syntax coloring (optional, can defer)

**Goal:** Match web/desktop's per-token coloring.

**Approach options:**
- `react-native-syntax-highlighter` (uses Prism or highlight.js under the hood).
- Pros: drop-in, mature lib.
- Cons: bundle size, theme matching with web/desktop's `rehype-highlight` output.

**Files:**
- Same as 5a, plus a new dependency.

**Acceptance:**
- Code-block coloring approximates web/desktop output for js/ts/python/json/bash.

---

### Phase 6 — Mermaid (deferred)

**Status:** Deferred. See architectural notes:

WebView per-block is heavy (~50–80MB memory, 200–500ms cold paint). Two viable paths:

1. **Single shared off-screen WebView** that batch-compiles each Mermaid block to SVG, captures output, then renders the SVGs natively via `react-native-svg`. One WebView paid for once per session.
2. **Server-side pre-rendering** in ns-api (Mermaid → SVG on save, sync stores the SVG, mobile renders the cached SVG). Zero mobile rendering cost; bigger architectural lift.

Punt to a separate planning doc / PR once the rest of the parity work lands and the team chooses an approach.

---

## Test Fixture

A self-contained note exercising every feature in this plan lives at:

```
docs/ns/mobile/docs/feature_planning/markdown-parity-test-fixture.md
```

Workflow: copy its contents into a new note in the app at the start of each phase to visually inspect rendering on both iOS and Android.

## Out of Scope

- Math/LaTeX (`$x^2$`)
- Footnotes (`[^1]`)
- Definition lists
- Emoji shortcodes (`:smile:`)
- Local-file indicator badge (separate parity item — covered by note-list parity, not markdown parity)
- Wiki-link autocomplete in the editor (editor feature, not rendering — tracked separately under [02 — Note Editor](02-note-editor.md))

## Dependencies

- [01 — Note List & Viewer](01-note-list-and-viewer.md) — markdown viewer is the base.
- [02 — Note Editor](02-note-editor.md) — interactive task lists need to round-trip through the editor.
- [04 — Sync Engine](04-sync-engine.md) — toggled task state needs to sync.

## Open Questions

- Should syntax-highlight coloring (Phase 5b) ship in the same PR as 5a, or in a follow-up?
- Mermaid (Phase 6): server-side render vs single shared WebView — needs decision before that work begins.
