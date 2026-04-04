# 24 — Command Palette & Shortcut System

**Status:** Planned
**Phase:** UI Enhancement
**Priority:** Medium

## Summary

Centralized keyboard shortcut registry, Command Palette (Cmd+P), Quick Switcher (Cmd+O), and ~14 new shortcuts for NoteSync. Inspired by Obsidian's keyboard-first UX. Replaces the current scattered shortcut implementation (inline event listeners in NotesPage.tsx, CodeMirror keymaps, hardcoded Settings page array) with a unified command system.

See `docs/ns/web/docs/feature_planning/24-command-palette-shortcuts.md` for the full plan — this feature is implemented in ns-web first, then mirrored to ns-desktop in Phase 6.

## Desktop-Specific Notes

- All `commands/` files are mirrored from ns-web with desktop-specific additions
- Desktop-only command: `tab:close` (`Mod-w`) — already exists, migrated to registry
- UI/UX must match web exactly (per project convention)
- Tauri-specific keyboard handling: verify shortcuts don't conflict with macOS system shortcuts in the Tauri webview
