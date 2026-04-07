# 25 — Navigation & Layout Improvements (Obsidian-Inspired)

**Status:** Phases 1-5 Complete, Phase 5 (Live Preview) Sub-phases 5a–5h Complete, Phase 5i and 6-7 Planned
**Phase:** UI Enhancement
**Priority:** Medium
**Completed Phases:** Sidebar Tabs, Ribbon, Note List Panel, Rich Note Rows, Audio Recording Refactor, Live Preview 5a (Inline Formatting + Headings + HR), Live Preview 5c (Links + Wiki-Links), Live Preview 5d (Images), Live Preview 5e (Lists + Checkboxes), Live Preview 5f (Code Blocks), Live Preview 5g (Blockquotes), Live Preview 5h (Tables + Auto-Format), Toolbar Formatting Buttons (all markdown types)

## Context

NoteSync currently uses a single-column sidebar layout: search → favorites → folder tree → (resize divider) → note list → footer. All of these are stacked vertically in one `<aside>` element. The folder tree and note list share the same column with a horizontal resize divider between them, meaning both compete for vertical space.

Obsidian uses a more structured approach with two distinct navigation elements:
1. **Sidebar tabs** — icons at the top of the sidebar panel that switch the sidebar content between views (File Explorer, Search, Bookmarks, Tags). These are part of the sidebar and hide when the sidebar is collapsed.
2. **Ribbon** — a narrow always-visible vertical strip on the far left edge with utility actions (vault switcher, help, settings). This stays visible even when the sidebar is collapsed.

Additionally, the popular three-column layout pattern (visible in Obsidian with the Notebook Navigator plugin and in apps like Bear and Apple Notes) places a **separate note list panel** between the sidebar and editor — giving folders and notes each their own full-height column.

This plan proposes incremental improvements inspired by these patterns — not a wholesale copy, but targeted changes that would make NoteSync's navigation more powerful while preserving its existing identity.

## Current NoteSync Layout

```
┌─────────────────────────────────────────────────────────────┐
│ NoteSync               [Audio] [+]                          │
├───────────────────────────┬─────────────────────────────────┤
│ [Search input... ⌘K]     │                                  │
│ [Tag browser (expandable)]│                                  │
│ ─── Favorites ───        │                                  │
│ ★ Folder A               │  Tab Bar                         │
│ ★ Note X                 │  ─────────────────────────       │
│ ─── Folders ───          │  Toolbar (status, dates, actions)│
│ ▶ All Notes (42)         │  ─────────────────────────       │
│ ▶ Folder A (5)           │  [Folder] Title input            │
│   ▶ Subfolder (2)        │  [Tags]                          │
│ ▶ Folder B (8)           │  ─────────────────────────       │
│ ▶ Unfiled (3)            │  Editor / Split / Preview        │
│ ═══ resize divider ═══   │                                  │
│ Notes          [sort] [+]│                                  │
│ ● Note title 1           │                                  │
│   Note title 2           │                                  │
│   Note title 3           │                                  │
├───────────────────────────┤                                  │
│ [Sync][Trash][Import]    │                     [QA][History] │
│ [Settings][Admin] [Out]  │                     [TOC]         │
└───────────────────────────┴─────────────────────────────────┘
```

**Key limitations:**
1. Folder tree and note list share one column — expanding folders squeezes the note list
2. No way to see the full note list while browsing folders simultaneously
3. Search, tags, favorites, folders, and notes all stacked vertically — visual clutter
4. Sidebar view switching is limited to notes/trash toggle
5. Preview mode is read-only — no inline editing

## Proposed Layout

```
┌──┬──────────────┬──────────────────┬───────────────────────────────┐
│  │ Sidebar Tabs │                  │                               │
│+ │ [📁][🔍][⭐][🏷] │                  │                               │
│  │──────────────│                  │                               │
│R │              │  Note List Panel │  Editor                       │
│I │ Sidebar      │  ──────────────  │                               │
│B │ Content      │  [filter...]     │  Tab Bar                      │
│B │ (full        │  Note 1      ★   │  Toolbar                      │
│O │  height,     │  snippet...      │  Title                        │
│N │  switches    │  Jan 13 · [tag]  │  Content                      │
│  │  by tab)     │  ──────────────  │                               │
│──│              │  Note 2          │                               │
│🎙│              │  snippet...      │                               │
│🔄│              │  Jan 12 · [tag]  │                               │
│🗑│              │  ──────────────  │                      [QA][Hst]│
│⚙ │              │  Note 3          │                      [TOC]    │
│👤│              │  snippet...      │                               │
└──┴──────────────┴──────────────────┴───────────────────────────────┘

During recording — floating indicator bar (non-blocking):
┌──┬──────────────┬──────────────────┬───────────────────────────────┐
│  │ Sidebar Tabs │                  │                               │
│+ │ [📁][🔍][⭐][🏷] │                  │                               │
│  │──────────────│                  │                               │
│R │              │  Note List Panel │  Editor                       │
│I │ Sidebar      │  ──────────────  │  (user can continue editing   │
│B │ Content      │  [filter...]     │   and browsing while          │
│B │ (unchanged   │  Note 1      ★   │   recording)                  │
│O │  — user can  │  snippet...      │                               │
│N │  browse/edit)│  Jan 13 · [tag]  │                               │
│  │              │  ──────────────  │                               │
│──│              │  Note 2          │                               │
│🎙│              │  snippet...      │                               │
│🔄├──────────────┴──────────────────┴───────────────────────────────┤
│🗑│ 🔴 Recording 2:34  ▁▂▃▅▃▂▁▃▅▇▅▃▂▁  Meeting · Memo  [■ Stop]  │
│⚙ ├──────────────┬──────────────────┬───────────────────────────────┤
│👤│              │                  │                               │
└──┴──────────────┴──────────────────┴───────────────────────────────┘
```

