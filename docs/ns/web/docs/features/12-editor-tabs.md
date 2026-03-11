# 12 — Editor Tabs (VS Code-Style)

**Status:** Complete
**Phase:** UI Enhancement
**Priority:** Medium
**Completed:** v1.54.0

## Summary

VS Code-style editor tab bar for NoteSync, allowing users to keep multiple notes open and switch between them. Includes permanent tabs, preview tabs with auto-pin, compact icon-only toolbar, and trash view integration.

---

## Tab Behavior

### Opening Tabs

- **Single-click:** Always opens note as a preview tab with italic title; subsequent single-clicks replace the preview tab (only one preview tab at a time)
- **Double-click:** Opens note as a permanent (non-italic) tab; this is the primary way to create tabs
- **Double-click a preview tab:** Pins it — becomes permanent, italic removed
- **Edit preview tab (title or content):** Auto-pins via `useEffect` watching `isDirty`
- **Create / deep-link / wiki-link / favorites:** Open as permanent tabs
- **Double-click different note when preview exists:** Closes preview, opens double-clicked note as permanent

### Closing Tabs

- Drag-and-drop reordering via `@dnd-kit/sortable` with `horizontalListSortingStrategy`
  - Movement locked to horizontal axis via `restrictToHorizontalAxis` modifier from `@dnd-kit/modifiers`
  - Each tab is a `SortableTab` sub-component using `useSortable({ id: tab.id })`
  - Uses `CSS.Translate.toString()` (not `CSS.Transform`) to avoid scale distortion during drag
  - Dragged tab shows `opacity: 0.5` feedback (same pattern as `SortableNoteItem` in NoteList)
  - Separate `DndContext` wrapping `TabBar` (independent from sidebar's note/folder DndContext)
  - `handleTabDragEnd` uses `arrayMove` to reorder `openTabs` state
- Close button (×) on each tab, visible on hover (always visible for active tab)
- Middle-click (mouse button 1) closes a tab
- Closing active tab switches to adjacent tab (right, then left)
- Closing last tab clears the editor
- Deleting or trashing a note auto-removes its tab

### Trash View Integration

- Tabs hide when switching to trash view
- Active tab selection is saved to a ref
- Returning to notes view restores the previously active tab

---

## TabBar Component

**File:** `packages/ns-web/src/components/TabBar.tsx`

Presentational component receiving tab data and callbacks.

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
- Active tab: `bg-card text-foreground border-t-2 border-primary` (lime-yellow top accent)
- Inactive tab: `bg-background text-muted-foreground hover:bg-accent border-t-2 border-transparent`
- Preview tab: `italic` class on title span
- Dirty indicator: `●` in `text-primary` before title
- Tabs: `min-w-[120px] max-w-[200px]`, truncated text
- Container: `overflow-x-auto` with hidden scrollbar, `border-b border-border`
- Auto-scrolls active tab into view via `scrollIntoView`

---

## NoteList Changes

**File:** `packages/ns-web/src/components/NoteList.tsx`

Added `onDoubleClick?: (note: NoteSearchResult) => void` prop to both `NoteListProps` and `SortableNoteItemProps`. Threaded through from parent to sortable item. `e.preventDefault()` on double-click to avoid text selection.

---

## NotesPage Changes

**File:** `packages/ns-web/src/pages/NotesPage.tsx`

### State
- `openTabs: string[]` — ordered list of open tab IDs
- `previewTabId: string | null` — which tab is the preview tab (at most one)
- `savedTabSelectionRef` — remembers active tab when switching to trash

### Key Handlers
- `handleNoteSelect(note)` — single-click: always creates a preview tab (or replaces existing preview)
- `openNoteAsTab(note)` — double-click / create / deep-link: permanent tab
- `pinTab(tabId)` — clears previewTabId
- `switchTab(noteId)` — tab click: finds note, calls selectNote
- `closeTab(noteId)` — removes tab, switches to adjacent if active, clears if last

### Auto-Pin Effect
```tsx
useEffect(() => {
  if (isDirty && previewTabId && selectedId === previewTabId) {
    setPreviewTabId(null);
  }
}, [isDirty, previewTabId, selectedId]);
```

### isDirty Fix
- Added `loadedContentRef` and `loadedTitleRef` refs tracking content at load time
- Only sets `isDirty = true` when value differs from loaded content (prevents false dirty from CodeMirror's programmatic onChange)

### Toolbar Compaction
- Icon-only buttons: Summarize (sparkle), Suggest tags (tag), Copy link (link), Delete (trash)
- Reduced padding: `px-3 py-1` (was `px-4 py-2`), `gap-1.5` (was `gap-3`)
- `aria-label` attributes for accessibility, tooltips via `title`
- Delete confirmation: "Delete? Yes / No" (was "Delete? Confirm / Cancel")

### Trash View
- Tabs hidden when `sidebarView !== "notes"`
- `switchToTrash()` saves `selectedId` to `savedTabSelectionRef`
- `switchToNotes()` restores saved tab selection
- Back button text shortened to "Back" with more spacing below

### Navigation Callers Updated
These now call `openNoteAsTab` instead of `selectNote`:
- `handleCreate`
- Deep-link useEffect
- `handleFavoriteNoteClick`
- `handleWikiLinkClick`
- `handleQaSelectNote`

### Delete/Trash Handlers
- `handleDelete` and `handleDeleteNoteById` also remove note from `openTabs` and clear `previewTabId` if needed
- ID reconciliation also updates `openTabs` and `previewTabId`

---

## Files Changed

| File | Action |
|------|--------|
| `packages/ns-web/src/components/TabBar.tsx` | Created — tab bar component with preview/permanent styling and `SortableTab` sub-component for drag-and-drop reordering |
| `packages/ns-web/src/components/NoteList.tsx` | Modified — added `onDoubleClick` prop to NoteListProps and SortableNoteItemProps |
| `packages/ns-web/src/pages/NotesPage.tsx` | Modified — tab state/handlers, preview logic, isDirty fix, toolbar compaction, trash integration, separate DndContext for tab reordering with `restrictToHorizontalAxis` modifier |
| `packages/ns-web/src/__tests__/TabBar.test.tsx` | Created — 11 unit tests (wrapped in DndContext with PointerSensor distance constraint) |
| `packages/ns-web/src/__tests__/NotesPage.test.tsx` | Modified — 11 new tab integration tests, updated toolbar selectors |

## Tests

| Test file | Tests |
|-----------|-------|
| `TabBar.test.tsx` | 11 tests: renders titles, dirty indicator, click callback, close callback, no select on close click, active styling, inactive styling, middle-click close, empty title fallback, italic preview styling, double-click pin |
| `NotesPage.test.tsx` | +11 tests: preview tab on single-click, preview replacement when switching notes, tab on double-click, double-click replaces preview with permanent, preview tab on single-click with tabs, preview replacement, double-click pins preview, close active switches adjacent, close last clears editor, delete removes tab, create opens tab |

## Dependencies

- [02 — Note Management](02-note-management.md) — editor, note CRUD
- [03 — Search & Organization](03-search-and-organization.md) — sidebar note list, trash view
- [07 — Note Linking](07-note-linking.md) — wiki-link navigation opens tabs
- [09 — Favorites](09-favorites.md) — favorite click opens tabs
