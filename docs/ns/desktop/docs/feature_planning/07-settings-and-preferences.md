# 07 — Settings & Preferences

**Status:** Not Started
**Phase:** 5 — Settings
**Priority:** Medium

## Summary

Settings panel for theme, editor preferences, AI feature toggles, sync configuration, and Google Drive account management.

## Requirements

- **Appearance**:
  - Theme toggle: dark / light / system
  - Configurable accent color palette (11 presets with dark/light variants and contrast-aware text)
  - Font size adjustment for the editor (slider)
  - Sidebar width (draggable or preset sizes)
- **Editor preferences**:
  - Default view mode: editor-only, split-pane, or preview-only
  - Line numbers on/off
  - Word wrap on/off
  - Auto-save delay slider (default 500ms)
  - Markdown preview theme
  - Tab size (2 or 4 spaces)
- **Keyboard shortcuts reference**:
  - Read-only reference panel listing all editor and app keyboard shortcuts
  - Grouped by category (editor, navigation, AI, etc.)
- **AI settings**:
  - Master AI toggle (enable/disable all AI features)
  - Per-feature toggles:
    - Inline ghost text completions
    - Continue writing (Ctrl+Shift+Space)
    - Smart auto-tagging
    - Note summarization
    - Select-and-rewrite (right-click or Ctrl+Shift+R)
    - Semantic search
    - Q&A assistant (requires semantic search enabled)
    - Audio notes
    - Duplicate detection
  - Completion styles (Continue writing, Markdown assist, Brief) and debounce delay (200-1500ms)
  - Audio mode selection (meeting, lecture, memo, verbatim)
  - Info tooltips on all AI settings explaining each feature
  - Daily API request limit
  - AI usage stats (requests today / limit)
- **Sync settings**:
  - Sync status: last synced time, items pending
  - Sync interval (default 30 seconds)
  - Manual "Sync Now" button
  - "Reset & Full Sync" for recovery
  - API endpoint URL (default: production ns-api on Railway)
- **Google Drive**:
  - Connected account info (email)
  - Disconnect / revoke access
  - "Import from Google Drive" shortcut (opens import wizard)
- **Version history**:
  - Capture interval: every save, 5 min, 15 min (default), 30 min, 60 min
- **Trash**:
  - Trash retention period (7/14/30/60/90 days or Never)
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

- [00 — Project Scaffolding](../features/00-project-scaffolding.md) — needs app shell and SQLite
- [09 — Sync Engine](09-sync-engine.md) — sync settings depend on sync engine being implemented
- [10 — AI Features](10-ai-features.md) — AI toggles depend on AI features being implemented

## Open Questions

- Should settings sync across devices, or be per-device?
- Keyboard shortcut customization (remap editor shortcuts)?
- Should there be a "Reset to Defaults" option?
