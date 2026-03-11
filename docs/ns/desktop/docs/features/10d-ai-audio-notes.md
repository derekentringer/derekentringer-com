# 10d — AI Features: Audio Notes

**Status:** Complete
**Phase:** 7 — AI
**Priority:** Medium
**Release:** 10d (fourth of 6 incremental AI releases)

## Summary

Added audio note recording and transcription to the NoteSync desktop app. Users record audio via the browser MediaRecorder API in Tauri's webview, select a transcription mode (Meeting/Lecture/Memo/Verbatim), and the recording is sent to ns-api's Whisper + Claude pipeline for transcription and structuring into a markdown note. Also added note timestamps (created/modified) in the editor toolbar status bar.

## What Was Implemented

### AudioRecorder Component (`src/components/AudioRecorder.tsx`) — NEW

Ported from `ns-web/src/components/AudioRecorder.tsx`:
- Three states: idle (Record button + mode dropdown), recording (timer + Stop button), processing (spinner)
- Browser `MediaRecorder` API with `audio/webm;codecs=opus`
- Mode dropdown (Meeting, Lecture, Memo, Verbatim) with outside-click dismissal
- Recording timer (MM:SS format), max 30 minutes auto-stop
- Cleanup on unmount (stops recording, releases media stream)
- Props: `defaultMode`, `onNoteCreated`, `onError`

### AI API Client (`src/api/ai.ts`) — MODIFIED

- Added `TranscribeResult` interface: `{ title, content, tags, note }`
- Added `transcribeAudio(audioBlob, mode)` — POST `/ai/transcribe` with FormData (file + mode), returns structured note data
- Error handling: extracts server error message from JSON response body

### Settings Page (`src/pages/SettingsPage.tsx`) — MODIFIED

- Added 6th entry to `AI_TOGGLE_SETTINGS`: `{ key: "audioNotes", label: "Audio notes", info: "Record audio and transcribe it into a note using AI." }`
- Added `AUDIO_MODE_OPTIONS` array with 4 modes (Meeting notes, Lecture notes, Memo, Verbatim) with info tooltips
- Audio mode radio group shown conditionally when audioNotes enabled + masterAiEnabled

### NotesPage (`src/pages/NotesPage.tsx`) — MODIFIED

- AudioRecorder shown in sidebar header next to "+" button (icon-only, matching web layout)
- `handleAudioNoteCreated(note)` callback: adds new note to list, opens as tab, reloads folders/favorites/titles, syncs to server via `notifyLocalChange`
- Conditional rendering: only shown when `aiSettings.masterAiEnabled && aiSettings.audioNotes`

### Note Timestamps in Editor Toolbar

- Created date and Modified date+time displayed in the toolbar status bar next to save status
- Separated by middle-dot (`·`) separators
- Full date+time hover tooltips
- `text-[11px] text-muted-foreground` styling matching save status

## Tests

### New Test Files
- `src/__tests__/AudioRecorder.test.tsx` — 3 tests: renders Record button and mode dropdown, mode selection, button sizing

### Modified Test Files
- `src/__tests__/ai-api.test.ts` — 3 new tests: transcribeAudio sends FormData, throws server message on error, throws default message on JSON parse failure
- `src/__tests__/SettingsPage.test.tsx` — audio toggle renders, audio mode radios shown/hidden conditionally

## Files Summary

| File | Action |
|------|--------|
| `ns-desktop/src/components/AudioRecorder.tsx` | Created — recording component |
| `ns-desktop/src/api/ai.ts` | Modified — TranscribeResult, transcribeAudio |
| `ns-desktop/src/pages/SettingsPage.tsx` | Modified — audio toggle, mode radio group |
| `ns-desktop/src/pages/NotesPage.tsx` | Modified — AudioRecorder integration, timestamps |
| `ns-desktop/src/components/EditorToolbar.tsx` | Modified — note timestamps in status bar |
| `ns-desktop/src/__tests__/AudioRecorder.test.tsx` | Created — 3 tests |
| `ns-desktop/src/__tests__/ai-api.test.ts` | Modified — 3 tests |
| `ns-desktop/src/__tests__/SettingsPage.test.tsx` | Modified — audio toggle tests |

## Dependencies

- [10a — AI Features: Foundation](10a-ai-features-foundation.md) — uses AI settings hook and API client
- ns-api `/ai/transcribe` endpoint — already implemented (Whisper + Claude pipeline)
