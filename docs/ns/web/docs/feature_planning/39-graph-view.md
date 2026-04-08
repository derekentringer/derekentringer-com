# 39 — Graph View

**Status:** Planned
**Phase:** Phase 3 — Differentiation
**Priority:** Medium

## Summary

Visual graph of notes connected by wiki-links. Obsidian's graph view is one of its most recognizable features and a major draw for knowledge management users. NoteSync already has wiki-links and a backlinks panel — graph view is the visual layer on top.

## Features

### Graph View

- **Full graph:** All notes as nodes, wiki-links as edges
- **Local graph:** Graph centered on the current note, showing N degrees of connections
- **Interactions:**
  - Pan and zoom
  - Click a node to navigate to that note
  - Hover to highlight connections
  - Drag nodes to rearrange
- **Visual encoding:**
  - Node size: proportional to number of connections (or note length)
  - Node color: by folder or tag
  - Orphan notes (no links): dimmed or grouped separately
  - Active note: highlighted
- **Filters:**
  - Show/hide by folder
  - Show/hide by tag
  - Show/hide orphan notes
  - Search to highlight a node

### Implementation

**Library options:**
- **D3.js force simulation** — most control, well-documented, widely used. Obsidian uses a custom WebGL renderer, but D3 Canvas is sufficient for <5000 notes.
- **Cytoscape.js** — graph-specific library, easier API than D3 for graph layouts
- **Sigma.js** — WebGL graph renderer, best performance for large graphs

**Recommended:** D3.js force simulation on Canvas. Good balance of performance, control, and bundle size. Switch to WebGL (Sigma) only if performance is an issue with >2000 nodes.

**Data source:**
- `NoteLink` table already stores source→target relationships
- API endpoint: `GET /notes/graph` → returns `{ nodes: [{id, title, folder}], edges: [{source, target}] }`
- Or compute client-side from existing `noteTitles` + note content (extract wiki-links)

### UI Integration

- **Access:** Command palette → "Open Graph View", sidebar button, or dedicated tab
- **Layout:** Full-screen overlay or dedicated panel (like the drawer)
- **Responsive:** Works on all screen sizes (touch pan/zoom on mobile)

## Files

### New
- `src/components/GraphView.tsx` — D3 canvas graph component
- `src/lib/graphData.ts` — transform notes/links into graph nodes/edges

### Modified
- `src/pages/NotesPage.tsx` — graph view toggle/panel
- `src/commands/registry.ts` — "Open Graph View" command

## Verification

- Graph renders all notes as nodes
- Wiki-links appear as edges between nodes
- Clicking a node navigates to that note
- Hover highlights connected nodes
- Filter by folder/tag works
- Orphan notes visible but dimmed
- Performance acceptable with 500+ notes
- Works on web, desktop, and mobile