**Key distinction — two separate UI elements:**

- **Sidebar tabs** (top of sidebar panel) — switch sidebar content between File Explorer, Search, Favorites, and Tags. Part of the sidebar; collapse with it.
- **Ribbon** (far-left edge, always visible) — utility actions: Sync, Trash, Settings, Admin, Sign out. Stays visible even when sidebar is collapsed or in focus mode. Provides quick access to common actions without needing the sidebar open.

---

## Phase 1: Sidebar Tabs & View Switching

**Goal:** Replace the current vertically-stacked sidebar with tabbed views, so only one panel shows at a time.

### Design

Add a horizontal tab bar at the top of the existing sidebar with four icons:

| Tab | Icon | Content |
|---|---|---|
| File Explorer | Folder icon | FolderTree (full height, no note list) |
| Search | Magnifying glass | Search input + mode selector + tag browser + search results |
| Favorites | Star icon | FavoritesPanel (full height — favorite folders and notes) |
| Tags | Tag icon | TagBrowser (full height, expanded with counts) |

**Behavior:**
- Clicking a tab switches the sidebar content to that view
- Active tab gets an accent-colored bottom border or background highlight
- Only one view visible at a time — full height for the active view
- `sidebarPanel` state: `"explorer" | "search" | "favorites" | "tags"`
- Persisted in localStorage (`ns-sidebar-panel`)
- Sidebar title row ("NoteSync" + action buttons) stays above tabs

**State changes:**
- Selecting a folder in File Explorer tab → filters notes in the note list (once Phase 2 is done, the note list is a separate panel; until then, note list remains below in sidebar)
- Selecting a tag in Tags tab → filters notes in note list
- Global search in Search tab → replaces note list with search results
- Favorites tab → shows favorite folders and notes, clicking navigates

### Files

**New:**
- `packages/ns-web/src/components/SidebarTabs.tsx` — tab bar component with four icons

**Modified:**
- `packages/ns-web/src/pages/NotesPage.tsx` — add `sidebarPanel` state, conditionally render sidebar content based on active tab, remove stacked layout
- `packages/ns-desktop/src/pages/NotesPage.tsx` — mirror

### Steps

1. Create `SidebarTabs.tsx` — horizontal row of four icon buttons with active indicator
2. Add `sidebarPanel` state to NotesPage
3. Refactor sidebar content into conditional blocks based on `sidebarPanel`
4. Move search input/tag browser into the `"search"` panel
5. Move FavoritesPanel into the `"favorites"` panel
6. FolderTree gets full height in the `"explorer"` panel (note list stays below for now — extracted in Phase 2)
7. TagBrowser gets full height in the `"tags"` panel
8. Persist active tab in localStorage
9. Mirror to ns-desktop
10. Tests for SidebarTabs

### Verification

- All four tabs switch correctly
- Folder selection, tag filtering, search, and favorites navigation all work
- Active tab indicator shows correctly
- Tab persists across page refreshes
- Desktop matches web

---

## Phase 2: Ribbon (Always-Visible Utility Strip)

**Goal:** Move utility/footer actions into a narrow always-visible ribbon on the far left edge.

### Design

