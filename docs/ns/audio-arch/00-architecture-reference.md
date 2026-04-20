# Audio Pipeline Architecture Reference (Current State)

Snapshot of the three-tier audio recording + transcription + note-generation pipeline as it exists in v2.38.0+.

## Three-tier pipeline

### Tier 1: Audio Capture (Rust, platform-specific)

**macOS** (`packages/ns-desktop/src-tauri/src/audio_capture.rs`):
- `check_support()` — verifies OS ≥ 14.2 (Process Tap availability).
- `request_microphone_permission()` — prompts via AVFoundation; retries until granted or denied.
- `request_system_audio_permission()` — pre-requests via minimal Process Tap; tries 30 times (30s timeout).
- `create_process_tap()` — creates Core Audio Process Tap on output device; retries 30 times.
- `create_aggregate_device()` — wraps tap in loopback aggregate device; no permission dialog.
- `setup_input_audio_unit()` — opens AudioUnit for input from a device; registers f32 callback that sends samples via `SyncSender<Vec<f32>>` to writer thread.
- `start_recording()` — pre-requests perms (2 dialogs max), then sets up mic + system audio units in parallel, spawns writer threads, starts tick thread.
- `get_audio_chunk()` — reads new bytes from both PCM temp files, downmixes to mono, resamples to 16 kHz, mixes 50/50, WAV-encodes in-memory chunk for live transcription.
- `stop_recording()` — stops audio units, signals writer threads to finish, waits for them, destroys tap + aggregate device, stream-mixes both temp PCM files to final 16 kHz mono WAV on disk, reads WAV into memory, deletes the file.

**Windows** (`packages/ns-desktop/src-tauri/src/audio_capture_win.rs`):
- `check_support()` — returns `true` (WASAPI available on all supported Windows versions).
- `start_recording()` — opens two cpal streams: mic (input) + system loopback (output device opened in loopback mode). Streams push samples via `SyncSender` to writer threads. Spawns tick thread.
- `get_audio_chunk()` — identical to macOS: reads PCM since last call, resamples, mixes, WAV-encodes.
- `stop_recording()` — drops cpal streams, signals writer threads, waits for them, stream-mixes temp PCMs to final WAV, reads into memory, deletes file.
- Error path (both): if mic unavailable, returns error; system loopback has no permission gate.

**Platform-agnostic helpers** (`packages/ns-desktop/src-tauri/src/audio_capture_shared.rs`):
- `spawn_writer_thread()` — receives f32 samples from channel, writes raw PCM (f32 little-endian) to temp file via 256KB buffer.
- `read_pcm_since()` — opens temp file, seeks to byte offset, reads remaining samples as f32.
- `to_mono()` — downmixes interleaved multi-channel to mono by averaging each frame.
- `ChunkResampler` — stateful linear-interpolation resampler; `process()` carries state between calls.
- `encode_mixed_wav_chunk()` — mixes two mono f32 inputs 50/50 with soft clipping, WAV-encodes to in-memory buffer.
- `mix_to_wav()` — stream-mixes two raw PCM temp files in 1-second chunks; outputs 16 kHz mono 16-bit WAV to disk.
- `read_and_remove_file()` — reads file into memory, deletes it; returns `Vec<u8>`.
- `cleanup_stale_temp_files()` — walks `$TMPDIR`, removes files matching `notesync_*.{wav,pcm}` (v2.38.0+).

### Tier 2: Live Transcription (TypeScript + Server)

**Desktop** (`packages/ns-desktop/src/components/AudioRecorder.tsx`):
- For meeting mode: calls `invoke("get_meeting_audio_chunk")` every 20 seconds, receives mixed WAV bytes, uploads to `/ai/transcribe-chunk` with `(sessionId, chunkIndex)`.
- For mic mode: spawns independent `MediaRecorder` on the same stream; every 20 seconds calls `stop()` on recorder (produces self-contained WebM/Opus), uploads complete blob to `/ai/transcribe-chunk`.
- Live transcript assembled in `transcriptChunksRef.current: Map<number, string>` from `transcribeChunk` results; `getOrderedTranscript()` joins ordered chunks with spaces.
- Both paths: `chunkRecorderShouldRestartRef.current` prevents recorder restart while upload is in flight; recording can end cleanly if restart is false.

**Server** (`packages/ns-api/src/routes/ai.ts:504–587`):
- `POST /ai/transcribe-chunk` handler:
  - Parses multipart: extracts `file`, `sessionId`, `chunkIndex`.
  - Validates audio magic bytes (WebM EBML header, WAV RIFF+WAVE, etc.).
  - Calls `transcribeAudio(buffer, filename)` (single chunk, no chunking).
  - Returns `{ sessionId, chunkIndex, text }`.
  - Error path: returns 502 with message; client logs warning and skips.

**Whisper service** (`packages/ns-api/src/services/whisperService.ts:14–53`):
- `transcribeAudio()` — single chunk:
  - Retries up to 2 times (3 total attempts) with 1s, 2s backoff.
  - Only retries on 502, 503, 504; fails immediately on 401, 400, etc.
  - 5-minute timeout per request.
  - Returns `{ text: string }` from Whisper API.

