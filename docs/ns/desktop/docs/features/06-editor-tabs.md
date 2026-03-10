# 06 — Editor Tabs

**Status:** Complete
**Phase:** 4 — UI Features
**Priority:** High
**Completed:** v1.59.0

## Summary

VS Code-style editor tab bar for NoteSync Desktop, allowing users to keep multiple notes open and switch between them. Includes permanent tabs, preview tabs with auto-pin, drag-and-drop reorder, and middle-click close. Ported from the ns-web implementation for feature parity.

---

## Tab Behavior

### Opening Tabs

- **Single-click (no tabs open):** Loads note in editor without creating a tab — same behavior as before tabs existed
- **Double-click:** Opens note as a permanent (non-italic) tab; this is the primary way to create tabs
- **Single-click (tabs open):** Opens note as a preview tab with italic title; subsequent single-clicks replace the preview tab (only one preview tab at a time)
- **Double-click a preview tab:** Pins it — becomes permanent, italic removed
- **Edit preview tab (title or content):** Auto-pins via `useEffect` watching `isDirtyValue`
- **Create / wiki-link / favorites:** Open as permanent tabs
- **Double-click different note when preview exists:** Closes preview, opens double-clicked note as permanent

### Closing Tabs

- Close button (×) on each tab, visible on hover (always visible for active tab)
- Middle-click (mouse button 1) closes a tab
- Closing active tab switches to adjacent tab (right, then left)
- Closing last tab clears the editor and hides the tab bar
- Deleting or trashing a note auto-removes its tab

### Drag-and-Drop Reordering