A ~40px-wide vertical strip at the far left of the window containing utility action icons. This is **not** for view switching (that's the sidebar tabs) — it's for actions that should be accessible even when the sidebar is collapsed.

**Ribbon icons (top to bottom):**

| Position | Icon | Action |
|---|---|---|
| Top | New note (+) | Create new note |
| — | spacer | — |
| Bottom | Sync status | Manual sync (with status indicator) |
| Bottom | Trash | Switch to trash view (with count badge) |
| Bottom | Import | Import files |
| Bottom | Settings | Navigate to settings |
| Bottom | Admin | Navigate to admin (if admin role) |
| Bottom | Sign out | Log out |

**Behavior:**
- Ribbon stays visible even when sidebar is collapsed or in focus mode
- Icons are small (16px) with tooltips
- Sync status icon reflects current sync state (syncing, error, idle)
- Trash badge shows count of trashed items

**Audio Recorder — Non-Blocking Floating Bar Design:**

The current AudioRecorder takes over the sidebar header during recording, blocking all navigation. The new design makes recording fully non-blocking — users can browse, create, and edit notes while a recording is in progress.

**Idle state — mic icon in ribbon:**
- Small microphone icon in the ribbon (bottom section, above sync)
- Clicking opens a dropdown popover (anchored to the icon) with mode selector (Meeting/Lecture/Memo/Verbatim) and source selector (Microphone/Meeting mode on desktop)
- Selecting a mode + clicking "Record" starts recording and dismisses the popover
- No sidebar space used in idle state

**Recording state — floating indicator bar:**
- A thin horizontal bar appears **pinned to the bottom of the window**, spanning the full width below the sidebar + note list + editor
- Height: ~36-40px
- Contents (left to right):
  - Red pulsing dot + "Recording" label
  - Elapsed time (`2:34`)
  - **Real-time audio waveform visualization** (animated bars or waveform showing live audio levels)
  - Mode label (e.g., "Memo") + source label if desktop (e.g., "Meeting mode")
  - Stop button (■ square icon)
- The bar does NOT overlap or displace any existing UI — it adds height at the bottom
- All sidebar tabs, note list, and editor remain fully interactive
- The ribbon mic icon changes to a red recording indicator (pulsing dot) so users can see recording status even at a glance
- Keyboard shortcut to stop recording (registered in the command system from feature plan 24)

**Real-time audio visualization:**
- Web: Use `AnalyserNode` from the Web Audio API connected to the `MediaStream`. Call `getByteFrequencyData()` on `requestAnimationFrame` to get frequency bin amplitudes. Render as animated vertical bars (8-16 bars) or a waveform line in a small `<canvas>` element (~120x24px).
- Desktop (microphone mode): Same Web Audio API approach via the WebView's `MediaRecorder` stream.
- Desktop (meeting mode): The Rust `audio_capture.rs` already captures audio via CoreAudio. Emit audio level data alongside the existing `meeting-recording-tick` event (e.g., add an RMS amplitude float to the tick payload). The frontend listens and renders the same bar visualization.
- Visualization should be lightweight — only update at ~15-20fps to avoid performance impact.

**Processing state — same floating bar, different content:**
- Bar stays at the bottom
- Shows: spinner + "Processing transcription..." + elapsed processing time
- Still non-blocking — user can continue working
- When processing completes: bar dismisses, new note appears in the note list (existing `onNoteCreated` behavior)
- Optional: brief success toast ("Audio note created") before bar dismisses

**When sidebar is collapsed or in focus mode:**
- Floating bar remains visible (it's at the window bottom, independent of sidebar)
- Ribbon mic icon shows red recording indicator
- User can stop recording from the floating bar without opening the sidebar

### Files

**New:**
- `packages/ns-web/src/components/Ribbon.tsx` — vertical utility strip
- `packages/ns-web/src/components/RecordingBar.tsx` — floating bottom bar for recording/processing state with waveform visualization
- `packages/ns-web/src/components/AudioWaveform.tsx` — canvas-based real-time audio level visualization
- `packages/ns-desktop/src/components/Ribbon.tsx` — mirror
- `packages/ns-desktop/src/components/RecordingBar.tsx` — mirror
- `packages/ns-desktop/src/components/AudioWaveform.tsx` — mirror

**Modified:**
- `packages/ns-web/src/components/AudioRecorder.tsx` — refactor: idle state becomes a ribbon icon with popover; recording/processing state delegates to RecordingBar; add Web Audio API `AnalyserNode` for real-time audio levels
- `packages/ns-web/src/pages/NotesPage.tsx` — add Ribbon to layout, add RecordingBar at bottom, remove footer action buttons from sidebar, remove "NoteSync" title, update focus mode to keep ribbon + RecordingBar visible
- `packages/ns-desktop/src/components/AudioRecorder.tsx` — mirror; extend meeting-recording-tick event with audio level data
- `packages/ns-desktop/src/pages/NotesPage.tsx` — mirror
- `packages/ns-desktop/src-tauri/src/audio_capture.rs` — add RMS amplitude to tick event payload (for waveform visualization in meeting recording mode)

### Steps

1. Create `Ribbon.tsx` — flex column with justify-between (top actions, bottom actions)
2. Move sync, trash, import, settings, admin, sign out buttons from sidebar footer to ribbon
3. Move new note (+) button from sidebar header to ribbon top
4. Move AudioRecorder idle state to ribbon (mic icon with dropdown popover for mode/source selection)
5. Create `RecordingBar.tsx` — floating bottom bar for recording/processing states with stop button, elapsed time, mode label
6. Remove "NoteSync" title from sidebar header (ribbon + sidebar tabs replace the need for it)
7. Update NotesPage layout: `[Ribbon] [Sidebar] [Divider] [Editor]` + `[RecordingBar]` at bottom when recording
8. Update focus mode: sidebar collapses to 0 width but ribbon remains visible; RecordingBar remains visible
9. Mirror to ns-desktop
10. Tests for Ribbon and RecordingBar

### Verification

- All action buttons work from ribbon (sync, trash, settings, new note, etc.)
- Ribbon stays visible when sidebar is collapsed
- Ribbon stays visible in focus mode
- Trash badge shows correct count
- Sync status reflects current state
- **Audio idle:** Mic icon in ribbon opens mode/source popover, clicking Record starts recording
- **Audio recording:** Floating bar appears at bottom with red dot, elapsed time, waveform visualization, stop button
- **Audio recording is non-blocking:** User can switch sidebar tabs, browse folders, select notes, edit notes, create new notes — all while recording continues
- **Audio waveform:** Real-time animated bars respond to actual audio input levels
- **Audio processing:** Bar shows spinner + "Processing..." after stop; dismisses when transcription completes
- **Audio on desktop meeting mode:** Waveform reflects Rust-side audio levels via tick event
- RecordingBar visible even when sidebar collapsed or in focus mode
- Desktop matches web

---

## Phase 3: Separate Note List Panel

**Goal:** Extract the note list from the sidebar into its own resizable panel, creating the three-column layout.

### Design

```
[Ribbon 40px] [Sidebar ~220px] [Divider] [Note List ~280px] [Divider] [Editor flex-1]
```

The note list becomes an independent panel between the sidebar and editor.

**Note list panel contents:**
- **Header:** "Notes" label + sort controls + new note button
- **Filter input:** Quick filter for notes within current folder context (local, no API call)
- **Note rows:** Full note list with selection, drag-reorder, context menu
- **Resizable:** separate `useResizable` instance, default 280px, min 200px, max 400px, stored as `ns-notelist-width`

**How the two searches work:**
- **Note list filter** (input in note list panel): Client-side filter of the currently loaded notes. Filters by title match within the active folder. Fast, instant, no API call.
- **Global search** (Search tab in sidebar, or Cmd+Shift+F): Full-text/semantic search across all notes via API. Results replace the note list contents. When global search is active, the note list filter is hidden and the panel header shows "Search Results" instead of "Notes".

**Interaction flow:**
- Select folder in sidebar → note list shows notes in that folder
- Select tag in sidebar → note list filters to notes with that tag
- Activate global search → note list shows search results (folder/tag context cleared)
- Clear global search → note list returns to folder/tag-filtered view

### Files

**New:**
- `packages/ns-web/src/components/NoteListPanel.tsx` — self-contained panel with filter, sort, note list

**Modified:**
- `packages/ns-web/src/pages/NotesPage.tsx` — extract note list from sidebar, add NoteListPanel to layout, add new resize divider, update focus mode to hide both sidebar and note list panel
- `packages/ns-web/src/hooks/useResizable.ts` — no changes needed (already generic)
- `packages/ns-desktop/src/pages/NotesPage.tsx` — mirror

### Steps

1. Create `NoteListPanel.tsx` — contains filter input, sort controls, NoteList, and "new note" button
2. Add `noteListResize` useResizable instance (280px default, 200-400px range, `ns-notelist-width` key)
3. Restructure NotesPage layout to four zones: ribbon, sidebar, note list panel, editor
4. Add resize divider between sidebar and note list panel
5. Add filter input to note list panel header (client-side title filtering)
6. Wire folder selection → note list filtering
7. Wire tag selection → note list filtering
8. Wire global search → note list results replacement
9. Update focus mode to hide sidebar + note list panel (ribbon stays)
10. Maintain existing note selection, tab opening, drag-reorder, context menu behavior
11. Mirror to ns-desktop
12. Tests

### Verification

- Three-column layout renders correctly
- Notes filter by selected folder
- Notes filter by selected tag
- Global search replaces note list with results
- Clearing search restores folder/tag filter
- Note list filter works (client-side title match)
- Drag-reorder works in note list
- Note selection, tab opening, double-click all work
- Both resize dividers work independently
- Focus mode hides sidebar + note list, keeps ribbon
- Desktop matches web

---

## Phase 4: Richer Note List Rows

**Goal:** Show more context per note — title, content preview, date, folder, tags.

### Design

**Enhanced note row:**
```
┌─────────────────────────────────┐
│ Note Title                    ★ │
│ First line of content preview...│
│ Jan 13, 2026  📁 Folder  [tag] │
└─────────────────────────────────┘
```

**Fields per row:**
- **Title** (font-medium) — with favorite star icon on right
- **Preview snippet** — first ~80 characters of content, markdown stripped, `text-muted-foreground text-xs`
- **Metadata line** — relative date or short date, folder name pill, up to 2 tag pills, `text-[11px] text-muted-foreground`
- **Search highlight** — when filtering/searching, matching terms highlighted with accent background in title and snippet

**Compact mode:**
- Settings toggle: compact (title only, current behavior) vs. expanded (full row)
- Default: expanded
- Stored in localStorage: `ns-notelist-compact`

**Content preview generation:**
- Strip markdown syntax (headers `#`, bold `**`, links `[]()`, etc.) from first ~100 chars
- Truncate to ~80 visible characters with ellipsis
- Computed client-side from `note.content`

### Files

**New:**
- `packages/ns-web/src/components/NoteRow.tsx` — multi-line note row component
- `packages/ns-web/src/lib/stripMarkdown.ts` — utility to strip markdown for preview snippets

**Modified:**
- `packages/ns-web/src/components/NoteList.tsx` — use NoteRow instead of current inline row rendering
- `packages/ns-web/src/pages/SettingsPage.tsx` — add compact/expanded toggle
- `packages/ns-desktop/src/components/NoteRow.tsx` — mirror
- `packages/ns-desktop/src/components/NoteList.tsx` — mirror

### Steps

1. Create `stripMarkdown.ts` — regex-based markdown stripping for snippets
2. Create `NoteRow.tsx` — renders title, snippet, metadata, favorite star, tags
3. Add search term highlighting (wrap matches in `<mark>` with accent background)
4. Update NoteList to use NoteRow
5. Add compact/expanded setting with localStorage persistence
6. Mirror to ns-desktop
7. Tests for stripMarkdown and NoteRow

### Verification

- Expanded rows show title, snippet, date, folder, tags
- Compact mode shows title only (current behavior)
- Search highlighting works in both title and snippet
- Favorite star displays and toggles correctly
- Tags render as small pills
- Long titles and snippets truncate with ellipsis
- Performance acceptable with 500+ notes
- Desktop matches web

---

## Phase 5: Live Preview Editor Mode

**Goal:** Add Obsidian-style inline markdown rendering where non-active lines show formatted output and the active line shows raw markdown.

### Technical Background

This is the most complex feature in this plan. It requires deep integration with CodeMirror 6's decoration system. The research below informs the implementation approach.

#### How It Works

CodeMirror 6 `Decoration.replace()` hides markdown syntax (e.g., the `**` around bold text) and optionally inserts rendered widgets in their place. A `ViewPlugin` tracks which line the cursor is on and excludes that line from decorations, showing raw markdown instead. Every selection change triggers a decoration rebuild for affected lines.

#### Existing CM6 Patterns in NoteSync

NoteSync already uses the relevant CodeMirror 6 patterns that Live Preview builds on:

- **`ghostText.ts`**: `StateField` + `Decoration.widget()` + `WidgetType` with `eq()` + `EditorView.decorations.compute()`. This is the closest reference — it creates inline widget decorations, manages state via effects, and handles lifecycle.
- **`rewriteMenu.ts`**: `StateField` + `StateEffect` + `showTooltip.computeN()` + `ViewPlugin` + `Facet`. Demonstrates stateful UI overlays and complex effect handling.
- **`MarkdownEditor.tsx`**: Uses `Compartment` for dynamic reconfiguration, custom themes via `EditorView.theme()`, and `EditorView.updateListener` for change tracking.

#### CM6 Dependencies Already Installed

```
@codemirror/autocomplete: ^6.18.0
@codemirror/commands: ^6.10.2
@codemirror/lang-markdown: ^6.5.0
@codemirror/language-data: ^6.5.2
@codemirror/state: ^6.5.4
@codemirror/view: ^6.39.16
@lezer/highlight: ^1.2.3
```

The `@codemirror/lang-markdown` package provides access to the Lezer markdown parse tree via `syntaxTree()`, which is essential for knowing which markdown elements to decorate.

#### Core Architecture: ViewPlugin + Decoration.replace() + atomicRanges

```typescript
class LivePreviewPlugin {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.selectionSet || update.viewportChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  buildDecorations(view: EditorView): DecorationSet {
    const tree = syntaxTree(view.state);
    const activeLines = this.getActiveLines(view);
    const decorations: Range<Decoration>[] = [];

    tree.iterate({
      enter: (node) => {
        const line = view.state.doc.lineAt(node.from);
        if (activeLines.has(line.number)) return; // skip active line
        // ... create decorations based on node type
      }
    });

    return Decoration.set(decorations, true);
  }

  getActiveLines(view: EditorView): Set<number> {
    const active = new Set<number>();
    for (const range of view.state.selection.ranges) {
      const line = view.state.doc.lineAt(range.head);
      active.add(line.number);
    }
    return active;
  }
}

const livePreview: Extension = ViewPlugin.fromClass(LivePreviewPlugin, {
  decorations: (v) => v.decorations,
  provide: (plugin) => EditorView.atomicRanges.of((view) => {
    return view.plugin(plugin)?.decorations ?? Decoration.none;
  })
});
```

#### Critical: `EditorView.atomicRanges`

`Decoration.replace()` hides text but does NOT prevent the cursor from entering the hidden range. Without `atomicRanges`, arrow keys stop inside hidden syntax (e.g., between the two `*` in `**bold**`), creating invisible cursor positions. `atomicRanges` makes the cursor skip entire replaced ranges, treating them as atomic units.

#### Critical: `WidgetType.eq()`

Every custom `WidgetType` subclass MUST implement `eq()`. Without it, the widget DOM is destroyed and recreated on every update, which:
- Breaks click handling (widget disappears during focus change, requiring two clicks)
- Causes visual flicker
- Hurts performance

```typescript
class BoldWidget extends WidgetType {
  constructor(readonly text: string) { super(); }
  eq(other: BoldWidget) { return this.text === other.text; }
  toDOM() {
    const span = document.createElement("strong");
    span.textContent = this.text;
    return span;
  }
}
```

#### Reference Implementations

- **codemirror-live-markdown** (github.com/blueberrycongee/codemirror-live-markdown) — modular, pure CM6, actively developed. Closest to what we want. Uses `mouseSelectingField` tracking for proper click behavior.
- **codemirror-rich-markdoc** (github.com/segphault/codemirror-rich-markdoc) — two-tier approach: mark decorations for inline elements (bold, italic, headings), block widgets for complex elements (tables, blockquotes). Good pattern.
- **Obsidian** — uses CM6 internally with a subset of HyperMD components. Proprietary but well-tested.

### Known Pitfalls (Must Address)

#### 1. Cursor Jumping (Severity: HIGH)

When decorations rebuild on selection change, cursor position can shift if ranges change size. Users report this as the #1 frustration with Live Preview implementations.

**Mitigation:**
- Use `Transaction.mapPos()` to preserve cursor through changes
- Cache previous decoration set; only rebuild lines that actually changed
- Use `RangeSet.map()` for incremental updates instead of full rebuilds
- Test cursor stability obsessively after every sub-phase

#### 2. Selection Across Boundaries (Severity: MEDIUM)

Selecting from raw markdown (active line) into rendered text (inactive line) produces visual mismatches — the selection highlight doesn't align with the visual layout.

**Mitigation:**
- Accept this as inherent to the approach (Obsidian has the same behavior)
- Ensure copy/paste still works correctly (copies source markdown)
- Test multi-line selections thoroughly

#### 3. Widget Click Handling (Severity: HIGH)

Widgets that don't implement `eq()` are destroyed and recreated on editor state changes. Clicking a widget triggers a state change → widget recreated → click event lost → requires two clicks.

**Mitigation:**
- Implement `eq()` on ALL widget types
- Use `mouseSelectingField` pattern from codemirror-live-markdown — track mouse state to prevent decoration rebuilds during click

#### 4. Performance with Large Documents (Severity: MEDIUM)

Rebuilding all decorations on every selection change is O(N). For a 10,000-line document, this can cause typing lag.

**Mitigation:**
- Viewport-aware rendering: only decorate visible lines (`view.viewport.from` to `view.viewport.to`)
- Cache decoration sets and diff against previous state
- Profile with DevTools; target <100ms for decoration computation

#### 5. Link Click vs. Edit Ambiguity (Severity: MEDIUM)

In rendered text, clicking a link should follow it. But clicking also moves the cursor, which reveals raw markdown on that line. These conflict.

**Mitigation:**
- Rendered links get a click handler that calls `onWikiLinkClick()` before the cursor moves
- Use `event.preventDefault()` on link clicks to prevent cursor placement
- Non-link text clicks just move cursor (reveals raw markdown on that line)

#### 6. Multi-Line Blocks (Severity: MEDIUM)

Code blocks, tables, and blockquotes span multiple lines. When cursor enters one line of a code block, should the entire block reveal as raw markdown?

**Mitigation:**
- Start with line-level reveal (simpler, fewer layout shifts)
- Use Lezer parse tree to detect block boundaries (`resolveInner()` + walk to block parent)
- Extend to block-level reveal in a polish pass if UX demands it

### Implementation Sub-Phases

Live Preview is too large for a single phase. Break into incremental sub-phases, each independently testable:

#### 5a: Inline Formatting (Bold, Italic, Strikethrough, Inline Code)

**Estimated effort:** 2-3 days

The simplest starting point. These are single-line, well-bounded elements.

1. Create `packages/ns-web/src/editor/livePreview.ts`
2. Implement `ViewPlugin` with `buildDecorations()` using `syntaxTree()`
3. For `Emphasis` nodes: `Decoration.replace()` the `*`/`_` markers, `Decoration.mark()` to style the text (bold/italic)
4. For `StrongEmphasis`: same pattern with `**` markers
5. For `Strikethrough`: hide `~~`, apply strikethrough CSS
6. For `InlineCode`: hide backticks, apply code styling
7. Track active lines — skip decorations on cursor line
8. Wire `atomicRanges` to prevent cursor entering hidden markers
9. Add `"live"` to `ViewMode` type in `EditorToolbar.tsx`
10. Add compartment in `MarkdownEditor.tsx` to toggle live preview extension on/off based on view mode
11. Test: cursor movement, typing, undo/redo, selection, copy/paste

#### 5b: Headings

**Estimated effort:** 1-2 days

1. For `ATXHeading` nodes: `Decoration.replace()` the `#` markers and trailing space
2. `Decoration.mark()` to apply heading-level font size (h1-h6)
3. Heading text stays editable on the active line
4. Test: cursor at start of heading (must reveal `#` markers), typing new headings

#### 5c: Links and Wiki-Links

**Estimated effort:** 3-4 days (includes click handling complexity)

1. For `Link` nodes: replace `[text](url)` with a styled `<a>` widget showing just `text`
2. For wiki-links (`[[note title]]`): replace with styled link widget
3. Widget click handler: follow link (call `onWikiLinkClick`) with `preventDefault` to avoid cursor placement
4. Active line reveals full markdown syntax
5. Implement `eq()` on link widgets
6. Test: clicking links navigates, cursor on link line reveals syntax, typing new links, broken links

#### 5d: Images

**Estimated effort:** 2-3 days

1. For `Image` nodes: replace `![alt](url)` with rendered `<img>` widget
2. Load images asynchronously with placeholder while loading
3. Error fallback: show broken image icon + alt text
4. Active line reveals markdown syntax (image disappears, raw text shown)
5. Implement `eq()` — compare by URL to avoid reload flicker
6. Test: image rendering, slow loading, broken URLs, cursor on image line

#### 5e: Lists and Checkboxes

**Estimated effort:** 2-3 days

1. For `BulletList`/`OrderedList` items: `Decoration.mark()` to style markers (replace `-` with `•`, style numbers)
2. For task list items (`- [ ]`/`- [x]`): replace checkbox syntax with clickable checkbox widget
3. Checkbox click toggles `[ ]`/`[x]` in source (use existing `toggleCheckbox.ts` logic)
4. Nested lists: use parse tree depth for indentation
5. Start with line-level reveal; consider block-level for nested lists
6. Test: cursor in list items, adding new items, toggling checkboxes, nested lists

#### 5f: Code Blocks

**Estimated effort:** 3-4 days

1. For `FencedCode` nodes: replace entire block with rendered widget showing syntax-highlighted code
2. Block widget with language label
3. Active line behavior: reveal entire block (block-level, not line-level) since partial reveal makes no sense for code
4. Use Lezer parse tree `resolveInner()` to detect cursor inside code block
5. Implement `eq()` comparing code content + language
6. Test: entering/exiting code blocks, syntax highlighting, copy from code blocks

#### 5g: Blockquotes

**Estimated effort:** 1-2 days

1. For `Blockquote` nodes: `Decoration.mark()` to style with left border + background
2. Hide `>` markers with `Decoration.replace()`
3. Block-level reveal when cursor enters any line of the blockquote
4. Test: nested blockquotes, cursor entry/exit, editing within blockquotes

#### 5h: Tables

**Estimated effort:** 4-5 days (most complex element)

1. For `Table` nodes: replace entire table markdown with rendered HTML `<table>` block widget
2. Render cells with proper alignment, borders, header styling
3. Click in table widget: reveal raw markdown (block-level reveal)
4. Source position mapping: store row/column positions in widget metadata for approximate cursor placement
5. Implement `eq()` comparing table content hash
6. Test: small tables, large tables, editing cells, adding rows/columns, cursor placement after exiting

#### 5i: Polish and Integration

**Estimated effort:** 3-5 days

1. Performance profiling with large documents (1000+ lines)
2. Viewport optimization: only decorate visible lines
3. Smooth transitions when cursor moves between lines (minimize layout shifts)
4. Ensure all existing editor features work: ghost text, rewrite menu, wiki-link autocomplete, image upload
5. Theme integration: decorations respect dark/light theme and accent colors
6. Accessibility: ARIA labels on widgets, screen reader testing
7. Cross-browser testing (Chrome, Firefox, Safari)
8. Mirror entire `livePreview.ts` to ns-desktop
9. Comprehensive test suite

### Files

**New:**
- `packages/ns-web/src/editor/livePreview.ts` — main extension (ViewPlugin, decorations, widgets)
- `packages/ns-web/src/editor/livePreview.test.ts` — tests
- `packages/ns-desktop/src/editor/livePreview.ts` — mirror

**Modified:**
- `packages/ns-web/src/components/EditorToolbar.tsx` — add "Live" mode option to ViewMode
- `packages/ns-web/src/components/MarkdownEditor.tsx` — add compartment for live preview extension, toggle based on view mode
- `packages/ns-web/src/pages/NotesPage.tsx` — pass view mode to editor, handle live preview state
- `packages/ns-web/src/pages/SettingsPage.tsx` — add "Live" to default view mode options
- Desktop mirrors of all modified files

### Verification

- **Cursor stability:** No jumping when typing, navigating with arrow keys, or clicking
- **Active line:** Raw markdown shows on cursor line; all other lines rendered
- **Element coverage:** Bold, italic, strikethrough, code, headings, links, images, lists, checkboxes, code blocks, blockquotes, tables all render correctly
- **Interaction:** Links clickable, checkboxes toggleable, images display
- **Coexistence:** Ghost text, rewrite menu, wiki-link autocomplete all work alongside live preview
- **Performance:** No visible lag on documents up to 5000 lines
- **Copy/paste:** Copies source markdown (not rendered text)
- **Undo/redo:** Works correctly, no corruption
- **Themes:** Renders correctly in both dark and light themes
- **Type check, tests, build all pass**

---

## Phase 6: Preview Mode Click-to-Edit

**Goal:** Make Preview mode less of a dead end — clicking in the rendered preview transitions to editing.

### Technical Background

The core challenge is **source mapping** — mapping a click position in rendered HTML back to a line/column in the source markdown. This is not reliably solvable for all elements because:

- Simple elements (paragraphs, headings) have a clean 1:1 line mapping
- Complex elements (table cells, nested lists, rendered math) have no direct positional correspondence
- The rendered HTML DOM structure differs from the source line structure

### Approach: Double-Click to Switch (Reliable)

Rather than attempting full bidirectional source mapping, implement a simpler and more reliable pattern:

**Double-click in Preview mode:**
1. Detect the clicked DOM element in `MarkdownPreview`
2. Walk up the DOM to find the nearest element with a source position (headings have `id` via `rehype-slug`, paragraphs are sequential)
3. Determine the approximate source line number
4. Switch `viewMode` to `"editor"` (or `"live"` if Live Preview is available)
5. Scroll the editor to the target line via `editorRef.current.scrollToLine(lineNumber)`
6. Focus the editor

**Single-click in Preview mode:**
- Follow links (existing behavior for wiki-links and external links)
- Toggle checkboxes (existing behavior via `toggleCheckbox`)
- No editing — preserves Preview as a reading mode

**In Split mode (bonus):**
- Clicking a heading or paragraph in the preview pane scrolls the editor to the corresponding line
- Uses the same source mapping logic

### Source Mapping Strategy

**For headings:** `rehype-slug` already generates `id` attributes. Map heading `id` → search for `# heading text` in source → get line number.

**For paragraphs:** Count paragraph index in rendered HTML. Count paragraph blocks in source. Map by index (approximate but works for sequential content).

**For list items:** Count list item index within parent list. Map to source list items.

**For code blocks:** Match by content — find the code block in source with matching content.

**For tables:** Map to the first line of the table in source. Precise cell mapping is not attempted.

**Fallback:** If no mapping found, scroll to top of document and switch to editor. Never leave the user stuck.

### Files

**Modified:**
- `packages/ns-web/src/components/MarkdownPreview.tsx` — add `onDoubleClick` handler with source position detection
- `packages/ns-web/src/pages/NotesPage.tsx` — handle `onEditAtLine(lineNumber)` callback from preview, switch view mode and scroll editor
- `packages/ns-web/src/lib/sourceMap.ts` — new utility: `findSourceLine(content: string, element: HTMLElement): number`
- Desktop mirrors of all modified files

### Steps

1. Create `sourceMap.ts` with `findSourceLine()` — takes markdown content and clicked DOM element, returns best-guess line number
2. Add heading mapping (most reliable — via slug/id)
3. Add paragraph mapping (by sequential index)
4. Add list item and code block mapping
5. Add `onDoubleClick` handler to `MarkdownPreview` — walks DOM to find nearest mappable element
6. Wire to NotesPage: `handleEditAtLine(line)` → set viewMode to "editor" or "live", call `editorRef.current.scrollToLine(line)`, focus editor
7. In Split mode: add `onClick` handler that scrolls editor to corresponding line (without switching mode)
8. Mirror to ns-desktop
9. Tests for sourceMap utility

### Verification

- Double-click heading in preview → editor opens at that heading's line
- Double-click paragraph → editor opens at approximate paragraph position
- Double-click code block → editor opens at code block start
- Double-click table → editor opens at table start
- Single-click links → still follows links (not disrupted)
- Single-click checkboxes → still toggles (not disrupted)
- Split mode click scrolls editor
- Works in both dark and light themes
- Desktop matches web

---

## Phase 7: Polish

**Goal:** Refinements across all phases.

### Steps

1. Animation on sidebar tab transitions (CSS transition on content swap)
2. Ensure focus mode hides sidebar + note list panel but keeps ribbon visible
3. Responsive behavior: on narrow screens (<900px), auto-collapse note list panel; on very narrow (<600px), auto-collapse sidebar too
4. Persist all panel widths and states in localStorage
5. Test all interactions end-to-end on both web and desktop
6. Ensure drag-and-drop (folder moves, note reorder, tab reorder) still works with new layout
7. Profile performance: sidebar tab switching, note list rendering with 500+ notes, live preview with long documents
8. Accessibility pass: tab navigation through ribbon and sidebar tabs, ARIA labels, keyboard-only operation

### Verification

- All localStorage keys persist and restore correctly
- Responsive breakpoints work (test at 600px, 900px, 1200px, 1920px)
- Focus mode behavior correct
- No regressions in existing functionality
- Type check, tests, build all pass
- Desktop matches web

---

## Summary of All Phases

| Phase | Feature | Effort | Risk |
|---|---|---|---|
| 1 | Sidebar Tabs | 2-3 days | Low |
| 2 | Ribbon + Non-Blocking Audio Recording | 4-5 days | Medium |
| 3 | Separate Note List Panel | 3-4 days | Medium |
| 4 | Richer Note List Rows | 2-3 days | Low |
| 5 | Live Preview Editor Mode | 3-4 weeks | High |
| 6 | Preview Click-to-Edit | 2-3 days | Medium |
| 7 | Polish | 2-3 days | Low |

Phases 1-4 deliver immediate UX value with low risk. Phase 5 is the largest and highest-risk — it should be implemented in sub-phases (5a through 5i) with extensive testing between each. Phase 6 depends on having a working editor but not on Live Preview. Phase 7 is final polish after everything else lands.

## Design Decisions

- **Why sidebar tabs instead of combined ribbon?** Obsidian actually separates these into two elements: sidebar tabs switch content views, ribbon provides always-visible utility actions. This separation means the ribbon stays useful when the sidebar is collapsed (e.g., creating a new note, checking sync status, navigating to settings).
- **Why separate the note list panel?** The current stacked layout forces folder tree and note list to compete for vertical space. A separate panel means both can use full height. This matches the three-column pattern visible in the Obsidian screenshot and common in note apps (Bear, Apple Notes, Notion sidebar).
- **Why not just copy Obsidian's inline tree?** Obsidian shows files inline in the folder tree. NoteSync already has a separate note list — users expect a note list panel. The three-column layout is arguably more usable for browsing.
- **Why a floating bottom bar for recording instead of keeping it in the sidebar?** The current AudioRecorder blocks the sidebar during recording — users can't browse folders, switch tabs, or navigate notes while recording. A meeting recording can last hours. The floating bottom bar is independent of all panels, stays visible in any layout state (sidebar collapsed, focus mode), and lets users continue all normal work. This matches patterns in apps like Zoom (recording indicator bar), Slack (call bar at top), and macOS Voice Memos.
- **Why Web Audio API for waveform instead of just showing a static animation?** A fake bouncing animation gives no real feedback about whether audio is actually being captured. Users need to know: "Is my mic working? Is it picking up sound?" Real-time audio levels from `AnalyserNode.getByteFrequencyData()` answer this at negligible performance cost (~15fps canvas rendering). For desktop meeting mode (Rust CoreAudio), the same visualization is driven by RMS amplitude data sent via the existing tick event.
- **Why remove the "NoteSync" title from the sidebar?** The sidebar tabs + ribbon replace the need for a header row. Removing it frees ~48px of vertical space for sidebar content. The app identity is established by the window title and login page — it doesn't need to be repeated on every screen.
- **Why start Live Preview with inline formatting?** Inline elements (bold, italic, code) are the simplest decorations — single line, well-bounded, easy to test. Block elements (tables, code blocks) are dramatically more complex and have more edge cases. Shipping inline formatting first gives real value and validates the approach before tackling the hard parts.
- **Why double-click for click-to-edit instead of single-click?** Single-click in preview already has meaning: follow links, toggle checkboxes. Double-click is an unambiguous "I want to edit this" signal that doesn't conflict with existing interactions.
- **Why line-level reveal instead of block-level for Live Preview?** Line-level causes fewer layout shifts and is simpler to implement. Block-level can be added later if UX feedback demands it (e.g., for code blocks and tables, block-level may be better).