### Tier 3: Note Creation (TypeScript + Server)

**Desktop flow** (`AudioRecorder.tsx:325–348` for meeting mode; `379–415` for mic mode):
- On final `stop_recording()` / `mediaRecorder.onstop`:
  - Captures live transcript from `transcriptChunksRef.current`.
  - Calls `transcribeAudio(blob, mode, folderId)` — full-audio transcription.
  - Awaits `structureTranscript(transcript, mode)` to generate title + content + tags.
  - Calls `createNote()` to insert in DB.
  - **Separately**: if live transcript captured, PATCH `/notes/{id}` with `{ transcript: capturedTranscript }` to save chunks as inline transcript (non-fatal if fails).

**Server flow** (`packages/ns-api/src/routes/ai.ts:590–703`):
- `POST /ai/transcribe`:
  - Calls `transcribeAudioChunked(buffer, filename, log)` (full audio, may split if >25MB).
  - Calls `structureTranscript(transcript, mode)` (Claude via `aiService`).
  - Calls `createNote(userId, { title, content, tags, audioMode, folderId })`.
  - Returns `{ title, content, tags, note }`.
  - Error: 502 on Whisper failure, 502 on structuring failure.

**Chunked transcription** (`packages/ns-api/src/services/whisperService.ts:55–91`):
- `transcribeAudioChunked()`:
  - Calls `splitAudioIfNeeded()` to chunk if needed (likely >25MB).
  - Transcribes chunks in parallel batches (max 3 in flight).
  - **Concatenates transcripts with spaces** — no per-chunk metadata.
  - Returns joined text.

## Data flow

```
[Start Meeting] ──→ request_microphone_permission()
                 ──→ request_system_audio_permission()
                 ──→ create_process_tap() + create_aggregate_device() [macOS]
                 ──→ open_cpal_streams() [Windows]
                 ──→ spawn writer threads (system + mic)
                 ──→ spawn tick thread
                 ──→ start AudioUnits
                 ──→ emit "meeting-recording-tick" every 66ms

[During Recording] ──→ AudioUnit callback ──→ push f32 to SyncSender ──→ writer thread ──→ append PCM to disk
                    ──→ every 20s: get_audio_chunk() ──→ read PCMs ──→ mono + resample + mix ──→ WAV chunk
                    ──→ POST /ai/transcribe-chunk ──→ Whisper ──→ transcribeChunk result
                    ──→ accumulate in transcriptChunksRef.current

[Stop Recording] ──→ stop AudioUnits
              ──→ signal writer threads + wait for join
              ──→ destroy tap + aggregate device [macOS]
              ──→ mix_to_wav(sys.pcm, mic.pcm) ──→ 16kHz mono WAV on disk
              ──→ read_and_remove_file() ──→ Vec<u8>
              ──→ POST /ai/transcribe ──→ Whisper ──→ structureTranscript ──→ createNote
              ──→ PATCH /notes/{id} with live transcript [if captured]

[Cleanup on crash] ──→ app startup: cleanup_stale_temp_files() ──→ remove notesync_*.{wav,pcm}
```

## File storage

- Temp PCM files: `$TMPDIR/notesync_sys_{timestamp}.pcm` + `$TMPDIR/notesync_mic_{timestamp}.pcm` (created by writer threads during recording, deleted after mix).
- Temp WAV file: `$TMPDIR/notesync_meeting_{timestamp}.wav` (created by `mix_to_wav`, deleted after `read_and_remove_file`).
- Note record: `notes` table in Postgres, with `audioMode` field (meeting/lecture/memo/verbatim).
- Transcript: `notes.transcript` column (optional; populated from live chunks if capture succeeded).

## Known asymmetries

1. **Permission model**: macOS has two TCC dialogs (mic + system audio); Windows has zero (mic via Settings, system loopback has no gate).
2. **Permission pre-request**: macOS calls permission functions twice before starting audio units; Windows doesn't. (Intentional: macOS needs TCC dialogs before Hardware operations; Windows doesn't.)
3. **Chunk assembly**: meeting mode uses Rust-sampled chunks from continuous PCM files; mic mode uses MediaRecorder's self-contained WebM blobs. Transcript assembly identical in both.
4. **Error handling**: meeting mode silently skips failed chunks (logs warning); mic mode doesn't retry chunk transcription (each upload fails once).
5. **Temp file cleanup**: relies on `read_and_remove_file` on happy path; startup sweep catches files from crashes or earlier versions.
6. **Live transcript accuracy**: chunks transcribed independently, no context carry-over between chunks. Final transcript from full audio is authoritative.

## Test fixtures needed

- Real Whisper API mocks (HTTP 502/503/504 retries, timeout simulation).
- Real cpal / CoreAudio I/O simulation (synthetic f32 samples via channel).
- Tauri command mock (invoke sim, event listener sim).
- MediaRecorder mock (ondataavailable, onstop events on demand).
- Temp file fixtures (TmpDir for real filesystem, cleanup verification).
