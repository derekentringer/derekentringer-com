# 07 — Settings & Preferences

**Status:** Complete
**Phase:** 5 — Settings
**Priority:** Medium
**Completed:** v1.60.0

## Summary

Full-page settings view for NoteSync Desktop, ported from the ns-web SettingsPage with desktop-specific adaptations. Accessible via a gear icon in the sidebar bottom bar. Includes 6 sections: Appearance, Editor Preferences, Trash, Version History, Two-Factor Authentication, and Keyboard Shortcuts. All settings persist via localStorage through the shared `useEditorSettings` hook. 2FA section uses the ns-api TOTP endpoints for setup, verification, and disabling.

---

## Navigation

- **Settings button:** Gear icon in sidebar bottom bar (next to trash icon), always visible
- **Full-page view:** `showSettings` state in NotesPage conditionally renders SettingsPage instead of the notes layout
- **Back button:** Returns to notes view; syncs `viewMode` and `showLineNumbers` to current settings on return
- **No router:** Uses `onBack` callback since desktop has no React Router

---

## Sections

### 1. Appearance

- **Theme:** Dark / Light / System radio group
  - `handleThemeChange` sets `data-theme` attribute and re-computes accent CSS vars (`--color-primary`, `--color-primary-hover`, `--color-ring`, `--color-primary-contrast`)
  - CodeMirror editor theme updates reactively via shared `editorSettings` state
- **Editor font size:** Range slider 10–24px with `aria-label="Editor font size"`
- **Accent color:** 11 swatch buttons (lime, blue, cyan, purple, orange, teal, pink, red, amber, black, white)
  - Each swatch: `w-7 h-7 rounded-full` with checkmark SVG on selected
  - `handleAccentColorChange` applies `--color-primary`, `--color-primary-hover`, `--color-ring`, `--color-primary-contrast` CSS vars
  - `ACCENT_PRESETS` includes `darkHover`/`lightHover` for proper hover state colors

### 2. Editor Preferences

- **Default view mode:** Editor / Split / Preview radio group
- **Line numbers:** ToggleSwitch (on/off)
- **Word wrap:** ToggleSwitch (on/off)
- **Auto-save delay:** `<select>` dropdown (500ms, 1s, 1.5s, 2s, 3s, 5s)
- **Tab size:** 2 spaces / 4 spaces radio group
- **Cursor style:** Line / Block / Underline radio group — controls CodeMirror cursor shape via `drawSelection()` and dynamic CSS in a dedicated cursor compartment
- **Cursor blink:** ToggleSwitch (on/off, default on) — controls `cursorBlinkRate` (1200ms when on, 0 when off)

### 3. Trash

- **Auto-delete after:** `<select>` dropdown (7, 14, 30, 60, 90 days, Never)
- Reads/writes localStorage key `ns-desktop:trashRetentionDays`
- On change, notifies NotesPage via `onTrashRetentionChange` callback to purge expired trash

### 4. Version History

- **Capture interval:** `<select>` dropdown (Every save, 5 min, 15 min, 30 min, 60 min)
- Uses `editorSettings.versionIntervalMinutes` via shared `useEditorSettings` hook

### 5. Two-Factor Authentication

- **4-state UI** ported from ns-web SettingsPage:
  1. **Not enabled:** Description text + "Enable 2FA" button → calls `setupTotp()` API
  2. **QR code setup:** QR code image + manual secret + 6-digit verification input + "Verify & Enable" / Cancel
  3. **Backup codes:** Success message + mono code list + Copy / Done buttons
  4. **Enabled:** "Enabled" badge + "Disable 2FA" button → code input + "Confirm Disable" / Cancel
- Uses `useAuth()` for `user.totpEnabled` state and `setUserFromLogin` to refresh after enable/disable
- API functions added to `api/auth.ts`: `setupTotp()`, `verifyTotpSetup()`, `disableTotp()`
- All use `apiFetch` with Bearer token auth (no special handling needed)
- After verify/disable, calls `getMe()` to refresh user state

### 6. Keyboard Shortcuts

- Desktop-specific shortcut list (no AI shortcuts):
  - Ctrl/Cmd + S — Save note
  - Ctrl/Cmd + B — Bold
  - Ctrl/Cmd + I — Italic
  - Ctrl/Cmd + K — Focus search
- `<kbd>` elements with `bg-background border border-border`
- Mac detection via `navigator.platform`

