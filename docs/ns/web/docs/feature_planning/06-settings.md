# 06 — Settings

**Status:** Partial (AI settings implemented as part of 04a–04d.1; remaining sections not started)
**Phase:** 4 — Polish
**Priority:** Low

## Summary

Settings page for theme, editor preferences, AI feature toggles, and account management.

## What's Already Implemented

The AI settings section was built incrementally as part of AI feature releases (04a–04d.1):
- **Per-feature toggles**: Inline completions, Summarize, Auto-tag suggestions, Select-and-rewrite, Semantic search, Audio notes (all default OFF)
- **Completion style radio group**: Continue writing, Markdown assist, Brief (shown when completions enabled)
- **Audio mode radio group**: Meeting notes, Lecture notes, Memo, Verbatim (shown when audio notes enabled)
- **Info tooltips**: Hover tooltips on all toggles, completion styles, and audio modes via InfoIcon component
- **Semantic search status**: Embedding count and pending count shown when semantic search enabled
- **Keyboard shortcuts reference**: Platform-aware (Cmd/Ctrl) shortcut table in a side-by-side card
- **Two-column layout**: AI Features card and Keyboard Shortcuts card side by side on medium+ screens
- **Settings persisted in localStorage** under `"ns-ai-settings"`
- **Route**: `/settings` with back-to-notes navigation

## Requirements

- **Appearance**:
  - Theme toggle: dark / light / system
  - Font size adjustment for the editor
- **Editor preferences**:
  - Default view mode: editor-only, split-pane, or preview-only
  - Line numbers on/off
  - Word wrap on/off
  - Auto-save delay (default 500ms)
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
  - Usage stats (requests today / limit)
- **Account**:
  - Change password
  - Active sessions
  - Logout
- **Offline cache**:
  - Cache size (number of notes cached)
  - "Clear Cache" button
  - Last synced timestamp
- **Trash**:
  - Auto-purge interval (default 30 days)
  - "Empty Trash Now" button

## Technical Considerations

- Settings stored in the database (`Settings` model in Prisma) so they persist across browsers
- API endpoints:

  | Method | Path | Auth | Description |
  |--------|------|------|-------------|
  | GET | `/settings` | Yes | Get all settings |
  | PATCH | `/settings` | Yes | Update settings |

- Settings cached in React state (context or Zustand); refreshed on page load
- Theme applies to CodeMirror via dynamic theme extension
- Settings sync: desktop and mobile pull settings from the API to stay consistent

## Dependencies

- [00 — Project Scaffolding](00-project-scaffolding.md) — needs API and web app
- [01 — Auth](01-auth.md) — settings page requires authentication
- [04 — AI Features](04-ai-features.md) — AI toggles depend on AI features
- [05 — Offline Cache](05-offline-cache.md) — cache settings depend on offline cache

## Open Questions

- Should settings be per-device or global (synced across all platforms)?
- Keyboard shortcut customization?
