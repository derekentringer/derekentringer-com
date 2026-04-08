# 24 — Command Palette & Shortcut System

**Status:** Complete
**Phase:** UI Enhancement
**Priority:** Medium
**Updated:** 2026-04-07 (revised for feature plan 25 UI changes)

## Summary

Centralized keyboard shortcut registry, Command Palette (Cmd+P), Quick Switcher (Cmd+O), and ~25 shortcuts for NoteSync. Inspired by Obsidian's keyboard-first UX. Replaces the current scattered shortcut implementation (inline event listeners in NotesPage.tsx, CodeMirror keymaps, hardcoded Settings page array) with a unified command system.

## Current State

~11 shortcuts scattered across files with no central registry:

| Shortcut | Action | Location |
|---|---|---|
| Cmd+S | Save note | NotesPage.tsx (global) + MarkdownEditor.tsx (editor) |
| Cmd+K | Focus search | NotesPage.tsx (global) |
| Cmd+Shift+D | Toggle focus mode | NotesPage.tsx (global) |
| Cmd+W | Close tab | NotesPage.tsx (desktop only) |
| Cmd+B | Bold | MarkdownEditor.tsx (CodeMirror) |
| Cmd+I | Italic | MarkdownEditor.tsx (CodeMirror) |
| Cmd+Shift+Space | Continue writing | ghostText.ts (CodeMirror) |
| Cmd+Shift+R | AI Rewrite | rewriteMenu.ts (CodeMirror) |
| Tab | Accept AI completion | ghostText.ts (CodeMirror) |
| Escape | Dismiss AI completion/rewrite | ghostText.ts / rewriteMenu.ts |

Settings page has a hardcoded `KEYBOARD_SHORTCUTS` array (SettingsPage.tsx).

### UI Context (Post Feature Plan 25)

The navigation layout has been restructured with:
- **Ribbon** — always-visible vertical strip on far left (new note, audio, sync, trash, import, settings, admin, sign out)
- **Sidebar tabs** — Explorer, Search, Favorites, Tags (switch sidebar content)
- **Note list panel** — separate resizable column between sidebar and editor (stacks below sidebar on narrow viewports)
- **Editor toolbar** — view mode tabs (Editor, Split, Live, Preview), formatting buttons, line number toggle
- **Drawer tabs** — right-side panel with AI Assistant, Version History, TOC
- **Focus mode** — Cmd+Shift+D hides sidebar, note list, drawer; keeps ribbon visible

## Architecture

### Central Registry (singleton class + React context)

- **Types** in `packages/ns-shared/src/commands.ts` — shared between web and desktop
- **Runtime registry** in each package's `src/commands/registry.ts` — class holding command definitions, active handlers, and shortcut bindings
- **React bridge** via `CommandContext.tsx` provider + `useCommands()` hook for registering handlers
- **Global keydown listener** via `useShortcuts()` hook, mounted once in App

CodeMirror keybindings stay in CodeMirror (Bold, Italic, ghost text, rewrite) but are also registered in the command registry for display in the palette and settings. The global listener skips `scope: "editor"` commands when the editor is focused.

### Core Types

```typescript
type CommandScope = "global" | "editor" | "sidebar";

interface CommandDefinition {
  id: string;                              // e.g. "note:save", "editor:bold", "palette:open"
  label: string;                           // Human-readable: "Save Note"
  category: string;                        // "Note", "Editor", "Navigation", "AI", "View", "Sidebar", "Drawer"
  scope: CommandScope;
  defaultBinding: ShortcutBinding | null;  // null = palette-only, no default shortcut
  desktopOnly?: boolean;
  when?: string;                           // condition: "editorFocused", "hasSelection"
}

interface ShortcutBinding {
  key: string;                             // CodeMirror notation: "Mod-s", "Mod-Shift-d"
  mac?: string;                            // Override for Mac if different
}

type CommandHandler = () => boolean | void;
```

### Scope Handling

Three scopes with clear priority:

1. **`"editor"`** — Only active when CodeMirror has focus. Handled by CodeMirror's own keymap system. The global listener ignores these.
2. **`"global"`** — Active anywhere on the page. Handled by the `useShortcuts` hook's `window.addEventListener("keydown", ...)`.
3. **`"sidebar"`** — Active when sidebar has focus (future use).

When a key is pressed: CodeMirror processes first if editor is focused → global listener catches everything else.

## Commands & Shortcuts

### Core Commands

| Command | Shortcut | Category | Notes |
|---|---|---|---|
| `palette:open` | `Mod-p` | Navigation | Command Palette |
| `switcher:open` | `Mod-o` | Navigation | Quick Switcher (fuzzy note search) |
| `note:new` | `Mod-n` | Note | Wire to existing `handleCreate()` |
| `note:save` | `Mod-s` | Note | Already implemented — migrate to registry |
| `note:delete` | — | Note | Palette-only, no shortcut |
| `note:export-md` | — | Note | Palette-only |

### View & Navigation

| Command | Shortcut | Category | Notes |
|---|---|---|---|
| `view:cycle-mode` | `Mod-e` | View | Cycle: Editor → Split → Live → Preview |
| `view:focus-mode` | `Mod-Shift-d` | View | Already implemented — migrate to registry |
| `nav:settings` | `Mod-,` | Navigation | Navigate to settings |
| `nav:search` | `Mod-k` | Navigation | Already implemented — migrate to registry |

### Sidebar & Panels