---

## Sections Skipped (not applicable to desktop yet)

- **AI Features** — Phase 7, not implemented
- **Offline Cache** — web-only (IndexedDB); desktop uses SQLite natively

---

## Helper Components (inline)

- **InfoIcon** — Tooltip on hover with `group-hover:opacity-100`
- **ToggleSwitch** — `role="switch"` with `aria-checked`, `bg-primary` when checked
- **SectionCard** — `bg-card border border-border rounded-lg p-4` with uppercase heading
- **RadioOption\<T\>** — Generic radio with `accent-primary`, `aria-label`

---

## Shared State Architecture

SettingsPage receives `editorSettings` and `updateEditorSetting` as props from NotesPage's `useEditorSettings()` hook instance. This ensures both components share the same state — changes in settings (theme, view mode, etc.) immediately reflect in the editor when navigating back.

---

## Dropdown Styling

All `<select>` elements use `appearance-none` with a custom SVG chevron background image, matching the existing desktop dropdown pattern used in the sidebar (sort dropdown, trash retention). Settings dropdowns use larger sizing (text-sm, px-3 py-1.5) appropriate for a full-page form view.

---

## Files

| File | Action |
|------|--------|
| `packages/ns-desktop/src/pages/SettingsPage.tsx` | Created — settings page with 6 sections (added 2FA in v1.61.0) |
| `packages/ns-desktop/src/pages/NotesPage.tsx` | Edited — `showSettings` state, gear button, conditional render, `onBack` syncs viewMode/lineNumbers |
| `packages/ns-desktop/src/hooks/useEditorSettings.ts` | Edited — added `darkHover`/`lightHover` to `ACCENT_PRESETS` |
| `packages/ns-desktop/src/api/auth.ts` | Edited — added `setupTotp`, `verifyTotpSetup`, `disableTotp` API functions |
| `packages/ns-desktop/src/__tests__/SettingsPage.test.tsx` | Created — 30 tests (added 8 2FA tests in v1.61.0) |

---

## Tests

| Test file | Tests |
|-----------|-------|
| `SettingsPage.test.tsx` | 30 tests: headings (3), appearance (5), editor preferences (6), trash (2), version history (2), 2FA (8), keyboard shortcuts (2), navigation (2) |

---

## Bug Fixes (included in this feature)

- **Accent color hover state:** Both web and desktop `handleAccentColorChange`/`handleThemeChange` now set `--color-primary-hover` CSS var (was missing, causing hover states to stay as default lime-yellow after changing accent color)
- **Theme not applying to editor:** Fixed by passing `editorSettings`/`updateEditorSetting` from NotesPage's hook instance into SettingsPage as props (previously SettingsPage used its own hook instance, so NotesPage's state was stale)
- **View mode not updating after settings change:** `onBack` handler now syncs `viewMode` and `showLineNumbers` from current `editorSettings`

---

## Desktop vs Web Differences

| Aspect | Web | Desktop |
|--------|-----|---------|
| Navigation | `navigate("/settings")` | `setShowSettings(true)` + `onBack` callback |
| Trash retention | API-backed (`setTrashRetention`) | localStorage (`TRASH_RETENTION_KEY`) |
| Version interval | API-backed (`setVersionInterval`) | `useEditorSettings` hook (localStorage) |
| AI Features section | Full section (8 toggles) | Skipped (Phase 7) |
| Offline Cache section | IndexedDB cache management | Skipped (desktop uses SQLite natively) |
| 2FA section | TOTP setup/disable | Ported — identical 4-state UI |
| Keyboard shortcuts | 9 shortcuts (incl. AI) | 4 shortcuts (no AI) |
| Settings button | Always visible in bottom bar | Same — always visible next to trash |
| State sharing | Separate hook per route | Props from parent hook instance |
| Dropdown styling | Browser-default select | `appearance-none` with custom SVG chevron |

---

## Dependencies

- [01 — Note Editor](01-note-editor.md) — editor settings control font size, line numbers, word wrap, tab size, view mode
- [04 — Version History](04-version-history.md) — version capture interval setting

## Deferred

- **AI settings** — Phase 7, will add AI section when AI features are implemented
- **Sync settings** — Phase 6, will add sync status/interval when sync engine is implemented
- **About section** — app version, GitHub links
- **Reset to Defaults** — button to restore all settings
- **Keyboard shortcut customization** — remapping shortcuts
