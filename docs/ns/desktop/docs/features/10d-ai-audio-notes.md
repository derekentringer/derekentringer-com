# 10d — AI Features: Audio Notes

**Status:** Complete
**Phase:** 7 — AI
**Priority:** Medium
**Release:** 10d (fourth of 6 incremental AI releases)

## Summary

Added audio note recording and transcription to the NoteSync desktop app. Users record audio via the browser MediaRecorder API in Tauri's webview, select a transcription mode (Meeting/Lecture/Memo/Verbatim), and the recording is sent to ns-api's Whisper + Claude pipeline for transcription and structuring into a markdown note. Also added note timestamps (created/modified) in the editor toolbar status bar.

### Meeting Audio Recording (Direct Core Audio HAL via coreaudio-rs)

Added native meeting audio recording via direct Core Audio HAL calls using `coreaudio-rs` + `objc2-core-audio` + `core-foundation` (macOS 14.2+). When "Meeting mode" is selected as the recording source, the app captures system audio (remote meeting participants via MS Teams, Zoom, etc.) via a Core Audio Process Tap on the default output device routed through an Aggregate Device, and microphone audio (user's voice) via a standard input AudioUnit — running as two independent AudioUnit streams. Audio samples are streamed to temporary raw PCM files on disk during recording via `mpsc::sync_channel` + dedicated writer threads (disk-streaming architecture). At stop time, both temp files are read in 1-second chunks, converted to mono, the mic chunks are resampled to match the system audio sample rate if they differ via a stateful `ChunkResampler`, and the two are mixed by averaging. The result is written to a temporary WAV file and sent through the same transcription pipeline. This disk-streaming approach uses ~2MB working memory regardless of recording length, replacing the previous in-memory accumulation that caused OOM crashes on recordings longer than ~1 hour. A "Recording source" selector in both the AudioRecorder dropdown and Settings page lets users switch between "Microphone only" (browser MediaRecorder) and "Meeting mode" (native Core Audio).

This went through three iterations: (1) ScreenCaptureKit broke on macOS Tahoe due to stricter TCC enforcement; (2) `cpal` crate's loopback feature worked but triggered multiple permission dialogs (~12) because cpal internally makes many Core Audio HAL calls that each trigger TCC checks; (3) direct Core Audio HAL via `coreaudio-rs` gives full control over the HAL call sequence — permissions are pre-requested once each (microphone + system audio) before any AudioUnit setup, resulting in exactly 2 permission dialogs on first use. Core Audio Taps fall under the less-intrusive "System Audio Recording Only" TCC category — no screen recording permission needed, no weekly re-confirmation prompts, and no app-restart-after-grant issues.

Audio samples are streamed to disk during recording via `mpsc::sync_channel` + background writer threads, then processed in 1-second chunks at stop time. This disk-streaming architecture uses ~2MB working memory regardless of recording length, preventing OOM crashes that occurred with the previous in-memory accumulation approach on recordings longer than ~1 hour (~2GB per stream at 48kHz stereo, peaking at 8–10GB+ during post-processing).

## What Was Implemented

### AudioRecorder Component (`src/components/AudioRecorder.tsx`) — NEW

Ported from `ns-web/src/components/AudioRecorder.tsx`:
- Three states: idle (Record button + mode dropdown), recording (timer + Stop button), processing (spinner)
- Browser `MediaRecorder` API with runtime MIME type detection via `getSupportedMimeType()` — tries `audio/webm;codecs=opus`, `audio/webm`, `audio/mp4`, `audio/ogg;codecs=opus` in order, falls back to browser default if none supported (required for WebKit/WKWebView in Tauri — WebKit doesn't support `audio/webm;codecs=opus`)
- Mode dropdown (Meeting, Lecture, Memo, Verbatim) with outside-click dismissal
- Recording timer (MM:SS format), max 2 hours auto-stop
- Cleanup on unmount (stops recording, releases media stream)
- Props: `defaultMode`, `recordingSource`, `onNoteCreated`, `onError`

#### Meeting Mode Recording (Core Audio Taps via cpal)
- `recordingSource` prop controls recording backend: `"microphone"` uses browser MediaRecorder, `"meeting"` uses native Tauri commands
- On mount, checks meeting recording support via `invoke("check_meeting_recording_support")` — returns `true` on macOS 14.2+
- Meeting recording flow: `invoke("start_meeting_recording")` → listen for `"meeting-recording-tick"` events (1s timer) → `invoke("stop_meeting_recording")` returns WAV file path → `readFile()` via `@tauri-apps/plugin-fs` → create Blob → `transcribeAudio(blob, mode)`
- `onRecordingSourceChange` prop callback updates `recordingSource` AI setting via `updateAiSetting`; persists to localStorage
- Dropdown shows "Source" section (Microphone only / Meeting mode) as clickable buttons when `meetingSupported` is true
- Meeting mode shows monitor/display icon vs microphone icon in record button
- Button title includes source indicator: "Record audio (Memo — Meeting)"

### Rust Audio Capture Module (`src-tauri/src/audio_capture.rs`) — NEW

Native macOS Core Audio HAL integration via `coreaudio-rs` (AudioUnit) + `objc2-core-audio` (Process Tap) + `core-foundation` (CFDictionary):
- `request_microphone_permission()` — pre-requests microphone permission via `AVCaptureDevice.authorizationStatusForMediaType:` and `requestAccessForMediaType:completionHandler:` using raw `objc2::msg_send!` with `block2::RcBlock`; blocks via `mpsc::channel` until user responds; called before any AudioUnit operations to ensure a single macOS permission dialog
- `request_system_audio_permission()` — pre-requests system audio recording permission by creating a minimal `CATapDescription` via `initStereoGlobalTapButExcludeProcesses:` with empty `NSArray`, calls `AudioHardwareCreateProcessTap` to trigger macOS "System Audio Recording" TCC dialog, retries every 1s up to 30 times until permission is granted, then destroys the tap
- `check_support()` — checks macOS version >= 14.2 via `NSProcessInfo.operatingSystemVersion` (Core Audio Taps API minimum)
- `create_process_tap()` — creates a `CATapDescription` for global stereo tap, calls `AudioHardwareCreateProcessTap` with retry loop; returns the tap device ID
- `create_aggregate_device(tap_id)` — builds a `CFDictionary` via `core-foundation` crate describing an aggregate device with the tap as a sub-device, calls `AudioHardwareCreateAggregateDevice` via raw FFI; returns the aggregate device ID
- `setup_input_audio_unit(device_id, sender)` — uses `coreaudio::audio_unit::macos_helpers::audio_unit_from_device_id()` to create a properly configured input AudioUnit, sets stream format to interleaved f32, registers an input callback that sends sample chunks via `mpsc::SyncSender<Vec<f32>>` to a dedicated writer thread (disk-streaming architecture — no in-memory accumulation)
- `spawn_writer_thread(path, receiver)` — background thread that receives f32 sample chunks via `mpsc::Receiver` and writes raw PCM bytes to a temp file via `BufWriter`; runs until the sender is dropped
- `start_recording(app_handle)` — sequential setup: (1) mic permission pre-request, (2) 500ms delay, (3) create `mpsc::sync_channel(128)` pairs for system + mic, (4) spawn writer threads streaming to `/tmp/notesync_sys_{ts}.pcm` and `/tmp/notesync_mic_{ts}.pcm`, (5) mic AudioUnit via `default_input_device`, (6) system audio process tap, (7) aggregate device from tap, (8) system AudioUnit on aggregate device, (9) timer thread emitting `"meeting-recording-tick"` events
- `stop_recording()` — stops both AudioUnits, drops senders to signal writer threads, joins writer threads, destroys aggregate device + process tap via `AudioHardwareDestroyAggregateDevice`/`AudioHardwareDestroyProcessTap`, calls `mix_to_wav()` to process temp files in 1-second chunks, cleans up temp files, returns WAV path
- `mix_to_wav(sys_path, mic_path, ...)` — reads both raw PCM temp files in 1-second chunks, converts each chunk to mono (`to_mono`), resamples mic chunk via `ChunkResampler` if sample rates differ, mixes by averaging, writes WAV via `hound::WavWriter` (16-bit signed int, system audio sample rate, mono); ~2MB working set regardless of recording length
- `ChunkResampler` — stateful linear interpolation resampler that maintains fractional position (`pos`) and previous sample (`prev_sample`) across chunk boundaries for seamless resampling
- Helper functions: `to_mono()`, `read_f32_chunk()`, `get_device_sample_rate()`, `get_device_channels()`
- Raw FFI declarations for `AudioHardwareCreateAggregateDevice` and `AudioHardwareDestroyAggregateDevice` to avoid `objc2-core-foundation` dependency
- Static `RECORDING: Mutex<Option<RecordingState>>` for state management
- `unsafe impl Send for RecordingState` — AudioUnit uses thread-safe Core Audio objects

### Tauri Commands (`src-tauri/src/lib.rs`) — MODIFIED

Three new Tauri commands with cross-platform stubs:
- `check_meeting_recording_support()` → `audio_capture::check_support()` on macOS, `Ok(false)` elsewhere
- `start_meeting_recording(app_handle)` → `audio_capture::start_recording()` on macOS, `Err` elsewhere
- `stop_meeting_recording()` → `audio_capture::stop_recording()` on macOS, `Err` elsewhere
- `#[cfg(target_os = "macos")]` and `#[cfg(not(target_os = "macos"))]` branches for each

### macOS Entitlements (`src-tauri/Info.plist`) — MODIFIED

- Added `NSMicrophoneUsageDescription` key: "NoteSync needs microphone access to record audio notes."
- Added `NSAudioCaptureUsageDescription` key: "NoteSync needs system audio recording access to capture meeting audio for transcription."
- Required by macOS for `getUserMedia({ audio: true })` and Core Audio Taps respectively
- `NSAudioCaptureUsageDescription` triggers the "System Audio Recording Only" TCC prompt (less intrusive than Screen Recording)
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

Swift runtime rpath linker flags removed — no longer needed after migrating from `screencapturekit` (Swift interop) to `cpal` (pure Rust). File is now just `tauri_build::build()`.

### Rust Dependencies (`src-tauri/Cargo.toml`) — MODIFIED

Under `[target.'cfg(target_os = "macos")'.dependencies]`:
- `objc2 = "0.6"` — Rust bindings for Objective-C runtime (AVCaptureDevice permission API, AnyThread trait for CATapDescription)
- `objc2-foundation = "0.3"` — Foundation framework bindings with `NSUserDefaults`, `NSString`, `NSProcessInfo`, `NSArray`, `NSValue`, `NSUUID` features (OS version detection, tap description parameters)
- `objc2-core-audio = "0.3"` — Core Audio HAL bindings with `AudioHardware` feature (`AudioHardwareCreateProcessTap`, `AudioHardwareDestroyProcessTap`, `CATapDescription` for permission pre-request and tap creation)
- `coreaudio-rs = "0.14"` — Rust wrapper for Core Audio AudioUnit API with `audio_unit` + `core_audio` features; `macos_helpers::audio_unit_from_device_id()` creates properly configured input AudioUnits
- `core-foundation = "0.10"` — Core Foundation bindings for building `CFDictionary` aggregate device descriptions passed to `AudioHardwareCreateAggregateDevice`
- `hound = "3.5"` — WAV file writer (PCM samples → .wav)
- `block2 = "0.6"` — Objective-C block support for `AVCaptureDevice.requestAccessForMediaType:completionHandler:` callback
- Removed: `screencapturekit = "1.5"` (replaced by cpal, then by direct Core Audio HAL via coreaudio-rs)

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
| `ns-desktop/src-tauri/build.rs` | Modified — removed Swift runtime rpath linker flags (cpal is pure Rust) |
| `ns-desktop/src-tauri/Cargo.toml` | Modified — replaced screencapturekit with coreaudio-rs + core-foundation + hound deps |
| `ns-desktop/src-tauri/src/audio_capture.rs` | Modified — rewritten from ScreenCaptureKit to direct Core Audio HAL via coreaudio-rs |
| `ns-desktop/src-tauri/src/lib.rs` | Modified — 3 new Tauri commands |
| `ns-desktop/src-tauri/Info.plist` | Modified — NSMicrophoneUsageDescription + NSAudioCaptureUsageDescription |
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
- macOS 14.2+ — required for Core Audio Taps API (Process Tap + Aggregate Device); meeting mode gracefully hidden on older macOS and non-macOS platforms
