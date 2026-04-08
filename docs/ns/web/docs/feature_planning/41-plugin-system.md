# 41 — Plugin & Extension System

**Status:** Planned
**Phase:** Phase 4 — Ecosystem
**Priority:** Medium

## Summary

Obsidian's plugin ecosystem is its moat — community members build features for free, creating lock-in and viral growth. Even a basic extension system (custom CSS themes, user scripts, simple hooks) creates community investment. Users who customize their setup don't leave.

## Phases

### Phase A: Custom CSS Themes (Low effort, high impact)

- User can paste custom CSS in Settings
- CSS injected into the app at runtime
- Share themes via community (GitHub repo, forum, or built-in gallery)
- Built-in theme presets beyond the current dark/light + accent color
- **This alone creates a community** — people love sharing themes

### Phase B: Slash Commands (Medium effort)

- User-defined `/commands` that insert text templates
- Example: `/today` inserts current date, `/meeting` inserts meeting template
- Stored in settings, synced across devices
- Simple but powerful — covers many use cases without a full plugin API

### Phase C: Plugin API (High effort)

- Sandboxed JavaScript plugins that can:
  - Add sidebar panels
  - Add commands to the command palette
  - Hook into note lifecycle events (create, save, delete)
  - Add CodeMirror extensions (new syntax highlighting, widgets)
  - Add markdown preview render overrides
- **Plugin manifest:** JSON describing name, version, author, permissions
- **Distribution:** Community plugin gallery (curated) or direct install from URL
- **Security:** Plugins run in a sandboxed iframe or Web Worker with limited API access

### Phase D: Community Gallery

- Web-based plugin/theme browser
- Install with one click
- Ratings, download counts, update notifications
- Curated by maintainer (you) to prevent malicious plugins

## Key Design Decisions

- **Start with CSS themes** — lowest effort, highest community engagement
- **Slash commands before full plugins** — covers 80% of use cases with 10% of the effort
- **Sandboxing is non-negotiable** — plugins must not be able to access other users' data, make arbitrary network requests, or break the app
- **Don't rush the full plugin API** — Obsidian took years to build theirs. CSS themes + slash commands can sustain community engagement for a long time.

## Verification

- Custom CSS applies immediately on save
- CSS persists across sessions and devices
- Slash commands insert correct content
- Plugins can add commands to palette
- Plugin sandbox prevents unauthorized access
- Plugin installation and removal work cleanly
