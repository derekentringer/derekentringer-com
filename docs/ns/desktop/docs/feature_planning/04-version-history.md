# 04 — Version History

**Status:** Not Started
**Phase:** 4 — UI Features
**Priority:** High

## Summary

Automatic version snapshots of notes on save, with a version list panel, unified/split diff views, and one-click restore. Configurable snapshot interval to control storage. Matches the ns-web implementation for feature parity.

## Requirements

- **Version snapshots**:
  - Snapshot note content on save at a configurable interval (every save, 5 min, 15 min, 30 min, 60 min)
  - Cap at 50 versions per note (oldest purged when exceeded)
  - Each version stores: full content, timestamp, version number
  - Cascade delete versions when the parent note is removed
- **Version list panel**:
  - Tabbed right-side drawer shared with AI Assistant panel
  - Stacked tab buttons (chat + clock icons)
  - List of all versions for the current note, sorted newest first
  - Each entry shows timestamp and relative time ("2 hours ago")
- **Diff views**:
  - Unified diff: single pane with green (added) / red (removed) highlighting
  - Split diff: side-by-side comparison of selected version vs. current
  - Toggle between unified and split modes
- **Restore**:
  - Two-step restore: click restore → confirm → replace current content
  - Auto-dismissing success toast after restore
- **Resizable drawer**:
  - Right-side drawer panel with draggable resize handle
  - Persisted width in localStorage

## Technical Considerations

- SQLite `note_versions` table: `id`, `note_id`, `content`, `version_number`, `created_at`
- Diff rendering: use a lightweight diff library (e.g., `diff` npm package) to compute and render changes
- Snapshot decision: compare current timestamp against last version's timestamp and the configured interval
- Drawer panel shared with AI chat — use tab switching, only one panel visible at a time
- Version interval setting stored in SQLite settings table

## Dependencies

- [01 — Note Editor](01-note-editor.md) — needs the editor and save flow to trigger version captures
- [07 — Settings & Preferences](07-settings-and-preferences.md) — version interval setting in preferences

## Open Questions

- Should versions sync to the central database via the sync engine, or remain local-only?
- Should the diff view support word-level highlighting or just line-level?
