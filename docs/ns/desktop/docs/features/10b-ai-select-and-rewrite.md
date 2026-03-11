# 10b — AI Features: Select-and-Rewrite

**Status:** Complete
**Phase:** 7 — AI
**Priority:** Medium
**Release:** 10b (second of 6 incremental AI releases)

## Summary

Ported the Select-and-Rewrite feature from ns-web to ns-desktop. Users select text in the editor, then use `Cmd/Ctrl+Shift+R` or right-click to open a floating menu with 6 rewrite actions (Rewrite, Make concise, Fix grammar, Convert to list, Expand, Summarize). The rewritten text replaces the selection. All backend work already done in ns-api — this was a frontend-only port. Desktop UI/UX matches the web app.

## What Was Implemented

### Rewrite Menu Extension (`src/editor/rewriteMenu.ts`) — NEW

- `rewriteExtension(rewriteFn)` — CodeMirror 6 extension combining all pieces
- `RewriteFn` type: `(text: string, action: RewriteAction) => Promise<string>`
- `REWRITE_ACTIONS` — 6 actions with labels: Rewrite, Make concise, Fix grammar, Convert to list, Expand, Summarize
- `rewriteFnFacet` — Facet to pass callback into extension
- `rewriteMenuField` — StateField holding menu state (`open | loading | error`)
- `openRewriteMenu`, `closeRewriteMenu`, `setRewriteLoading`, `setRewriteError` effects
- `createRewriteMenuDOM` — creates button DOM elements with inline styles (theme-aware dark/light colors via `EditorView.darkTheme` facet)
- `handleRewriteAction` — calls rewriteFn, replaces selection, handles errors with 2s auto-close
- `rewriteKeymap` — `Mod-Shift-r` opens menu (requires selection), `Escape` closes
- `contextMenuHandler` — right-click on selection opens menu
- Tooltip wrapper reset via `requestAnimationFrame` to strip CodeMirror's default `.cm-tooltip` border/background/padding
- UI font: `"Roboto", "Tahoma", Verdana, sans-serif` matching app UI (not editor monospace)

### AI API Client (`src/api/ai.ts`) — MODIFIED

- Added `RewriteAction` type: `"rewrite" | "concise" | "fix-grammar" | "to-list" | "expand" | "summarize"`
- Added `rewriteText(text, action)` — POST `/ai/rewrite`, returns rewritten text string

### NotesPage (`src/pages/NotesPage.tsx`) — MODIFIED

- Imported `rewriteExtension` and `rewriteText`
- Added rewrite extension to `aiExtensions` useMemo, gated on `aiSettings.rewrite`
- Rewrite placed before completions in extension array (matches web order)
- Added `aiSettings.rewrite` to dependency array

### SettingsPage (`src/pages/SettingsPage.tsx`) — MODIFIED

- Added "Select-and-rewrite" as 4th toggle in `AI_TOGGLE_SETTINGS` array
- Added 3 keyboard shortcut entries: `Ctrl/Cmd + Shift + R` (AI Rewrite), Right-click (AI Rewrite), Escape (Dismiss AI completion / rewrite menu)

### Web App Fix (`ns-web` MarkdownEditor + rewriteMenu)

- Moved rewrite menu styling from CodeMirror theme CSS to inline styles in `rewriteMenu.ts` (theme CSS was scoped and didn't reach tooltip elements)
- Added `requestAnimationFrame` parent tooltip reset in both ns-web and ns-desktop
- Removed all `.cm-rewrite-*` CSS rules from both dark and light themes in MarkdownEditor
- Added `fontFamily` to match UI sans-serif font
- Both packages now use identical inline-styled approach

## Tests

### New Test Files
- `src/__tests__/rewriteMenu.test.ts` — 9 tests: extension validity, StateField init, open/close effects, auto-close on doc change, auto-close on selection change, Mod-Shift-r with selection, no-op without selection, Escape close, pass-through when closed

### Modified Test Files
- `src/__tests__/ai-api.test.ts` — 3 new tests: rewriteText returns text, throws on error, sends correct request body
- `src/__tests__/SettingsPage.test.tsx` — 3 new tests: Select-and-rewrite toggle renders, AI Rewrite keyboard shortcuts display, dismiss rewrite menu shortcut

## Files Summary

| File | Action |
|------|--------|
| `ns-desktop/src/editor/rewriteMenu.ts` | Created |
| `ns-desktop/src/api/ai.ts` | Modified |
| `ns-desktop/src/pages/NotesPage.tsx` | Modified |
| `ns-desktop/src/pages/SettingsPage.tsx` | Modified |
| `ns-desktop/src/__tests__/rewriteMenu.test.ts` | Created |
| `ns-desktop/src/__tests__/ai-api.test.ts` | Modified |
| `ns-desktop/src/__tests__/SettingsPage.test.tsx` | Modified |
| `ns-web/src/editor/rewriteMenu.ts` | Modified (inline styles) |
| `ns-web/src/components/MarkdownEditor.tsx` | Modified (removed rewrite CSS) |
| `ns-desktop/src/components/MarkdownEditor.tsx` | Modified (removed rewrite CSS) |

## Dependencies

- [10a — AI Features: Foundation](10a-ai-features-foundation.md) — uses AI settings hook and API client
- [01 — Note Editor](01-note-editor.md) — rewrite integrates into CodeMirror editor
- ns-api `/ai/rewrite` endpoint — already implemented
