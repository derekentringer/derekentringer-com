# 10f — AI Features: Continue Writing & Structure Suggestions

**Status:** Complete
**Phase:** 7 — AI
**Priority:** Medium
**Release:** 10f (sixth and final AI release)

## Summary

Ported the continue writing feature from ns-web (feature 04g) to ns-desktop. When users press Cmd/Ctrl+Shift+Space, the editor auto-selects a completion style — `"structure"` for short documents (<50 chars) or `"paragraph"` for longer ones — and streams a ghost text suggestion. This completes the AI feature set for ns-desktop, achieving full parity with ns-web.

## What Was Implemented

### Ghost Text Extension (`src/editor/ghostText.ts`) — MODIFIED

- Added `ContinueWritingFetchFn` type: `(context: string, signal: AbortSignal, style: string) => AsyncGenerator<string>`
- Added exported `continueWritingKeymap(fetchFn, getTitle?)` function
- Returns CodeMirror extension array with `ghostTextField`, `ghostTextDecorations`, `ghostTextKeymap`, and `Prec.highest` keymap for `Mod-Shift-Space`
- Style auto-selection: `doc.trim().length < 50 ? "structure" : "paragraph"`
- Context: last ~500 chars before cursor, falls back to `Title: ${title}` if editor context is empty
- Won't trigger if ghost text is already showing
- Reuses existing ghost text rendering (Tab accept, Escape dismiss)

### NotesPage (`src/pages/NotesPage.tsx`) — MODIFIED

- Imported `continueWritingKeymap` from `../editor/ghostText.ts`
- Imported `CompletionStyle` type from `../hooks/useAiSettings.ts`
- Added `continueWritingKeymap` to `aiExtensions` useMemo, gated on `aiSettings.continueWriting`
- Uses `titleRef` to pass current note title without recreating extensions
- Added `aiSettings.continueWriting` to useMemo dependency array

### SettingsPage (`src/pages/SettingsPage.tsx`) — MODIFIED

- Added `"continueWriting"` to `AI_TOGGLE_SETTINGS` type union and array (after "Inline completions")
- Label: "Continue writing", info tooltip explains Cmd/Ctrl+Shift+Space behavior
- Added keyboard shortcut entry: "Continue writing / suggest structure" with Ctrl+Shift+Space / Cmd+Shift+Space

## Tests

### `__tests__/ghostText.test.ts` — 3 new tests

1. `continueWritingKeymap` returns a valid Extension
2. Uses `"paragraph"` style when document has >50 chars
3. Uses `"structure"` style when document has <50 chars

### `__tests__/SettingsPage.test.tsx` — 2 new tests

1. "Continue writing" toggle renders in AI Features section
2. "Continue writing / suggest structure" shortcut appears in Keyboard Shortcuts section

## Architecture Notes

- No backend changes — uses existing `POST /ai/complete` endpoint with `style` parameter
- `fetchCompletion` already accepts optional `CompletionStyle` parameter (added in 10a)
- `continueWriting` field already existed in `useAiSettings` hook (added in 10a, defaulting to `false`)
- Ghost text rendering infrastructure (StateField, decorations, Tab/Escape keymaps) shared with inline completions

## Verification

1. Type check passes: `npx turbo run type-check --filter=@derekentringer/ns-desktop`
2. All tests pass: `npx turbo run test --filter=@derekentringer/ns-desktop`
3. Enable "Continue writing" in Settings → toggle appears after "Inline completions"
4. In editor with >50 chars, Cmd+Shift+Space → paragraph continuation ghost text
5. In editor with <50 chars, Cmd+Shift+Space → structure suggestion ghost text
6. Tab accepts, Escape dismisses
7. "Continue writing / suggest structure" appears in keyboard shortcuts
