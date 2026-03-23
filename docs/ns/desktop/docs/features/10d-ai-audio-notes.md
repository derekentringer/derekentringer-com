# 10d — AI Features: Audio Notes

**Status:** Complete
**Phase:** 7 — AI
**Priority:** Medium
**Release:** 10d (fourth of 6 incremental AI releases)

## Summary

Added audio note recording and transcription to the NoteSync desktop app. Users record audio via the browser MediaRecorder API in Tauri's webview, select a transcription mode (Meeting/Lecture/Memo/Verbatim), and the recording is sent to ns-api's Whisper + Claude pipeline for transcription and structuring into a markdown note. Also added note timestamps (created/modified) in the editor toolbar status bar.

### Meeting Audio Recording (macOS ScreenCaptureKit)

Added native meeting audio recording via macOS ScreenCaptureKit (macOS 15.0+). When "Meeting mode" is selected as the recording source, the app captures both system audio (remote meeting participants via MS Teams, Zoom, etc.) and microphone audio (user's voice) simultaneously in a single stream. The captured audio is written to a temporary WAV file at 16kHz mono (Whisper's native sample rate) and sent through the same transcription pipeline. A "Recording source" selector in both the AudioRecorder dropdown and Settings page lets users switch between "Microphone only" (browser MediaRecorder) and "Meeting mode" (native ScreenCaptureKit).

## What Was Implemented

### AudioRecorder Component (`src/components/AudioRecorder.tsx`) — NEW

