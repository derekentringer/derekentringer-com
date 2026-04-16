# What's New

## v2.34.0

- **Fix** — Refresh trash count badge after sync pulls in trashed items on fresh install

## v2.33.0

- **Fix** — Sync trashed items that were never synced while active

## v2.32.0

- **Chore** — Sync tauri.conf.json version
- **Chore** — Update RELEASE_NOTES for v2.26–v2.31

## v2.31.0

- **Fix** — Drop foreign key constraint on images.note_id

## v2.30.0

- **Fix** — Sync pull cursor must respect per-type pagination boundary

## v2.29.0

- **Fix** — Folder sync — pagination cursor + drop client FK

## v2.28.0

- **Fix** — Make local builds deterministic across platforms
- **Chore** — Sync ns-web package.json version to 2.27.0

## v2.27.0

- **Fix** — Read version from package.json with git tag sync

## v2.26.0

- **Fix** — Version display fixes for web and desktop builds
- **Fix** — Fix version display on local dev and Railway production
- **Fix** — Use numeric pre-release identifier for dev builds
- **New** — Local dev builds append -dev to version
- **Chore** — Add tauri:build:win script mirroring macOS tauri:build
- **Chore** — Remove slate.json, add to gitignore

## v2.25.0

- **New** — Active note context for AI, configurable Claude model, plugin API updates

## v2.24.0

- **Fix** — Recording bar pulse uses theme primary color

## v2.23.0

- **New** — Teams theme, theme-aware editor/logo/favicon, tab indicator fix

## v2.22.0

- **New** — Update About dialog with What's New and Feedback navigation

## v2.21.0

- **Fix** — Strip trailing slashes on all routes

## v2.20.0

- **New** — Auto-generate release notes on build, fix About page

## v2.19.0

- **New** — Redesign Settings with sidebar nav, grouped sections, admin integration
- **Refactor** — Remove transcription mode from Settings, default to meeting source

## v2.18.0

- **Live recording card** — Recording context (Related Notes + Transcription) now appears as a sticky card in the AI Assistant chat during recording
- **Settings redesign** — macOS-style sidebar navigation with grouped sections, custom accent color picker, font size dropdown
- **Cross-device chat sync fix** — Linked note cards now appear correctly when chat syncs across devices
- **Windows file association** — NoteSync registers as a handler for .md, .txt, and .markdown files on Windows
- **Recording improvements** — Meeting mode is now the default recording source; transcription mode removed from Settings (use ribbon buttons instead)

## v2.17.0

- **Audio level hook** — Replaced hidden AudioWaveform canvas with lightweight `useAudioLevel` hook
- **Verbatim mode labels** — Updated to "Verbatim Recording" / "Verbatim Saved"

## v2.16.0

- **Recording card in chat** — Moved Related Notes and Transcription into a sticky card within the chat messages area
- **Recording bar redesign** — Pulsing round dot replaces square dot in stop button
- **Clear button** — Moved into AI Assistant header bar

## v2.15.0

- **Windows meeting audio** — WASAPI-based system audio capture for Windows desktop
- **About dialog fix** — Desktop About dialog now renders correctly
