# 06 — Settings

**Status:** Complete
**Phase:** 4 — Polish
**Priority:** Low

## Summary

Settings page for theme, editor preferences, AI feature toggles, accent color personalization, and offline cache management.

## What's Implemented

The settings page was built incrementally across several releases:

### AI Settings (implemented as part of 04a–04g)
- **Master AI toggle**: Enable/disable all AI features at once
- **Per-feature toggles**: Inline completions, Continue writing, Summarize, Auto-tag suggestions, Select-and-rewrite, Semantic search, Audio notes, AI assistant chat
- **Completion style radio group**: Continue writing, Markdown assist, Brief (shown when completions enabled)
- **Completion delay select**: Configurable debounce (200ms–1.5s)
- **Audio mode radio group**: Meeting notes, Lecture notes, Memo, Verbatim (shown when audio notes enabled)
- **Info tooltips**: Hover tooltips on all toggles, completion styles, and audio modes via InfoIcon component
- **Semantic search status**: Embedding count and pending count shown when semantic search enabled
- **Keyboard shortcuts reference**: Platform-aware (Cmd/Ctrl) shortcut table
- **Settings persisted in localStorage** under `"ns-ai-settings"`

### Appearance (06)
- **Theme toggle**: Dark / Light / System with immediate application via `data-theme` attribute
- **Editor font size**: Range slider (10px–24px)
- **Accent color picker**: 11-color preset palette (Lime, Blue, Cyan, Purple, Orange, Teal, Pink, Red, Amber, Black, White) with circular swatches, checkmark indicator, and immediate CSS variable + CodeMirror theme updates; each preset has dark and light variants; black preset uses white contrast text for readability

### Editor Preferences (06)
- **Default view mode**: Editor / Split / Preview radio group
- **Line numbers**: Toggle on/off
- **Word wrap**: Toggle on/off
- **Auto-save delay**: Select (500ms–5s)
- **Tab size**: 2 or 4 spaces radio group
- **Settings persisted in localStorage** under `"ns-editor-settings"`

### Offline Cache (implemented as part of 05)
- **Cached notes count**: Live count from IndexedDB
- **Max cached notes**: Select (50–500)
- **Last synced timestamp**: Relative time display
- **Clear cache**: Confirmation flow with cancel option

### Route & Navigation
- **Route**: `/settings` with back-to-notes navigation
- **Single-column scrollable layout**: All sections stacked vertically

## Technical Details

- **Editor settings** stored in localStorage under `"ns-editor-settings"` with validated loading (invalid values fall back to defaults, numbers clamped to valid ranges)
- **AI settings** stored in localStorage under `"ns-ai-settings"` with similar validation
- **Theme system**: `data-theme` attribute on `<html>` controls CSS custom properties; `useThemeAttribute()` in App.tsx reads settings from localStorage on mount and on `storage` events
- **Accent color system**: `ACCENT_PRESETS` lookup maps preset names to dark/light hex values; `resolveAccentColor()` helper picks the right variant; CSS variables (`--color-primary`, `--color-primary-hover`, `--color-ring`, `--color-primary-contrast`) updated via `document.documentElement.style.setProperty()`; CodeMirror themes rebuilt dynamically via factory functions (`createDarkTheme(accent)`, `createLightTheme(accent)`, etc.) and reconfigured through compartments
- **`useEditorSettings` hook**: Custom React hook with `settings` state and `updateSetting` callback; persists to localStorage on every change
- **`useAiSettings` hook**: Same pattern for AI-specific settings

## Key Files

| File | Purpose |
|------|---------|
| `hooks/useEditorSettings.ts` | Editor settings hook, `ACCENT_PRESETS`, `resolveAccentColor()` |
| `hooks/useAiSettings.ts` | AI settings hook with validation |
| `pages/SettingsPage.tsx` | Settings UI with all sections |
| `App.tsx` | `useThemeAttribute()`, `applyAccentCssVars()` |
| `components/MarkdownEditor.tsx` | Theme factory functions, `accentColor` prop |
| `styles/global.css` | CSS custom properties for dark/light/system themes |

## Dependencies

- [00 — Project Scaffolding](00-project-scaffolding.md) — needs API and web app
- [01 — Auth](01-auth.md) — settings page requires authentication
- [04 — AI Features](04-ai-features.md) — AI toggles depend on AI features
- [05 — Offline Cache](05-offline-cache.md) — cache settings depend on offline cache

## Future Considerations

- Account settings (change password, active sessions, logout)
- Trash settings (auto-purge interval, empty trash)
- Server-synced settings (Prisma `Settings` model) for cross-device consistency
- Keyboard shortcut customization
