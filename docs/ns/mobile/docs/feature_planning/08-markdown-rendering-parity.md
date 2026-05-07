# 08 — Markdown Rendering Parity

**Status:** In Progress (Phase 1 complete; Phase 2 pending)
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

### Phase 2 — Wide-table & code-block horizontal scroll
**Effort:** ~half day

**Goal:** Tables and code blocks that exceed the viewport scroll horizontally instead of wrapping cell/line content.

**Context:** Simple, aligned, and inline-markdown-in-cell tables already render correctly on both iOS and Android via the library's GFM defaults — column alignment is honored, inline markdown in cells works. Code blocks render with monospace + bordered chrome. The only overflow gap is wide content wrapping instead of scrolling (visible in fixture sections 7c and 6g).

**Tasks:**
- Wrap the table rule's output in a horizontal `ScrollView` so wide tables scroll instead of wrapping cell text.
- Wrap fenced code-block bodies in a horizontal `ScrollView` so long lines scroll instead of wrapping.
- Verify GFM column alignment still works after the wrap.

**Files:**
- `packages/ns-mobile/src/lib/markdownRules.ts`

**Acceptance:**
- Fixture section 7c (wide table) scrolls horizontally instead of wrapping cell text.
- Fixture section 6g (plain code fence with intentionally long line) scrolls horizontally instead of wrapping.
- 7a/7b/7d tables and other code blocks unchanged.

---

### Phase 3 — Interactive Task Checkboxes
**Effort:** ~1 day

**Goal:** `[ ]` / `[x]` items render as tappable checkboxes that update the source markdown and persist.

**Tasks:**
- Add a custom `list_item` rule that detects `[ ]` / `[x]` prefix and renders a `Pressable` checkbox + the rest of the line as the label.
- New utility `packages/ns-mobile/src/lib/toggleTask.ts` that takes the note content + the index of the checkbox and returns content with that line's checkbox flipped.
- Wire `onPress` in the rule → call back into `NoteDetailScreen` → update note via existing save path.
- Handle nesting (task items inside other lists) and mixed lists (some plain, some task).

**Files:**
- `packages/ns-mobile/src/lib/markdownRules.ts`
- `packages/ns-mobile/src/lib/toggleTask.ts`
- `packages/ns-mobile/src/screens/NoteDetailScreen.tsx`

**Tests:**
- Unit tests for `toggleTask` covering: simple toggle, nested task, multiple tasks on the same line index.
- Manual: tap a checkbox in the test fixture → see it flip → close + reopen note → persists.

**Acceptance:**
- Tapping a task checkbox toggles its state instantly and saves to the note.
- Sync still works (toggled state propagates to web/desktop).

---

### Phase 4 — Interactive Table of Contents
**Effort:** ~1–2 days

**Goal:** A bottom-sheet ToC button in the header that lists all headings and jumps the scroll position to the chosen heading.

**Tasks:**
- New `packages/ns-mobile/src/lib/extractHeadings.ts` (port the parsing logic from `packages/ns-web/src/lib/extractHeadings.ts`).
- New `packages/ns-mobile/src/components/notes/TocSheet.tsx` mirroring the web `TocPanel` — list of headings indented by level, tap to jump.
- In `NoteDetailScreen`:
  - Capture each heading's Y position via `onLayout` on a custom heading rule, keyed by heading index.
  - Add a ToC icon to the header right (consistent with the recent header-icon work).
  - On heading tap, scroll the outer `ScrollView` to the captured Y offset.

**Files:**
- `packages/ns-mobile/src/lib/extractHeadings.ts`
- `packages/ns-mobile/src/components/notes/TocSheet.tsx`
- `packages/ns-mobile/src/lib/markdownRules.ts` (heading rule with `onLayout` capture)
- `packages/ns-mobile/src/screens/NoteDetailScreen.tsx`

**Tests:**
- Unit tests for `extractHeadings`: respects depth, skips fenced-code-fence headings, skips frontmatter-region matches.
- Manual: open the test fixture, tap the ToC button → see all H1–H6 entries indented by depth → tap one → note scrolls to it.

**Acceptance:**
- ToC button visible in header.
- All headings extracted in order.
- Tapping a heading scrolls to within ~10pt of the heading's top.

---

### Phase 5 — Syntax Highlighting (split into two sub-phases)
**Effort:** ~1 day for 5a, ~1–2 days for 5b

#### Phase 5a — Code-block chrome (no real coloring)

**Goal:** Code fences look like code blocks — monospace font, theme-aware bg, language label, copy-to-clipboard button — but glyphs are still single-colored.

**Tasks:**
- Custom `fence` rule in `markdownRules.ts` that:
  - Reads the language hint after the opening fence.
  - Renders a header strip with the language name and a copy button (`expo-clipboard`).
  - Renders the code body in a monospace font (Phase 2 already handled long-line horizontal scroll).
- Match web/desktop's `CodeBlock.tsx` visual chrome (border-radius, padding, language label position).

**Files:**
- `packages/ns-mobile/src/lib/markdownRules.ts`
- `packages/ns-mobile/src/components/notes/MarkdownCodeBlock.tsx` (extract since it grows beyond a one-liner)

**Acceptance:**
- Each code fence shows its language label.
- Copy button works.

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
