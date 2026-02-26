# 07 — Settings & Preferences

**Status:** Not Started
**Phase:** 6 — Polish
**Priority:** Low

## Summary

Settings panel for theme, editor preferences, AI feature toggles, sync configuration, and Google Drive account management.

## Requirements

- **Appearance**:
  - Theme toggle: dark / light / system
  - Font size adjustment for the editor
  - Sidebar width (draggable or preset sizes)
- **Editor preferences**:
  - Default view mode: editor-only, split-pane, or preview-only
  - Line numbers on/off
  - Word wrap on/off
  - Auto-save delay (default 500ms)
  - Markdown preview theme
  - Tab size (2 or 4 spaces)
- **AI settings**:
  - Master AI toggle (enable/disable all AI features)
  - Per-feature toggles:
    - Inline ghost text completions
    - Smart auto-tagging
    - Note summarization
    - Semantic search
    - Q&A over notes
    - Duplicate detection
  - Completion debounce delay
  - Daily API request limit
  - AI usage stats (requests today / limit)
- **Sync settings**:
  - Sync status: last synced time, items pending
  - Sync interval (default 30 seconds)
  - Manual "Sync Now" button
  - "Reset & Full Sync" for recovery
  - API endpoint URL (default: production notesync-api on Railway)
- **Google Drive**:
  - Connected account info (email)
  - Disconnect / revoke access
  - "Import from Google Drive" shortcut (opens import wizard)
- **Trash**:
  - Auto-purge interval (default 30 days)
  - "Empty Trash Now" button
- **About**:
  - App version
  - Links to GitHub repo

## Technical Considerations

- Settings stored in SQLite (`settings` table or a key-value store)
- Settings sync to central database so preferences carry across devices
- Theme applies to both the app shell and the CodeMirror editor
- CodeMirror theme must be updated dynamically when the user toggles dark/light mode
- Tauri supports native window theme detection (`window.matchMedia('(prefers-color-scheme: dark)')`)

## Dependencies

- [00 — Project Scaffolding](00-project-scaffolding.md) — needs app shell and SQLite
- [05 — Sync Engine](05-sync-engine.md) — sync settings depend on sync engine being implemented
- [06 — AI Features](06-ai-features.md) — AI toggles depend on AI features being implemented

## Open Questions

- Should settings sync across devices, or be per-device?
- Keyboard shortcut customization (remap editor shortcuts)?
- Should there be a "Reset to Defaults" option?