Ported from `ns-web/src/components/AudioRecorder.tsx`:
- Three states: idle (Record button + mode dropdown), recording (timer + Stop button), processing (spinner)
- Browser `MediaRecorder` API with runtime MIME type detection via `getSupportedMimeType()` — tries `audio/webm;codecs=opus`, `audio/webm`, `audio/mp4`, `audio/ogg;codecs=opus` in order, falls back to browser default if none supported (required for WebKit/WKWebView in Tauri — WebKit doesn't support `audio/webm;codecs=opus`)
- Mode dropdown (Meeting, Lecture, Memo, Verbatim) with outside-click dismissal
- Recording timer (MM:SS format), max 2 hours auto-stop
- Cleanup on unmount (stops recording, releases media stream)
- Props: `defaultMode`, `recordingSource`, `onNoteCreated`, `onError`

#### Meeting Mode Recording (ScreenCaptureKit)
- `recordingSource` prop controls recording backend: `"microphone"` uses browser MediaRecorder, `"meeting"` uses native Tauri commands
- On mount, checks meeting recording support via `invoke("check_meeting_recording_support")` — returns `true` on macOS 15.0+
- Meeting recording flow: `invoke("start_meeting_recording")` → listen for `"meeting-recording-tick"` events (1s timer) → `invoke("stop_meeting_recording")` returns WAV file path → `readFile()` via `@tauri-apps/plugin-fs` → create Blob → `transcribeAudio(blob, mode)`
- `onRecordingSourceChange` prop callback updates `recordingSource` AI setting via `updateAiSetting`; persists to localStorage
- Dropdown shows "Source" section (Microphone only / Meeting mode) as clickable buttons when `meetingSupported` is true
- Meeting mode shows monitor/display icon vs microphone icon in record button
- Button title includes source indicator: "Record audio (Memo — Meeting)"

### Rust Audio Capture Module (`src-tauri/src/audio_capture.rs`) — NEW

Native macOS ScreenCaptureKit integration via `screencapturekit` Rust crate:
- `check_support()` — checks macOS version >= 15 via `NSProcessInfo.operatingSystemVersion`
- `start_recording(app_handle)` — creates `SCStream` with `SCContentFilter` (display capture), configures audio-only capture with `with_captures_audio(true)`, `with_captures_microphone(true)` (macOS 15.0+ mic mixing), `with_sample_rate(Rate16000)`, `with_channel_count(Mono)`, minimal video (2x2px); audio handler collects f32 PCM samples in `Arc<Mutex<Vec<f32>>>`; spawns timer thread emitting `"meeting-recording-tick"` events via `app_handle.emit()`
- `stop_recording()` — stops stream, collects samples, writes WAV via `hound::WavWriter` (16-bit signed int, 16kHz mono), returns temp file path
- Static `RECORDING: Mutex<Option<RecordingState>>` for state management
- `unsafe impl Send for RecordingState` — SCStream uses thread-safe Objective-C objects

### Tauri Commands (`src-tauri/src/lib.rs`) — MODIFIED

Three new Tauri commands with cross-platform stubs:
- `check_meeting_recording_support()` → `audio_capture::check_support()` on macOS, `Ok(false)` elsewhere
- `start_meeting_recording(app_handle)` → `audio_capture::start_recording()` on macOS, `Err` elsewhere
- `stop_meeting_recording()` → `audio_capture::stop_recording()` on macOS, `Err` elsewhere
- `#[cfg(target_os = "macos")]` and `#[cfg(not(target_os = "macos"))]` branches for each

### macOS Entitlements (`src-tauri/Info.plist`) — MODIFIED

- Added `NSMicrophoneUsageDescription` key: "NoteSync needs microphone access to record audio notes."
- Added `NSScreenCaptureUsageDescription` key: "NoteSync needs screen recording access to capture meeting audio for transcription."
- Required by macOS for `getUserMedia({ audio: true })` and ScreenCaptureKit respectively
- Tauri v2 auto-merges custom `src-tauri/Info.plist` keys into the bundled app's `Contents/Info.plist`

### AI Settings Hook (`src/hooks/useAiSettings.ts`) — MODIFIED

- Added `RecordingSource` type: `"microphone" | "meeting"`
- Added `VALID_RECORDING_SOURCES` array for validation
- Added `recordingSource: RecordingSource` to `AiSettings` interface (13 fields total)
- Default: `recordingSource: "microphone"`
- Validated on load: falls back to `"microphone"` if invalid

### AI API Client (`src/api/ai.ts`) — MODIFIED

- Added `TranscribeResult` interface: `{ title, content, tags, note }`
- Added `transcribeAudio(audioBlob, mode)` — POST `/ai/transcribe` with FormData (file + mode), returns structured note data
- Dynamic file extension based on blob MIME type — added `wav` mapping for meeting mode WAV files (`mp4`/`ogg`/`wav`/`webm`)
- Retry logic: up to 2 retries with exponential backoff on 502/503/504 status codes
- Error handling: extracts server error message from JSON response body

### Settings Page (`src/pages/SettingsPage.tsx`) — MODIFIED

- Added 6th entry to `AI_TOGGLE_SETTINGS`: `{ key: "audioNotes", label: "Audio notes", info: "Record audio and transcribe it into a note using AI." }`
- Added `AUDIO_MODE_OPTIONS` array with 4 modes (Meeting notes, Lecture notes, Memo, Verbatim) with info tooltips
- Added `RECORDING_SOURCE_OPTIONS` array: "Microphone only" and "Meeting mode" with descriptions
- Recording source radio group shown conditionally when audioNotes enabled + masterAiEnabled
- Audio mode radio group shown conditionally when audioNotes enabled + masterAiEnabled

### NotesPage (`src/pages/NotesPage.tsx`) — MODIFIED

- AudioRecorder shown in sidebar header next to "+" button (icon-only, matching web layout)
- `handleAudioNoteCreated(note)` callback: adds new note to list, opens as tab, reloads folders/favorites/titles, syncs to server via `notifyLocalChange`
- Conditional rendering: only shown when `aiSettings.masterAiEnabled && aiSettings.audioNotes`
- Passes `aiSettings.recordingSource` prop to AudioRecorder

### Note Timestamps in Editor Toolbar

- Created date and Modified date+time displayed in the toolbar status bar next to save status
- Separated by middle-dot (`·`) separators
- Full date+time hover tooltips
- `text-[11px] text-muted-foreground` styling matching save status

### Build Script (`src-tauri/build.rs`) — MODIFIED

Added Swift runtime rpath linker flags (macOS only) so `libswiftCore.dylib` is found at launch — required by the `screencapturekit` crate's Swift interop:
- `-Wl,-rpath,/usr/lib/swift` — system Swift runtime
- `-Wl,-rpath,@executable_path/../Frameworks` — bundled frameworks

### Rust Dependencies (`src-tauri/Cargo.toml`) — MODIFIED

Added under `[target.'cfg(target_os = "macos")'.dependencies]`:
- `screencapturekit = "1.5"` — Pure Rust bindings to macOS ScreenCaptureKit API
- `hound = "3.5"` — WAV file writer (PCM samples → .wav)
- Added `"NSProcessInfo"` feature to existing `objc2-foundation` dependency for OS version detection

## Tests

### New Test Files
- `src/__tests__/AudioRecorder.test.tsx` — 8 tests: renders Record button and mode dropdown, mode selection, checks meeting recording support on mount, shows/hides source section based on support, shows meeting icon when meeting mode active

### Modified Test Files
- `src/__tests__/ai-api.test.ts` — 3 new tests: transcribeAudio sends FormData, throws server message on error, throws default message on JSON parse failure
- `src/__tests__/SettingsPage.test.tsx` — audio toggle renders, audio mode radios shown/hidden conditionally, recording source radios shown/hidden conditionally, recording source persists to localStorage
- `src/__tests__/useAiSettings.test.ts` — 13 fields test updated, recordingSource defaults to "microphone", invalid recordingSource falls back to "microphone", recordingSource changes persist

## Files Summary

| File | Action |
|------|--------|
| `ns-desktop/src-tauri/build.rs` | Modified — Swift runtime rpath linker flags |
| `ns-desktop/src-tauri/Cargo.toml` | Modified — added screencapturekit + hound deps |
| `ns-desktop/src-tauri/src/audio_capture.rs` | Created — ScreenCaptureKit recording module |
| `ns-desktop/src-tauri/src/lib.rs` | Modified — 3 new Tauri commands |
| `ns-desktop/src-tauri/Info.plist` | Modified — NSMicrophoneUsageDescription + NSScreenCaptureUsageDescription |
| `ns-desktop/src/components/AudioRecorder.tsx` | Modified — added meeting mode via Tauri invoke |
| `ns-desktop/src/hooks/useAiSettings.ts` | Modified — RecordingSource type + setting |
| `ns-desktop/src/api/ai.ts` | Modified — TranscribeResult, transcribeAudio with retry + wav support |
| `ns-desktop/src/pages/SettingsPage.tsx` | Modified — audio toggle, mode + recording source radio groups |
| `ns-desktop/src/pages/NotesPage.tsx` | Modified — AudioRecorder integration + recordingSource prop |
| `ns-desktop/src/components/EditorToolbar.tsx` | Modified — note timestamps in status bar |
| `ns-desktop/src/__tests__/AudioRecorder.test.tsx` | Modified — 8 tests (meeting mode support, source section, meeting icon) |
| `ns-desktop/src/__tests__/SettingsPage.test.tsx` | Modified — recording source radio tests |
| `ns-desktop/src/__tests__/useAiSettings.test.ts` | Modified — recordingSource validation + persistence tests |
| `ns-desktop/src/__tests__/ai-api.test.ts` | Modified — transcribeAudio tests |

## Dependencies

- [10a — AI Features: Foundation](10a-ai-features-foundation.md) — uses AI settings hook and API client
- ns-api `/ai/transcribe` endpoint — already implemented (Whisper + Claude pipeline)
- macOS 15.0+ — required for ScreenCaptureKit microphone mixing (`with_captures_microphone`); meeting mode gracefully hidden on older macOS and non-macOS platforms
