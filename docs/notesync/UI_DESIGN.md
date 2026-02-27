# NoteSync — UI Design Guide

This document defines the high-level UI design for NoteSync across all platforms (desktop, web, mobile). It serves as the shared reference for visual style, layout, component patterns, and interaction design.

---

## Visual Direction

**Style:** Dense & powerful — information-rich, compact layouts with clear hierarchy. Inspired by Obsidian and VS Code.

**Principles:**
- Content-first — the editor takes maximum space; chrome is minimal
- Information density — show useful metadata without clutter
- Keyboard-driven — power users should be able to navigate entirely via keyboard
- Consistent — same visual language across desktop, web, and mobile (adapted to each platform's conventions)

---

## Color System

### Mode

Both dark and light themes with a user toggle in settings. System-follow option available (respects OS preference).

### Palette: Neutral Grays

Minimal accent color. The UI stays out of the way; content is the focus.

#### Dark Mode

| Element | Color | Usage |
|---------|-------|-------|
| Background (primary) | `#1e1e1e` | Main editor area |
| Background (secondary) | `#252526` | Sidebar, panels |
| Background (tertiary) | `#2d2d2d` | Hover states, active items |
| Border | `#3e3e3e` | Panel dividers, input borders |
| Text (primary) | `#cccccc` | Body text, note content |
| Text (secondary) | `#8b8b8b` | Dates, metadata, placeholders |
| Text (heading) | `#e0e0e0` | Note titles, section headings |
| Accent | `#4a9eff` | Selected items, active tab, links, primary buttons |
| Accent (hover) | `#5aafff` | Hover on accent elements |
| Success | `#4ec9b0` | Synced indicator, save confirmation |
| Warning | `#cca700` | Offline indicator, pending sync |
| Error | `#f14c4c` | Errors, delete actions |
| Ghost text | `#555555` | AI inline completions |
| Selection | `#264f78` | Text selection in editor |
| Active line | `#2a2a2a` | Current line highlight in editor |

#### Light Mode

| Element | Color | Usage |
|---------|-------|-------|
| Background (primary) | `#ffffff` | Main editor area |
| Background (secondary) | `#f5f5f5` | Sidebar, panels |
| Background (tertiary) | `#ebebeb` | Hover states, active items |
| Border | `#d4d4d4` | Panel dividers, input borders |
| Text (primary) | `#333333` | Body text, note content |
| Text (secondary) | `#777777` | Dates, metadata, placeholders |
| Text (heading) | `#1a1a1a` | Note titles, section headings |
| Accent | `#0066cc` | Selected items, active tab, links, primary buttons |
| Accent (hover) | `#0055aa` | Hover on accent elements |
| Success | `#2d9f7f` | Synced indicator |
| Warning | `#b89500` | Offline indicator |
| Error | `#d32f2f` | Errors, delete actions |
| Ghost text | `#bbbbbb` | AI inline completions |
| Selection | `#add6ff` | Text selection in editor |
| Active line | `#f7f7f7` | Current line highlight in editor |

---

## Typography

### Editor Font (User-Selectable)

Users choose their preferred monospace font in settings. All three are bundled/available:

| Font | Source | Notes |
|------|--------|-------|
| JetBrains Mono | Bundled (OFL license) | Default; popular coding font with ligatures |
| Fira Code | Bundled (OFL license) | Open-source monospace with ligatures |
| SF Mono / Menlo | System font | No download needed; consistent with OS |

### UI Font

| Context | Font | Size |
|---------|------|------|
| UI elements (buttons, labels, menus) | System font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`) | 13px base |
| Sidebar note titles | System font stack | 13px |
| Sidebar metadata (dates, tags) | System font stack | 11px |
| Editor content | User-selected monospace | 14px default (adjustable in settings: 12–20px) |
| Editor line numbers | User-selected monospace | 12px, secondary text color |
| Note title (editor header) | System font stack, semibold | 18px |

---

## Desktop & Web Layout

### Two-Panel Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ ☰  NoteSync            🔍 Search (Ctrl+K)    ● Online  ⚙ ☾/☀  │  ← Header bar
├────────────────┬────────────────────────────────────────────────┤
│ Sidebar        │ Editor                                        │
│                │                                                │
│ + New Note     │ ┌─ Title ──────────────────────────────────┐  │
│                │ │ Meeting Notes                             │  │
│ ▼ Work         │ └──────────────────────────────────────────┘  │
│   Meeting   *  │ ┌─ Tags ───────────────────────────────────┐  │
│   Ideas        │ │ #work  #urgent  [+ add tag]              │  │
│   Proposals    │ └──────────────────────────────────────────┘  │
│ ▼ Personal     │ ┌─ Editor ─────────────────────────────────┐  │
│   Journal      │ │ # Meeting Notes                          │  │
│   TODO         │ │                                           │  │
│ ▶ Archive      │ │ ## Attendees                              │  │
│                │ │ - **Alice**                               │  │
│ Unfiled (3)    │ │ - **Bob**                                 │  │
│                │ │                                           │  │
│ ──────────     │ │ ## Action Items                           │  │
│ Tags           │ │ - [ ] Follow up with team                │  │
│ #work (12)     │ │ - [x] Send Q1 report                    │  │
│ #urgent (3)    │ │                                           │  │
│ #ideas (7)     │ └──────────────────────────────────────────┘  │
│ #draft (5)     │                                                │
│                │ ─ Saved ─ Synced ─ 247 words ─ Feb 26, 2026 ─ │  ← Status bar
│ ──────────     ├────────────────────────────────────────────────┤
│ 🗑 Trash (2)   │ [Edit] [Split] [Preview]    [Focus] [AI ✨]   │  ← Toolbar
└────────────────┴────────────────────────────────────────────────┘
```

### Header Bar

| Element | Position | Description |
|---------|----------|-------------|
| Sidebar toggle (☰) | Left | Collapse/expand sidebar |
| App name | Left of center | "NoteSync" branding |
| Search | Center | Cmd+K / Ctrl+K to focus; opens command palette-style search overlay |
| Sync status | Right | Green dot (online/synced), yellow dot (pending), gray dot (offline) |
| Settings gear | Right | Opens settings page |
| Theme toggle | Right | Dark/light mode switch |

### Sidebar

- **Width:** 240px default; resizable via drag handle; collapsible to 0px
- **Toggle:** ☰ button in header or Cmd+B / Ctrl+B hotkey
- **Sections** (top to bottom):
  1. **New Note** button (prominent, top of sidebar)
  2. **Folder tree** — expandable/collapsible folders with note counts; notes listed under each folder with title + date; active note highlighted with accent background
  3. **Unfiled** — notes without a folder assignment
  4. **Tags** — flat list of all tags with note counts; click to filter
  5. **Trash** — soft-deleted notes with count

### Note List Items (Standard Density)

```
┌──────────────────────────────────┐
│ Meeting Notes              Feb 26│  ← Title (semibold) + date (secondary)
│ Discussed Q1 targets and...     │  ← First line preview (secondary text)
│ #work  #urgent                  │  ← Tag chips (small, muted)
├──────────────────────────────────┤
│ Project Ideas              Feb 25│
│ New app concept for note...     │
│ #ideas                          │
├──────────────────────────────────┤
│ Weekly TODO                Feb 24│
│ - Fix auth bug, deploy...       │
│ #todo                           │
└──────────────────────────────────┘
```

- Active/selected note: accent-colored left border + tertiary background
- Hover: tertiary background
- Unsynced indicator: small yellow dot next to title

### Editor Area

- **Title field:** large, editable, above the editor; click to rename
- **Tag bar:** horizontal row of tag chips below title; click "+" to add; click tag to remove
- **CodeMirror 6 editor:** fills remaining space; markdown syntax highlighting; line numbers (toggleable)
- **Status bar:** bottom of editor — save status, sync status, word count, last modified date
- **Toolbar:** below status bar or above editor — mode toggles (Edit/Split/Preview), Focus mode button, AI trigger

### Editor/Preview Modes

**Toggle mode** (default): full-width; switch between Edit and Preview with a button or Ctrl+Shift+P

```
Edit mode (default):              Preview mode:
┌────────────────────────────┐    ┌────────────────────────────┐
│ [Edit]  Preview            │    │  Edit  [Preview]           │
│                            │    │                            │
│ # Meeting Notes            │    │ Meeting Notes              │
│                            │    │ ─────────────              │
│ ## Attendees               │    │ Attendees                  │
│ - **Alice**                │    │ • Alice                    │
│ - **Bob**                  │    │ • Bob                      │
│                            │    │                            │
│ ## Action Items            │    │ Action Items               │
│ - [ ] Follow up            │    │ ☐ Follow up               │
│ - [x] Send report          │    │ ☑ Send report             │
└────────────────────────────┘    └────────────────────────────┘
```

**Side-by-side split** (opt-in via settings or Ctrl+Shift+S):

```
┌──────────────────────┬──────────────────────┐
│ Editor (source)      │ Preview (rendered)    │
│                      │                       │
│ # Meeting Notes      │ Meeting Notes         │
│                      │ ─────────────         │
│ ## Attendees         │ Attendees             │
│ - **Alice**          │ • Alice               │
│ - **Bob**            │ • Bob                 │
│                      │                       │
│ ## Action Items      │ Action Items          │
│ - [ ] Follow up     │ ☐ Follow up           │
│ - [x] Send report   │ ☑ Send report         │
└──────────────────────┴──────────────────────┘
```

Split divider is draggable to resize panes.

---

## Focus Mode

Activated via button or Ctrl+Shift+F / Cmd+Shift+F. Escape to exit.

Focus mode combines three features, each independently toggleable in settings:

### 1. Full-Screen

Hide sidebar, header bar, and toolbar. Only the editor and a minimal title remain.

### 2. Centered Column

Content constrained to a narrow column (~680px) centered horizontally with generous margins. Reduces eye travel for long writing sessions.

### 3. Typewriter Mode

Active line stays vertically centered on screen. Content above and below the active line is subtly dimmed (opacity ~0.5). Keeps focus on the current line of writing.

### Combined Focus Mode

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                                                          [ESC]  │
│                                                                 │
│         ┌───────────────────────────────────────────┐           │
│         │                                           │           │
│         │  ## Attendees               (dimmed 0.5)  │           │
│         │  - **Alice**                (dimmed 0.5)  │           │
│         │  - **Bob**                  (dimmed 0.5)  │           │
│         │                                           │           │
│         │  ## Action Items            ← active line │           │
│         │                                           │           │
│         │  - [ ] Follow up with team  (dimmed 0.5)  │           │
│         │  - [x] Send Q1 report       (dimmed 0.5)  │           │
│         │  - [ ] Review budget        (dimmed 0.5)  │           │
│         │                                           │           │
│         └───────────────────────────────────────────┘           │
│                                                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Individual Toggle Settings

| Feature | Hotkey | Can Use Outside Focus Mode |
|---------|--------|---------------------------|
| Full-screen | Ctrl+Shift+F | No — this IS focus mode entry |
| Centered column | Setting toggle | Yes — can use in normal editor |
| Typewriter mode | Setting toggle | Yes — can use in normal editor |

---

## AI UI Patterns

### Desktop & Web: Inline Ghost Text

AI completions appear as dimmed ghost text after the cursor in the editor. Powered by the `@derekentringer/codemirror-ai-markdown` extension.

```
┌──────────────────────────────────────────────────┐
│ ## Action Items                                  │
│ - [ ] Follow up with team about the|             │
│       quarterly review and budget   ← ghost text │
│       allocation for Q2             ← ghost text │
│                                                  │
│ Tab to accept · Esc to dismiss                   │
└──────────────────────────────────────────────────┘
```

- Ghost text color: `#555555` (dark) / `#bbbbbb` (light)
- Subtle inline hint: "Tab to accept" shown briefly on first use
- Loading: small spinner in the status bar while waiting for AI response

### Desktop & Web: Select-and-Rewrite

Select text → right-click or Ctrl+Shift+A → context menu:

```
┌──────────────────────┐
│ ✨ Rewrite           │
│ ✨ Make concise       │
│ ✨ Fix grammar        │
│ ✨ Convert to list    │
│ ✨ Expand             │
│ ✨ Summarize          │
│ ✨ Custom prompt...   │
└──────────────────────┘
```

Result replaces the selection. Ctrl+Z to undo if unwanted.

### Mobile: AI Toolbar & Bottom Sheet

No ghost text on mobile. AI actions available via:

1. **AI button in editor toolbar** — opens bottom sheet with actions
2. **Long-press selected text** → "AI" option → bottom sheet with rewrite actions

```
Bottom Sheet:
┌──────────────────────────────────────┐
│ ─── AI Actions ───                   │
│                                      │
│ ✨ Continue writing                   │
│ ✨ Suggest headings                   │
│ ✨ Summarize note                     │
│ ──────────────────                   │
│ Selection actions:                   │
│ ✨ Rewrite                            │
│ ✨ Make concise                       │
│ ✨ Fix grammar                        │
│ ✨ Convert to list                    │
│                                      │
│ [ Cancel ]                           │
└──────────────────────────────────────┘
```

AI result shown in a preview card; tap "Insert" to accept or "Discard" to cancel.

---

## Search & Command Palette

Activated via Cmd+K / Ctrl+K. Overlay centered on screen.

```
┌─────────────────────────────────────────────────┐
│ 🔍 Search notes...                              │
├─────────────────────────────────────────────────┤
│ Recent                                          │
│   Meeting Notes                    Work · Feb 26│
│   Project Ideas                Personal · Feb 25│
│                                                 │
│ Results for "budget"                            │
│   Q1 Budget Review               Work · Feb 20 │
│   ...discussed the **budget** allocation for... │
│                                                 │
│   Financial Planning          Personal · Feb 18 │
│   ...set a monthly **budget** target of...      │
│                                                 │
│ ───                                             │
│ 🤖 AI Search: "budget"     ← semantic results  │
│   Meeting Notes               Work · Feb 26    │
│   Annual Review            Personal · Feb 10    │
├─────────────────────────────────────────────────┤
│ ↑↓ Navigate · Enter Open · Esc Close            │
└─────────────────────────────────────────────────┘
```

- Top section: recent notes (when search is empty)
- Keyword results: FTS5/tsvector matches with highlighted terms
- AI section: semantic search results (when AI is enabled); shown below keyword results with a separator
- Keyboard navigable: arrow keys to move, Enter to open, Esc to close

---

## Mobile Layout

### Navigation: Bottom Tabs

```
┌────────────────────────────────┐
│ NoteSync          ● Online  ⚙ │  ← Header
├────────────────────────────────┤
│                                │
│  ▼ Work                        │
│  ┌──────────────────────────┐  │
│  │ Meeting Notes     Feb 26 │  │
│  │ Discussed Q1 targets...  │  │
│  │ #work  #urgent           │  │
│  ├──────────────────────────┤  │
│  │ Project Ideas     Feb 25 │  │
│  │ New app concept for...   │  │
│  │ #ideas                   │  │
│  ├──────────────────────────┤  │
│  │ Weekly TODO       Feb 24 │  │
│  │ - Fix auth bug...        │  │
│  │ #todo                    │  │
│  └──────────────────────────┘  │
│                                │
│  ▶ Personal (4)                │
│  ▶ Archive (12)                │
│                                │
│                          [+]   │  ← FAB (new note)
├────────────────────────────────┤
│  📝 Notes  🔍 Search  🤖 AI  ⚙│  ← Bottom tabs
└────────────────────────────────┘
```

### Mobile Note Viewer

```
┌────────────────────────────────┐
│ ← Back        Meeting Notes  ✏│  ← Header with edit button
├────────────────────────────────┤
│ Work · #work #urgent           │  ← Folder + tags
│ Feb 26, 2026 · 247 words       │  ← Metadata
├────────────────────────────────┤
│                                │
│ Meeting Notes                  │
│ ─────────────                  │
│                                │
│ Attendees                      │
│ • Alice                        │
│ • Bob                          │
│                                │
│ Action Items                   │
│ ☐ Follow up with team          │
│ ☑ Send Q1 report               │
│                                │
│                                │
└────────────────────────────────┘
```

### Mobile Note Editor

```
┌────────────────────────────────┐
│ ← Cancel     Edit Note    Done│  ← Header
├────────────────────────────────┤
│ Meeting Notes                  │  ← Title field
├────────────────────────────────┤
│ # Meeting Notes                │
│                                │
│ ## Attendees                   │
│ - **Alice**                    │
│ - **Bob**                      │
│                                │
│ ## Action Items                │
│ - [ ] Follow up with team      │
│ - [x] Send Q1 report           │
│                                │
│                                │
├────────────────────────────────┤
│ B  I  H  🔗  •  ☐  <> "  ✨  │  ← Markdown toolbar
├────────────────────────────────┤
│ ┌─────────────────────────────┐│
│ │ q w e r t y u i o p        ││  ← Keyboard
│ │ a s d f g h j k l          ││
│ │ z x c v b n m              ││
│ └─────────────────────────────┘│
└────────────────────────────────┘
```

Markdown toolbar buttons:
- **B** — bold (`**`)
- **I** — italic (`*`)
- **H** — heading cycle (`#`, `##`, `###`)
- **🔗** — link (`[]()`)
- **•** — unordered list (`- `)
- **☐** — checkbox (`- [ ] `)
- **<>** — code (`` ` ``)
- **"** — blockquote (`> `)
- **✨** — AI actions (opens bottom sheet)

### Mobile Search Screen

```
┌────────────────────────────────┐
│ 🔍 Search notes...        ✕   │  ← Search bar
├────────────────────────────────┤
│ Recent searches                │
│ budget · meeting · TODO        │
├────────────────────────────────┤
│ Results for "budget"           │
│ ┌──────────────────────────┐   │
│ │ Q1 Budget Review  Feb 20 │   │
│ │ ...the **budget** alloc..│   │
│ ├──────────────────────────┤   │
│ │ Financial Plan    Feb 18 │   │
│ │ ...monthly **budget**... │   │
│ └──────────────────────────┘   │
│                                │
│ 🤖 AI Results                  │
│ ┌──────────────────────────┐   │
│ │ Meeting Notes     Feb 26 │   │
│ │ Annual Review     Feb 10 │   │
│ └──────────────────────────┘   │
├────────────────────────────────┤
│  📝 Notes  🔍 Search  🤖 AI  ⚙│
└────────────────────────────────┘
```

### Mobile AI Chat Screen

```
┌────────────────────────────────┐
│ NoteSync AI                    │  ← Header
├────────────────────────────────┤
│                                │
│ ┌─ You ────────────────────┐   │
│ │ What did I discuss in my │   │
│ │ last work meeting?       │   │
│ └──────────────────────────┘   │
│                                │
│ ┌─ AI ─────────────────────┐   │
│ │ In your Meeting Notes    │   │
│ │ from Feb 26, you         │   │
│ │ discussed:               │   │
│ │                          │   │
│ │ • Q1 targets             │   │
│ │ • Budget allocation      │   │
│ │ • Team follow-ups        │   │
│ │                          │   │
│ │ 📎 Meeting Notes         │   │  ← Tap to open note
│ └──────────────────────────┘   │
│                                │
├────────────────────────────────┤
│ Ask about your notes...   [→] │  ← Input
├────────────────────────────────┤
│  📝 Notes  🔍 Search  🤖 AI  ⚙│
└────────────────────────────────┘
```

---

## Keyboard Shortcuts (Desktop & Web)

| Action | Mac | Windows/Linux |
|--------|-----|---------------|
| Search / command palette | Cmd+K | Ctrl+K |
| Toggle sidebar | Cmd+B | Ctrl+B |
| New note | Cmd+N | Ctrl+N |
| Save (manual) | Cmd+S | Ctrl+S |
| Delete note | Cmd+Backspace | Ctrl+Delete |
| Focus mode | Cmd+Shift+F | Ctrl+Shift+F |
| Toggle edit/preview | Cmd+Shift+P | Ctrl+Shift+P |
| Toggle split view | Cmd+Shift+S | Ctrl+Shift+S |
| Bold | Cmd+B (in editor) | Ctrl+B (in editor) |
| Italic | Cmd+I | Ctrl+I |
| AI complete | Tab (when ghost text visible) | Tab |
| AI dismiss | Escape | Escape |
| AI rewrite selection | Cmd+Shift+A | Ctrl+Shift+A |
| AI continue writing | Cmd+Shift+Space | Ctrl+Shift+Space |

Note: Cmd+B is context-sensitive — toggles sidebar when focus is outside editor, applies bold when cursor is in editor.

---

## Sync & Status Indicators

### Sync Status (Header Bar)

| State | Indicator | Description |
|-------|-----------|-------------|
| Online & synced | `●` green dot | All changes synced |
| Online & syncing | `●` animated green dot | Sync in progress |
| Pending changes | `●` yellow dot + count | "3 changes pending" tooltip |
| Offline | `●` gray dot | "Offline" label; changes queued |

### Per-Note Status (Sidebar)

| State | Indicator |
|-------|-----------|
| Synced | No indicator (clean) |
| Modified (unsynced) | Small yellow dot next to title |
| New (never synced) | Small blue dot next to title |
| Conflict (future) | Small red dot next to title |

### Save Status (Editor Status Bar)

| State | Display |
|-------|---------|
| Saved | "Saved" (fades after 2s) |
| Saving | "Saving..." |
| Unsaved changes | "Unsaved changes" (warning color) |
| Offline + saved locally | "Saved locally · Offline" |

---

## Spacing & Sizing

| Element | Value |
|---------|-------|
| Base spacing unit | 4px |
| Sidebar width | 240px default, 180–360px range |
| Editor max-width (focus centered) | 680px |
| Note list item height | ~68px (title + preview + tags) |
| Header bar height | 40px |
| Status bar height | 28px |
| Toolbar height | 36px |
| Border radius (buttons, inputs) | 4px |
| Border radius (cards, panels) | 6px |
| Mobile bottom tab height | 56px |
| Mobile FAB size | 56px |
| Mobile markdown toolbar height | 44px |

---

## Responsive Breakpoints (Web)

| Breakpoint | Behavior |
|------------|----------|
| ≥1200px | Two-panel layout with sidebar |
| 768–1199px | Sidebar auto-collapsed; toggle to show as overlay |
| <768px | Single panel; note list and editor are separate views (navigate between them) |

---

## Accessibility

- All interactive elements keyboard-focusable
- Color contrast meets WCAG AA (4.5:1 for text, 3:1 for large text)
- Focus rings visible on keyboard navigation (hidden on mouse click)
- Screen reader labels on icon-only buttons
- Reduced motion option: disables typewriter scroll animation and sync indicators