- `@dnd-kit/sortable` with `horizontalListSortingStrategy`
- Movement locked to horizontal axis via `restrictToHorizontalAxis` modifier from `@dnd-kit/modifiers`
- Each tab is a `SortableTab` sub-component using `useSortable({ id: tab.id })`
- Uses `CSS.Translate.toString()` (not `CSS.Transform`) to avoid scale distortion during drag
- Dragged tab shows `opacity: 0.5` feedback
- Separate `DndContext` wrapping `TabBar` (independent from sidebar's note/folder DndContext)
- `handleTabDragEnd` uses `arrayMove` to reorder `openTabs` state

### Trash View Integration

- Tabs hidden when `sidebarView !== "notes"`

---

## TabBar Component

**File:** `packages/ns-desktop/src/components/TabBar.tsx`

Presentational component receiving tab data and callbacks. Exact port from `packages/ns-web/src/components/TabBar.tsx`.

```ts
interface Tab {
  id: string;
  title: string;
  isDirty: boolean;
  isPreview: boolean;
}

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onPinTab?: (tabId: string) => void;
}
```

**Styling (Tailwind, using existing theme tokens):**
- Active tab: `bg-card text-foreground border-t-2 border-primary`
- Inactive tab: `bg-background text-muted-foreground hover:bg-accent border-t-2 border-transparent`
- Preview tab: `italic` class on title span
- Dirty indicator: `●` in `text-primary` before title
- Tabs: `min-w-[120px] max-w-[200px]`, truncated text
- Container: `overflow-x-auto` with hidden scrollbar, `border-b border-border`
- Auto-scrolls active tab into view via `scrollIntoView`

---

## NoteList Changes

**File:** `packages/ns-desktop/src/components/NoteList.tsx`

Added `onDoubleClick?: (note: Note) => void` prop to both `NoteListProps` and `SortableNoteItemProps`. Threaded through from parent to sortable item. `e.preventDefault()` on double-click to avoid text selection.

---

## NotesPage Changes

**File:** `packages/ns-desktop/src/pages/NotesPage.tsx`

### State
- `openTabs: string[]` — ordered list of open tab IDs
- `previewTabId: string | null` — which tab is the preview tab (at most one)
- `tabNoteCacheRef: Map<string, Note>` — cache for tab notes not in the current folder's note list
- `saveGeneration: number` — counter to invalidate `isDirtyValue` after saves

### Reactive Dirty Value
Desktop uses `isDirty()` as a function. Added `isDirtyValue` useMemo for tab reactivity:
```tsx
const isDirtyValue = useMemo(() => {
  return title !== loadedTitleRef.current || content !== loadedContentRef.current;
}, [title, content, saveGeneration]);
```
The `saveGeneration` counter increments after each successful save, forcing the memo to recalculate and clear the dirty indicator on tabs.

### Key Handlers
- `handleNoteSelect(note)` — single-click: no tab if empty, preview if tabs exist
- `openNoteAsTab(note)` — double-click / create / wiki-link / favorites: permanent tab
- `pinTab(tabId)` — clears previewTabId
- `switchTab(noteId)` — tab click: finds note in list or cache, calls selectNote
- `closeTab(noteId)` — removes tab, fire-and-forget save if dirty, switches to adjacent if active, clears if last
- `handleTabDragEnd(event)` — uses `arrayMove` to reorder tabs

### Auto-Pin Effect
```tsx
useEffect(() => {
  if (isDirtyValue && previewTabId && selectedId === previewTabId) {
    setPreviewTabId(null);
  }
}, [isDirtyValue, previewTabId, selectedId]);
```

### Navigation Callers Updated
These now call `openNoteAsTab` instead of `selectNote`:
- `handleCreate`
- `handleFavoriteNoteClick`
- `handleWikiLinkClick`

### NoteList Wiring
Both NoteList instances:
- `onSelect={handleNoteSelect}` (was `selectNote`)
- `onDoubleClick={openNoteAsTab}` (new)

### Delete/Trash Handlers
- `handleDelete` and `handleDeleteNote` also remove note from `openTabs`, clear `previewTabId` if needed, and delete from `tabNoteCacheRef`

### selectedNote Lookup
Added `tabNoteCacheRef` as fallback so notes open in tabs but not in the current folder list still render.

---

## Files Changed

| File | Action |
|------|--------|
| `packages/ns-desktop/src/components/TabBar.tsx` | Created — tab bar component ported from ns-web |
| `packages/ns-desktop/src/components/NoteList.tsx` | Edited — added `onDoubleClick` prop |
| `packages/ns-desktop/src/pages/NotesPage.tsx` | Edited — tab state, handlers, TabBar rendering, wire props, isDirtyValue with saveGeneration |
| `packages/ns-desktop/src/__tests__/TabBar.test.tsx` | Created — 11 tests ported from ns-web |
| `packages/ns-desktop/src/__tests__/NoteList.test.tsx` | Edited — added 2 double-click tests |

## Tests

| Test file | Tests |
|-----------|-------|
| `TabBar.test.tsx` | 11 tests: renders titles, dirty indicator, click callback, close callback, no select on close click, active styling, inactive styling, middle-click close, empty title fallback, italic preview styling, double-click pin |
| `NoteList.test.tsx` | +2 tests: calls onDoubleClick when double-clicked, does not error when onDoubleClick not provided |

## Desktop vs Web Differences

- **No router** — desktop has no `navigate()` calls; no URL updates on tab changes
- **No offline sync / reconciledIds** — desktop uses local SQLite; no ID reconciliation logic
- **`isDirty()` is a function** — added `isDirtyValue` useMemo with `saveGeneration` counter for reactivity; keeps existing function unchanged
- **No export menu** — desktop NoteList doesn't have `onExportNote`
- **No savedTabSelectionRef** — simplified trash view integration (tabs just hide/show)

## Dependencies

- [01 — Note Editor](01-note-editor.md) — editor to display note content within tabs
- [02 — Search & Organization](02-search-and-organization.md) — sidebar note list
- [03 — Note Linking](03-note-linking.md) — wiki-link navigation opens tabs
- [05 — Favorites](05-favorites.md) — favorite click opens tabs

## Deferred

- **State persistence** — open tabs and order not persisted to localStorage; lost on page refresh
- **Keyboard shortcuts** — Ctrl+W to close, Ctrl+Tab to cycle not implemented
- **Close All / Close Others** — no tab context menu
- **Tab sync** — tabs are device-local only