| Command | Shortcut | Category | Notes |
|---|---|---|---|
| `sidebar:toggle` | `Mod-\` | Sidebar | Toggle sidebar (folders) visibility |
| `notelist:toggle` | `Mod-Shift-\` | Sidebar | Toggle note list panel visibility |
| `sidebar:explorer` | `Mod-1` | Sidebar | Switch to Explorer tab |
| `sidebar:search` | `Mod-2` | Sidebar | Switch to Search tab |
| `sidebar:favorites` | `Mod-3` | Sidebar | Switch to Favorites tab |
| `sidebar:tags` | `Mod-4` | Sidebar | Switch to Tags tab |

### Drawer

| Command | Shortcut | Category | Notes |
|---|---|---|---|
| `drawer:assistant` | `Mod-Alt-a` | Drawer | Toggle AI Assistant panel |
| `drawer:history` | `Mod-Alt-h` | Drawer | Toggle Version History panel |
| `drawer:toc` | `Mod-Alt-t` | Drawer | Toggle Table of Contents panel |

### Tab Navigation

| Command | Shortcut | Category | Notes |
|---|---|---|---|
| `tab:close` | `Mod-w` | Navigation | Desktop only — close active tab |
| `tab:prev` | `Mod-Shift-[` | Navigation | Switch to previous open tab |
| `tab:next` | `Mod-Shift-]` | Navigation | Switch to next open tab |

### Editor Formatting

| Command | Shortcut | Category | Notes |
|---|---|---|---|
| `editor:bold` | `Mod-b` | Editor | Already in CodeMirror — register for display |
| `editor:italic` | `Mod-i` | Editor | Already in CodeMirror — register for display |
| `editor:strikethrough` | `Mod-Shift-x` | Editor | Wrap with `~~` |
| `editor:code` | `Mod-Shift-c` | Editor | Wrap with backticks |
| `editor:heading` | `Mod-Shift-h` | Editor | Cycle heading level |
| `editor:link` | — | Editor | No default (Cmd+K stays as search); palette-only |
| `editor:wiki-link` | `Mod-Shift-k` | Editor | Insert `[[]]` template |
| `editor:toggle-checkbox` | `Mod-Enter` | Editor | Toggle markdown checkbox |

### AI

| Command | Shortcut | Category | Notes |
|---|---|---|---|
| `ai:continue-writing` | `Mod-Shift-Space` | AI | Already in CodeMirror — register for display |
| `ai:rewrite` | `Mod-Shift-r` | AI | Already in CodeMirror — register for display |

**Total: ~31 commands (~25 with shortcuts, ~6 palette-only)**

## Components

### Command Palette (Cmd+P)

- Full-screen overlay modal (`fixed inset-0 z-50`)
- Input field at top with autofocus and fuzzy search
- Each row: command label, category tag, shortcut badge (if bound)
- Recently-used commands stored in localStorage, shown at top when query is empty
- Arrow keys navigate, Enter executes, Escape closes
- Executing a command closes the palette and runs the handler

### Quick Switcher (Cmd+O)

- Same visual shell as Command Palette
- Fuzzy searches note titles from existing `noteTitles` state
- Recently opened notes float to top when query is empty
- Enter navigates to selected note
- Shows folder path as secondary text if present

## File Structure

### New files

```
packages/ns-shared/src/commands.ts              # Types
packages/ns-web/src/commands/registry.ts        # CommandRegistry class + DEFAULT_COMMANDS
packages/ns-web/src/commands/CommandContext.tsx  # React context provider
packages/ns-web/src/commands/useCommands.ts     # Hook: register/unregister handlers
packages/ns-web/src/commands/useShortcuts.ts    # Hook: global keydown dispatcher
packages/ns-web/src/commands/CommandPalette.tsx  # Cmd+P modal
packages/ns-web/src/commands/QuickSwitcher.tsx   # Cmd+O modal
packages/ns-web/src/commands/fuzzyMatch.ts      # Fuzzy string matching
packages/ns-web/src/commands/formatShortcut.ts  # "Mod-Shift-d" -> "Cmd + Shift + D"
packages/ns-desktop/src/commands/               # Mirror with desktop-specific commands
```

### Files to modify

- `packages/ns-shared/src/index.ts` — add commands export
- `packages/ns-web/src/App.tsx` — wrap with `<CommandProvider>`
- `packages/ns-web/src/pages/NotesPage.tsx` — register command handlers, remove inline keydown listener
- `packages/ns-web/src/pages/SettingsPage.tsx` — replace hardcoded array with registry-driven rendering
- `packages/ns-desktop/src/App.tsx` — wrap with `<CommandProvider>`
- `packages/ns-desktop/src/pages/NotesPage.tsx` — same migration as web
- `packages/ns-desktop/src/pages/SettingsPage.tsx` — same migration as web

### Unchanged files

- `MarkdownEditor.tsx` — CodeMirror keymaps stay as-is (dual-registered for display)
- `ghostText.ts`, `rewriteMenu.ts` — editor extensions stay as-is (dual-registered for display)

## Implementation Phases

### Phase 1: Foundation

1. Create `ns-shared/src/commands.ts` with types
2. Export from `ns-shared/src/index.ts`
3. Create `ns-web/src/commands/registry.ts` — `CommandRegistry` class with `register()`, `unregister()`, `execute()`, `getAllCommands()`, `getBinding()` + `DEFAULT_COMMANDS` array (all ~30 commands)
4. Create `ns-web/src/commands/formatShortcut.ts`
5. Create `ns-web/src/commands/fuzzyMatch.ts`
6. Create `ns-web/src/commands/CommandContext.tsx` + `useCommands.ts`
7. Create `ns-web/src/commands/useShortcuts.ts`
8. Wrap `ns-web/src/App.tsx` with `<CommandProvider>`
9. Write tests for registry, fuzzyMatch, formatShortcut

### Phase 2: Migrate Existing Shortcuts

1. In `NotesPage.tsx`, use `useCommands()` to register handlers for `note:save`, `nav:search`, `view:focus-mode`
2. Remove the inline `useEffect` keydown listener
3. Verify all existing shortcuts work identically
4. Update `SettingsPage.tsx` to render from `registry.getAllCommands()`
5. Mirror all changes to `ns-desktop`

### Phase 3: Command Palette

1. Create `CommandPalette.tsx`
2. Register `palette:open` command (`Mod-p`)
3. Render `<CommandPalette>` in NotesPage or App-level
4. Test in both packages

### Phase 4: Quick Switcher

1. Create `QuickSwitcher.tsx`
2. Register `switcher:open` (`Mod-o`)
3. Pass `noteTitles` data via context or props
4. Test note navigation in both packages

### Phase 5: New Shortcuts

1. `Mod-n` — new note
2. `Mod-e` — cycle view mode (Editor → Split → Live → Preview)
3. `Mod-,` — navigate to settings
4. `Mod-\` — toggle sidebar (folders)
5. `Mod-Shift-\` — toggle note list panel
6. `Mod-1/2/3/4` — switch sidebar tabs (Explorer, Search, Favorites, Tags)
6. `Mod-Alt-a/h/t` — toggle drawer tabs (AI Assistant, History, TOC)
7. `Mod-Shift-[/]` — previous/next tab
8. `Mod-Enter` — toggle checkbox
9. `Mod-Shift-x` — strikethrough
10. `Mod-Shift-c` — inline code
11. `Mod-Shift-h` — cycle heading
12. `Mod-Shift-k` — insert wiki-link

### Phase 6: Polish & Desktop Sync

1. Mirror all `commands/` files to `ns-desktop`
2. Add desktop-specific commands (`tab:close` with `Mod-w`)
3. Animations on palette/switcher open/close
4. Ensure Mac/Windows key display is correct
5. End-to-end test all shortcuts on both platforms

## Verification

1. **Existing shortcuts**: All current shortcuts work exactly as before
2. **Command Palette**: Cmd+P opens, fuzzy search filters, Enter executes, Escape closes, shortcuts shown inline
3. **Quick Switcher**: Cmd+O opens, fuzzy matches note titles, Enter navigates to note
4. **New shortcuts**: Each new shortcut triggers its action
5. **Sidebar tabs**: Mod-1 through Mod-4 switch tabs correctly
6. **Drawer tabs**: Mod-Alt-A/H/T toggle drawer panels
7. **View cycle**: Mod-E cycles through all 4 view modes
8. **Tab navigation**: Mod-Shift-[/] cycles through open tabs
9. **Settings page**: Shows all shortcuts from registry (not hardcoded), matches between web and desktop
10. **Type check**: `npx turbo run type-check` passes
11. **Tests**: `npx turbo run test` passes
12. **Build**: `npx turbo run build` succeeds

## Key Design Decisions

- **Why not a shared component package?** No shared React component package exists between ns-web and ns-desktop. Creating one would require significant build tooling changes. The `commands/` directory (~8 files, ~500 lines) is mirrored across both packages. Types in `ns-shared` keep them in sync.
- **Why a class-based registry?** Must be accessible from both React hooks (palette UI) and raw DOM/CodeMirror handlers. A class singleton with a React context wrapper gives both worlds access.
- **Why keep CodeMirror keybindings separate?** CodeMirror has sophisticated key handling for input composition and editor-specific event ordering. Dual-registration (CodeMirror handles keystroke, registry knows about command for display) is how VS Code and Obsidian both work.
- **Why Cmd+K stays as search?** NoteSync convention. Obsidian uses Cmd+K for insert link. Users who want Obsidian behavior can rebind later when custom hotkeys are added.
- **Why Mod-1/2/3/4 for sidebar tabs?** Matches VS Code convention (Cmd+1 for first editor group). Sidebar tabs are the primary navigation — number keys provide the fastest access.
- **Why Mod-e cycles instead of toggles?** With 4 view modes (Editor, Split, Live, Preview), a simple toggle would only switch between 2. Cycling through all 4 gives full keyboard access to every mode.
- **Why Mod-Alt for drawer tabs?** Keeps them distinct from sidebar tabs (Mod-number) and editor shortcuts (Mod-Shift). Alt modifier signals "secondary panel" — matching the drawer's role as a secondary right-side panel.
