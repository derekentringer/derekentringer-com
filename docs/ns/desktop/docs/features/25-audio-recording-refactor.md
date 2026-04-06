# 25 — Audio Recording Refactor

## Summary

Refactored audio recording to integrate with the ribbon. Mirrors web (ns-web feature 23) with desktop-specific meeting recording via Rust CoreAudio. Real-time waveform uses Rust-computed RMS audio levels for meeting mode.

## What Was Built

### Components (`ns-desktop`)
- **`AudioRecorder.tsx`** — Recording UI with source selector and waveform; mirrors web implementation with desktop-specific meeting mode support
- **`RecordingBar.tsx`** — Persistent recording indicator bar shown during active recording
- **`AudioWaveform.tsx`** — Real-time waveform visualization; when no MediaStream is available (meeting mode), uses `audioLevel` prop from Rust RMS to drive simulated bar visualization with per-bar variation for natural look

### Rust Audio Capture (`ns-desktop`)
- **`audio_capture.rs`** — Meeting recording via CoreAudio process tap capturing system audio + microphone simultaneously
- **Rust RMS levels**: CoreAudio audio callback computes RMS from sample buffers; both system and mic streams emit RMS values; tick event sends `(elapsed_secs, max(sys_rms, mic_rms))` at ~15fps via `meeting-recording-tick` Tauri event
- **`check_meeting_recording_support`** — Tauri command checking platform capability for meeting mode

### Recording Sources (`ns-desktop`)
- Recording source selector: "Microphone only" and "Meeting mode" options in long-press dropdown
- Meeting mode requires macOS Screen Recording permission
- WAV file read from disk via `readFile` from `@tauri-apps/plugin-fs` after Rust stops recording

### Integration (`ns-desktop`)
- Refs pattern (`onNoteCreatedRef`, `onErrorRef`) prevents stale closures in async Tauri callbacks
- AudioWaveform fallback mode driven by `audioLevel` prop when MediaStream is unavailable

## Files Changed

| File | Change |
|------|--------|
| `packages/ns-desktop/src/components/AudioRecorder.tsx` | **New** — Recording UI with source selector, meeting mode, waveform |
| `packages/ns-desktop/src/components/RecordingBar.tsx` | **New** — Persistent recording indicator bar |
| `packages/ns-desktop/src/components/AudioWaveform.tsx` | **New** — Real-time waveform with MediaStream and Rust RMS fallback |
| `packages/ns-desktop/src-tauri/src/audio_capture.rs` | Updated — Rust RMS computation in CoreAudio callback, tick event at ~15fps |
| `packages/ns-desktop/src-tauri/src/lib.rs` | Added `check_meeting_recording_support` Tauri command |
| `packages/ns-desktop/src/components/Ribbon.tsx` | Integrated audio recording trigger into ribbon |
| `packages/ns-desktop/src/styles/global.css` | Recording bar, waveform, source selector styles |

## Tests

- None

## Status

- **Status**: Complete
- **Phase**: 5 — Audio
- **Priority**: Medium
