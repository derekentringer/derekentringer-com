# 08 — Markdown Rendering Parity

**Status:** In Progress (Phase 1 pending)
**Priority:** Medium

## Summary

Close the markdown rendering gap between mobile and web/desktop. Mobile uses `react-native-markdown-display` while web/desktop use `react-markdown` + `remark-gfm` + `rehype-highlight` + `mermaid` + custom remark plugins. Several features render unstyled or as plain text on mobile today.

## Feature Gap (as of 2026-05-06)

| Feature | Web/Desktop | Mobile | Gap |
|---------|-------------|--------|-----|
| GFM Tables | `remark-gfm` + custom `InteractiveTable` | Not rendered (plain text) | **Major** |
| Syntax highlighting | `rehype-highlight` + `CodeBlock` (lang label, copy btn) | Unstyled, no language label, no copy | **Major** |
| Mermaid diagrams | `mermaid` lib, `language="mermaid"` detection | Not rendered (deferred) | **Deferred** |
| Interactive task lists | `remark-gfm` + custom `<input type="checkbox">` updating source | Plain `[ ]`/`[x]` text, not interactive | **Major** |
| Interactive Table of Contents | `TocPanel` + `rehype-slug` + heading IDs + jump-to-anchor | No ToC, no heading anchors | **Major** |
| Wiki-link styling | Custom `remarkWikiLink` + `.wiki-link` accent + dotted underline | Functional click navigation, no visual styling | **Minor** |
| Strikethrough (`~~text~~`) | `remark-gfm` | Library default — likely supported, unverified | **Verify** |
| Autolinks (bare URLs) | `remark-gfm` | Library default — unverified | **Verify** |
| Raw HTML embeds | ReactMarkdown allows HTML | Library default — likely stripped | **Verify** |
| Frontmatter | Editor folds it | `stripFrontmatter()` runs pre-render | Parity |
| Headings, bold, italic, lists, blockquotes, inline code, basic code blocks, links, images, hr | Full support | Library defaults | Parity |

**Not supported on any platform** (out of scope here): math/LaTeX, footnotes, definition lists, emoji shortcodes.

## Phased Implementation Plan

### Phase 1 — Verification + Wiki-link Visual Styling
**Effort:** ~half day

**Goal:** Confirm what works today on device for the unverified items; polish wiki-links so they look like links instead of identical to plain links.

**Tasks:**
- Build the test fixture (`markdown-parity-test-fixture.md`) into a real note and visually verify on iOS + Android:
  - Strikethrough renders with line-through
  - Bare URLs become tappable
  - Raw HTML embed: confirm whether stripped, escaped, or rendered
- Add a custom link rule in `markdownRules.ts` that detects the `#wiki:` URL scheme and styles the link with the lime accent + a dotted underline so wiki-links visually distinguish from regular links.

**Files:**
- `packages/ns-mobile/src/lib/markdownRules.ts`

**Acceptance:**
- All "verify" rows in the gap table either resolved or scoped to follow-up tickets.
- Wiki-links visually distinct from regular links in the rendered note.

---

### Phase 2 — GFM Tables
**Effort:** ~1–2 days

**Goal:** Tables render natively, scroll horizontally for overflow, match web/desktop visual style.

**Tasks:**
- Add custom rules for `table`, `thead`, `tbody`, `tr`, `th`, `td` in `markdownRules.ts`.
- Render header row with bold weight + theme `card` background; body rows with alternating subtle bg.
- Wrap the whole table in a horizontal `ScrollView` so wide tables don't overflow the viewport.
- Honor GFM column alignment (`:---`, `:---:`, `---:`).
- Possibly extract into `packages/ns-mobile/src/components/notes/MarkdownTable.tsx` if the inline rule grows complex.

**Files:**
- `packages/ns-mobile/src/lib/markdownRules.ts`
- `packages/ns-mobile/src/components/notes/MarkdownTable.tsx` (if extracted)

**Acceptance:**
- Test fixture's "Tables" section renders as styled grids.
- Wide table scrolls horizontally without overlapping note margins.
- Alignment column markers respected.

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
  - Renders the code body in a monospace font with horizontal scroll for long lines.
- Match web/desktop's `CodeBlock.tsx` visual chrome (border-radius, padding, language label position).

**Files:**
- `packages/ns-mobile/src/lib/markdownRules.ts`
- `packages/ns-mobile/src/components/notes/MarkdownCodeBlock.tsx` (extract since it grows beyond a one-liner)

**Acceptance:**
- Each code fence shows its language label.
- Copy button works.
- Long lines scroll horizontally inside the block (don't wrap).

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
