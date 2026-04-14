# 27 — Windows Meeting Audio Capture

**Status:** Complete
**Phase:** 7 — AI
**Priority:** Medium
**Release:** Follow-up to 10d (Windows parity)

## Summary

Added Windows meeting-mode audio capture so the desktop app can record **system audio + microphone in parallel** on Windows 10+, matching the macOS behavior shipped in feature 10d. Uses `cpal`'s WASAPI backend to open the default input device (mic) and the default output device in loopback mode (system audio) as two independent capture streams. Both streams share the same shared disk-streaming architecture as the macOS path: samples are written to raw PCM temp files via dedicated writer threads, mixed 50/50 and resampled to 16 kHz mono at stop time, and delivered to the ns-api Whisper + Claude pipeline for transcription and note structuring.

Before this feature, meeting mode was macOS-only — `check_meeting_recording_support` returned `false` on Windows, and any attempt to record a meeting silently fell back to mic-only `getUserMedia` capture (missing all system audio from Zoom / Teams / browser meetings).

## What Was Implemented

### Platform gating in `lib.rs`

Each of the four Tauri commands (`check_meeting_recording_support`, `start_meeting_recording`, `stop_meeting_recording`, `get_meeting_audio_chunk`) now branches per target:

```rust
#[cfg(target_os = "macos")]
mod audio_capture;

#[cfg(target_os = "windows")]
mod audio_capture_win;

#[cfg(any(target_os = "macos", target_os = "windows"))]
mod audio_capture_shared;
```

On Windows the commands dispatch to `audio_capture_win::*`; on macOS they continue to dispatch to `audio_capture::*`. Any other target (e.g. Linux) returns "not supported on this platform".

### Shared platform-agnostic helpers — `audio_capture_shared.rs` (NEW)

Extracted all the pure-Rust helpers from `audio_capture.rs` so both platforms can reuse them:

- `to_mono(samples, channels)` — downmix interleaved multi-channel f32 frames to mono by averaging.
- `ChunkResampler` — stateful linear-interpolation resampler that carries its fractional position + previous sample across `process` calls so streaming chunks produce the same output as resampling the full signal in one shot. Used both for live 20s chunks and for the final mix.
- `read_pcm_since(path, byte_offset)` — seeks into a growing PCM temp file and returns all f32 samples written since the given offset. Used by `get_audio_chunk` to serve live-transcription chunks.
- `spawn_writer_thread(path, rx)` — spawns a thread that receives `Vec<f32>` chunks through an mpsc channel and appends them as raw little-endian f32 PCM to a temp file. Keeps the audio callback off the disk path.
- `encode_mixed_wav_chunk(sys_mono, mic_mono, rate)` — mixes two pre-resampled mono buffers 50/50 with soft clipping and encodes an in-memory 16 kHz mono 16-bit WAV for live-transcription uploads. Used by both platforms' `get_audio_chunk`.
- `mix_to_wav(sys_path, sys_rate, sys_ch, mic_path, mic_rate, mic_ch)` — stream-mixes both raw PCM temp files into a final 16 kHz mono 16-bit WAV on disk in 1-second chunks. Constant ~2 MB working memory regardless of recording length. Used by both platforms' `stop_recording`.

`audio_capture.rs` (macOS) was trimmed to only CoreAudio-specific code and now imports all shared helpers from `audio_capture_shared`. Net effect: zero duplication — a bug fix in the resampler or mixer applies to both platforms automatically.

### Windows module — `audio_capture_win.rs` (NEW)

#### `check_support()`
Returns `Ok(true)` unconditionally. `cpal`'s WASAPI backend runs on every Windows version Tauri itself supports (Windows 10+), so there's no runtime capability check to do.

#### `start_recording(app_handle)`

Opens two `cpal::Stream` objects on the shared WASAPI host:

1. **Microphone** — `host.default_input_device()` → `device.default_input_config()` → `build_input_stream`. Standard cpal input capture.
2. **System audio (loopback)** — `host.default_output_device()` → `device.default_output_config()` → `build_input_stream`. On Windows, `cpal` recognizes that you're asking to *input* from an *output* device and transparently flips the stream into **WASAPI loopback capture** mode — the same mechanism OBS, Discord screen-share, and other Windows audio tools use. No extra crate, no raw WASAPI FFI.

