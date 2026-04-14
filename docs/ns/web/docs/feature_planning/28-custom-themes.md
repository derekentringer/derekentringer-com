# Feature 28: Custom Themes & Theme System

## Overview

Enable users to create, import, export, and share custom color themes. Built on the existing CSS variable system. The MS Teams theme serves as a reference implementation for third-party themes.

## Architecture

### Theme Format

Themes are JSON files mapping CSS variable names to hex values:

```json
{
  "name": "MS Teams Dark",
  "version": "1.0.0",
  "type": "dark",
  "author": "NoteSync",
  "colors": {
    "background": "#292841",
    "foreground": "#e0e0ef",
    "primary": "#6264a7",
    "primary-hover": "#5456a0",
    "muted": "#8b8ba7",
    "muted-foreground": "#8b8ba7",
    "border": "#3b3a55",
    "input": "#1f1e35",
    "card": "#2d2c45",
    "sidebar": "#1f1e35",
    "subtle": "#33325a",
    "accent": "rgba(98, 100, 167, 0.12)",
    "ring": "#6264a7",
    "primary-contrast": "#ffffff",
    "hljs-keyword": "#c792ea",
    "hljs-string": "#9ec3ff",
    "hljs-comment": "#6b6b8a",
    "hljs-number": "#f78c6c",
    "hljs-function": "#82aaff",
    "hljs-variable": "#f07178"
  }
}
```

### Built-in Themes

- **Dark** (default) -- current dark theme
- **Light** -- current light theme
- **System** -- follows OS preference
- **MS Teams** -- Microsoft Teams dark color scheme

### Custom Theme Support

- Users create themes in Settings > Appearance via a visual editor
- Themes stored in localStorage as JSON
- Import/export as `.json` files
- Each color slot has a color picker and hex input
- Live preview as colors are changed

### Theme Import from Other Platforms

**Obsidian themes** (.css):
- Parse CSS variables (`--background-primary`, `--text-normal`, etc.)
- Map to NoteSync variable names
- Auto-generate missing values from related colors

**VS Code themes** (.json):
- Parse `colors` object (`editor.background`, `editor.foreground`, etc.)
- Map to NoteSync variable names
- Extract syntax highlighting colors from `tokenColors`

### Plugin System Integration

Custom themes are an ideal plugin candidate:

**Core app provides:**
- `host.theme.setVariable(name, value)` -- set a single CSS variable
- `host.theme.applyTheme(themeJson)` -- apply a full theme
- `host.theme.getCurrentTheme()` -- read current theme
- `host.theme.onThemeChange(callback)` -- listen for theme switches

**Theme plugins can:**
- Provide new built-in themes (e.g., "Solarized", "Dracula", "Nord")
- Offer a visual theme editor UI
- Import themes from other platforms
- Connect to a community theme gallery
- Schedule theme changes (e.g., dark during night, light during day)

## Implementation Phases

### Phase 1: Built-in Themes (Done)
- [x] Dark, Light, System themes
- [x] MS Teams theme
- [x] CSS variable architecture

### Phase 2: Visual Theme Editor
- [ ] Color picker for each variable in Settings > Appearance
- [ ] Live preview
- [ ] Save as named custom theme
- [ ] Switch between saved custom themes

### Phase 3: Import/Export
- [ ] Export custom theme as `.json`
- [ ] Import `.json` theme files
- [ ] Obsidian CSS theme converter
- [ ] VS Code JSON theme converter

### Phase 4: Plugin API
- [ ] `host.theme` API surface
- [ ] Theme plugin manifest with `providesThemes` field
- [ ] Community theme gallery integration

## Competitors

| App | Theme System | Custom Themes | Import |
|-----|-------------|---------------|--------|
| Obsidian | CSS variables + snippets | Full CSS access | Community gallery |
| VS Code | JSON color themes | Extension marketplace | Theme converter tools |
| Notion | Light/Dark only | No | No |
| Bear | 20+ built-in themes | No | No |
| Slack | Sidebar color slots | Limited (sidebar only) | Share via URL |
| Craft | Light/Dark only | No | No |

NoteSync's approach (JSON + CSS variables + plugin API) offers Obsidian-level flexibility with VS Code-level structure.
