# 25 — Navigation & Layout Improvements (Obsidian-Inspired)

**Status:** Phases 1-5 Complete, Phases 6-8 Planned
**Phase:** UI Enhancement
**Priority:** Medium
**Completed Phases:** Sidebar Tabs, Ribbon, Note List Panel, Rich Note Rows, Audio Recording Refactor

## Summary

Sidebar tabs, always-visible ribbon, separate note list panel, richer note rows, Live Preview editor mode (CM6 decorations), and preview click-to-edit. Inspired by Obsidian's navigation patterns and three-column layout.

See `docs/ns/web/docs/feature_planning/25-navigation-and-layout-improvements.md` for the full plan — all features are implemented in ns-web first, then mirrored to ns-desktop.

## Phases

| Phase | Feature | Desktop Notes |
|---|---|---|
| 1 | Sidebar Tabs | Mirror SidebarTabs.tsx from web |
| 2 | Ribbon | Mirror Ribbon.tsx; may include desktop-only actions (e.g., local file sync status) |
| 3 | Separate Note List Panel | Mirror NoteListPanel.tsx; Tauri may need min-width adjustments for three-column layout on smaller windows |
| 4 | Richer Note List Rows | Mirror NoteRow.tsx and stripMarkdown.ts |
| 5 | Live Preview Editor Mode | Mirror livePreview.ts; uses same CM6 extensions, no desktop-specific changes needed |
| 6 | Preview Click-to-Edit | Mirror sourceMap.ts and preview handlers |
| 7 | Polish | Test responsive behavior in Tauri window; verify focus mode with ribbon |

## Desktop-Specific Considerations

- All new components are mirrored from ns-web
- Tauri webview may need `min-width` constraints for the three-column layout
- Ribbon must remain visible in Tauri's compact window states
- Live Preview uses the same CodeMirror 6 extensions — no Tauri-specific changes
- UI/UX must match web exactly (per project convention)
- Local file support (watch/diff/sync) is unaffected by layout changes