Both streams are opened via a shared `build_input_stream(...)` helper that handles `F32`, `I16`, and `U16` sample formats (WASAPI can deliver any of them depending on the device's mix format) and converts everything to `f32` for the shared pipeline. The helper also computes per-callback RMS into an `Arc<Mutex<f32>>` so the tick thread can emit real-time waveform data.

Both streams push samples through `mpsc::sync_channel::<Vec<f32>>` to dedicated writer threads (`spawn_writer_thread`) that append the raw PCM to temp files:

```
%TEMP%\notesync_mic_{timestamp}.pcm
%TEMP%\notesync_sys_{timestamp}.pcm
```

A tick thread emits `meeting-recording-tick` events every ~66 ms (~15 fps) with payload `(elapsed_secs, level)` where `level = max(sys_rms, mic_rms)` — so a quiet speaker during a loud meeting (or vice versa) still drives the UI waveform. Matches the macOS tick cadence and payload shape exactly.

All streams, writer-thread handles, senders, temp paths, sample rates, channel counts, stop flag, and read positions are stored in a `RecordingState` struct behind a static `Mutex<Option<RecordingState>>`. cpal's `Stream` type is `!Send` on Windows (the underlying WASAPI handle is bound to its creator thread), but in practice the start/stop commands both run on the same Tauri command thread so we manually assert `Send` via `unsafe impl Send for RecordingState {}` — mirrors the macOS approach with `AudioUnit`.

#### `get_audio_chunk()`

Reads the new PCM bytes from both temp files since the last call, downmixes to mono, resamples each to 16 kHz via `ChunkResampler`, and uses `encode_mixed_wav_chunk` to produce an in-memory WAV. Returned as `Vec<u8>` to the TS side, which uploads it to `/ai/transcribe-chunk` for live meeting-assistant transcription every 20 s. Read positions are persisted in `RecordingState` so subsequent calls only ship the delta.

#### `stop_recording()`

1. Sets the tick thread's stop flag.
2. Drops both cpal streams (stops the audio callbacks cleanly).
3. Drops both sync-channel senders so the writer threads drain and exit.
4. Joins all three threads (mic writer, sys writer, tick).
5. Calls the shared `mix_to_wav` helper which stream-mixes both PCM temp files into a single 16 kHz mono 16-bit WAV on disk.
6. Deletes both temp PCM files.
7. Returns the final WAV path to the TS side, which reads it via `@tauri-apps/plugin-fs` and uploads it to `/ai/transcribe` for final note generation.

### Cargo.toml

Moved `hound` out of the `target.'cfg(target_os = "macos")'.dependencies` block into the top-level `[dependencies]` because `audio_capture_shared` uses it on both targets. Added cpal as a Windows-only dep:

```toml
[dependencies]
hound = "3.5"

[target.'cfg(target_os = "windows")'.dependencies]
cpal = "0.15"
```

macOS builds do not pull `cpal`; Windows builds do not pull the macOS-only `objc2`, `coreaudio-rs`, or `core-foundation` crates. Each target's dependency graph stays minimal.

### TS side: no changes required

`AudioRecorder.tsx` already had the meeting-mode code path wired through `check_meeting_recording_support`, `start_meeting_recording`, `get_meeting_audio_chunk`, and `stop_meeting_recording` — the same four Tauri commands, now backed by a real Windows implementation. Once `check_support` started returning `true` on Windows, the meeting/lecture ribbon buttons, source dropdown, and native-WAV live-chunk path all lit up automatically.

### TS side: related fix — stop-button race

Unrelated to the capture work but surfaced during testing: `handleMeetingStop` was calling `setState("processing")` **after** awaiting the native `stop_meeting_recording` invoke. On Windows that invoke runs `mix_to_wav` on the main Tauri worker thread and can take several seconds for long recordings, during which the Stop button stayed visible and clickable. Rapid repeated clicks re-entered `handleMeetingStop`, clobbered the live transcript state before React could flush the `isRecording → false` transition, and caused the AI panel's "Meeting Ended" card-insertion effect to fire against an already-cleared transcript.

Fix in `AudioRecorder.tsx`:

- Added a re-entry guard (`if (!isMeetingRef.current) return; isMeetingRef.current = false;`) at the top of `handleMeetingStop` so only the first click runs.
- Moved `setState("processing")` **before** the native stop invoke so the Stop button disappears immediately and the recording-state transition happens with `liveTranscript` still populated.

Result: single-click Stop works, "Meeting Ended" summary card reliably appears in the AI panel, and the note saves with its final transcript.

## Architecture comparison: macOS vs Windows

| Aspect | macOS | Windows |
|---|---|---|
| System audio capture | CoreAudio Process Tap + Aggregate Device | WASAPI Loopback on default output |
| Mic capture | `AudioUnit` input via `coreaudio-rs` | `cpal::Stream` input via WASAPI |
| Permission model | TCC dialogs: mic + "System Audio Recording Only" (pre-requested to avoid multiple prompts) | Global Windows privacy setting "Let desktop apps access microphone"; **no** permission needed for system loopback |
| OS version floor | macOS 14.2+ (Process Tap API) | Windows 10+ (cpal WASAPI) |
| Disk streaming | ✓ (shared writer threads) | ✓ (same shared writer threads) |
| Final mix | 16 kHz mono 16-bit WAV via shared `mix_to_wav` | Same |
| Live chunks | 16 kHz mono 16-bit WAV via shared `encode_mixed_wav_chunk` | Same |
| Tick cadence | ~15 fps, `max(sys_rms, mic_rms)` | ~15 fps, `max(sys_rms, mic_rms)` |
| State storage | `Mutex<Option<RecordingState>>` with `unsafe impl Send` | Same |

## Windows privacy requirements

For meeting recording to work, the user must have:

1. **Settings → Privacy & Security → Microphone → Microphone access**: On
2. **Settings → Privacy & Security → Microphone → Let apps access your microphone**: On
3. **Settings → Privacy & Security → Microphone → Let desktop apps access your microphone**: **On** (commonly missed — this is the one that affects Tauri/WebView2 apps)

System-audio loopback does **not** require any permission — anything the OS routes to the default output device is capturable by any process.

If the first two are on but the third is off, `cpal` will fail to open the mic stream with a WASAPI error, which surfaces in the UI as `"Failed to open mic stream: …"`. The system-loopback stream will still work and the recording will proceed with system-audio-only content.

## Gotchas discovered during implementation

- **Fragmented-WebM / MediaRecorder**: The browser MediaRecorder path (mic-only mode) was already sending fragmented WebM chunks on Chromium (Tauri WebView2 on Windows), which the ns-api magic-byte validator rejected because every chunk after the first is missing the EBML header. Fixed in a separate commit by spawning a second independent MediaRecorder dedicated to live chunking that stops and restarts every 20 s, so each uploaded file is self-contained. This is only relevant for mic-only mode; meeting mode sends native WAV chunks via `get_meeting_audio_chunk` and bypasses the browser recorder entirely.
- **cpal Stream !Send**: cpal's Windows streams can't legally cross thread boundaries, but the static Mutex storage pattern from macOS needs a `Send` wrapper. `unsafe impl Send` is the accepted escape hatch since start/stop both run on the same Tauri command thread in practice.
- **Sample format diversity**: cpal can deliver `F32`, `I16`, or `U16` samples depending on the device's WASAPI mix format. The `build_input_stream` helper converts everything to `f32` via format-specific closures; `U16` requires the `(s - 32768) / 32768` offset + scale, not a plain divide.
- **Output-device loopback is not documented prominently in cpal docs** — you just pass an output device to `build_input_stream` and the Windows backend handles the flip. No special trait, no feature flag.
- **Rust build time**: First Windows compile pulls ~520 crates including `cpal`'s Windows FFI chain; plan for ~1.5 minute cold compile on top of the existing Tauri baseline. Incremental rebuilds after editing Rust code are ~5 s.

## Testing

1. Plug in a mic and select it as the default recording device in Windows Sound settings.
2. Start any system-audio source: YouTube video, Teams/Zoom/Meet in a browser tab, music player.
3. In NoteSync, click the Meeting ribbon button.
4. Speak into the mic while the video/meeting audio plays.
5. Verify:
   - Ribbon waveform animates (and responds to *both* your voice and the system audio — it tracks the loudest of the two RMS values).
   - Elapsed counter advances.
   - Live transcript updates every ~20 s in the AI assistant panel.
6. Click Stop (one click).
7. Verify:
   - UI transitions to "processing" immediately (button disappears).
   - After the final WAV is mixed and transcribed, a new note is saved with both your voice and the system audio transcribed together.
   - A "Meeting Ended" summary card appears in the AI chat panel referencing the new note.
