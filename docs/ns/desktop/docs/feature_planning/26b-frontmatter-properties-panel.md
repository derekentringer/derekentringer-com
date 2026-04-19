# 26b — Frontmatter Properties Panel

**Status:** Planned
**Priority:** High
**Depends on:** [26 — Frontmatter Support](26-frontmatter-support.md) (Phases 1–4 complete)

## Summary

An Obsidian-style Properties panel displayed above the editor that renders frontmatter fields as structured form inputs. Users edit metadata (title, tags, dates, description, favorite) via the panel without touching raw YAML. A toggle switches between the Properties panel view and the raw YAML source in the editor. Changes in either mode sync bidirectionally.

## Design

### Properties Panel (Default Mode)

A collapsible panel rendered above the CodeMirror editor, inside the editor area. Shows recognized frontmatter fields as form controls:

| Field | Control | Behavior |
|-------|---------|----------|
| `title` | Text input | Single-line, auto-focus on new notes (replaces current title input above editor if present) |
| `tags` | Tag pills with add input | Click to remove, type to add, comma/enter to confirm. Same as existing tag UI. |
| `date` | Date display (read-only) | Shows creation date, formatted. Not editable (set on creation). |
| `updated` | Date display (read-only) | Shows last modified date, auto-updated on save. |
| `description` | Text input | Single-line or small textarea for note summary. |
| `favorite` | Checkbox or star toggle | Matches existing favorite behavior. |
| `aliases` | Tag-style pills | Same pill UI as tags. |

Unknown fields (from Obsidian imports, etc.) are shown as read-only key-value rows at the bottom of the panel, preserving round-trip data.

### Visual Design

- Subtle background (`bg-muted/30` or similar) to visually separate from the editor
- Compact layout — each field is a single row: label on left, control on right
- Collapsible via a chevron toggle in the panel header ("Properties")
- Panel collapsed state persisted to localStorage
- Matches the app's theme (dark/light/teams) and accent color

### Raw YAML Toggle

- A small button in the Properties panel header: "Source" or a `</>` icon
- When toggled to source mode:
  - Properties panel hides
  - The raw YAML frontmatter is visible in the CodeMirror editor (no fold/hide decoration)
  - User can edit the YAML directly
  - On switching back to Properties mode, the YAML is re-parsed and the panel updates
- When in Properties mode:
  - The frontmatter block is hidden from the CodeMirror editor using a `Decoration.replace` that collapses the `---...---` block into nothing (or a thin "---" indicator)
  - The editor starts at the body content, below the frontmatter
  - The user edits content; the Properties panel handles metadata

### State persisted to localStorage

- `ns-properties-mode`: `"panel"` | `"source"` (default: `"panel"`)
- `ns-properties-collapsed`: `boolean` (default: `false`)

## Bidirectional Sync

### Properties Panel → Content

When the user edits a field in the Properties panel:
1. Call `updateFrontmatterField(content, field, value)` from the shared frontmatter module
2. The content string (with updated frontmatter) is set as the new editor value
3. The editor's CodeMirror state updates, triggering autosave via the existing `onChange` flow
4. Database cache columns update via the existing `updateNote()` frontmatter sync logic

### Content (Raw YAML) → Properties Panel

When the user edits the raw YAML in source mode and switches back to Properties mode:
1. `parseFrontmatter(content)` extracts the updated metadata
2. The Properties panel re-renders with the new values
3. No database write needed — the content change already triggered autosave

### Editor Content → Properties Panel (Sync Pull)

When a sync pull updates the note content:
1. The new content (with frontmatter) is loaded into the editor
2. The Properties panel re-parses and displays updated values
3. No special handling needed — it's just a content change

## Implementation

### New Components

**`PropertiesPanel.tsx`** — The panel component:
- Props: `content: string`, `onChange: (field: string, value: unknown) => void`, `mode: "panel" | "source"`, `onModeChange`, `collapsed: boolean`, `onToggleCollapsed`
- Parses frontmatter from content on each render (memoized)
- Renders field controls
- Unknown fields section at the bottom

**`PropertyRow.tsx`** — Individual field row:
- Props: `label: string`, `children: ReactNode`
- Consistent label/control layout

### CodeMirror Extension

**`frontmatterFold.ts`** — A `ViewPlugin` that:
- Finds the frontmatter block at the start of the document
- Replaces it with `Decoration.replace({ block: true })` (completely hidden)
- Uses a `Compartment` so it can be toggled on/off
- When Properties panel is active: fold extension is enabled (frontmatter hidden from editor)
- When in source mode: fold extension is disabled (raw YAML visible)

### Editor Settings

Add to `EditorSettings` interface:
- `propertiesMode: "panel" | "source"` (default: `"panel"`)
- `propertiesCollapsed: boolean` (default: `false`)

### NotesPage Integration

- `PropertiesPanel` rendered above the `MarkdownEditor` in the editor area
- When in panel mode, pass `hideFrontmatter` extension to MarkdownEditor via compartment
- Field change handler: updates content via `updateFrontmatterField()`, triggers autosave
- Mode toggle: switches between panel and source, reconfigures CodeMirror compartment

### Toolbar Button

Add a small toggle button in the `EditorToolbar` (next to line numbers):
- Icon: `{ }` or similar
- Toggles between panel and source mode
- Active state styling matches the line numbers toggle pattern

## Edge Cases

- **Note with no frontmatter** — Properties panel shows empty fields; editing any field creates a frontmatter block
- **Malformed YAML** — If the frontmatter can't be parsed, show a warning in the panel and auto-switch to source mode so the user can fix it
- **Title field in panel vs. existing title input** — If the note already has a title input area above the editor, the Properties panel's title field should replace it (avoid duplicate title editing areas)
- **Preview/split modes** — Properties panel is always visible above the editor/preview area. In preview-only mode, the panel is read-only.
- **Trash view** — Properties panel is read-only or hidden for trashed notes

## Dependencies

- [26 — Frontmatter Support](26-frontmatter-support.md) — shared parser/serializer, API and desktop integration
- Existing tag UI patterns (tag pills, add input) for consistency

## Testing

- Properties panel renders all recognized fields from frontmatter
- Editing a field updates the content's frontmatter
- Switching to source mode shows raw YAML in editor
- Switching back to panel mode re-parses YAML correctly
- Unknown fields displayed and preserved
- Collapse/expand state persisted to localStorage
- Mode toggle persisted to localStorage
- Empty frontmatter → empty panel fields
- Malformed YAML → warning + source mode fallback
- Read-only in preview mode and trash view
- CodeMirror fold extension correctly hides/shows frontmatter
