# Audio Pipeline Invariants

Post-hardening (Phases 1–4) load-bearing rules. Change any of these and the rest of the system drifts — update this doc + the relevant phase doc at the same time.

---

## 1. Temp file cleanup on all paths

Every PCM and WAV temp file created during recording (`notesync_sys_*.pcm`, `notesync_mic_*.pcm`, `notesync_meeting_*.wav`) **must** be deleted:

- **Happy path** — deleted by `read_and_remove_file()` after Rust returns the bytes to TS, or by `mix_to_wav` caller if WAV reading fails.
- **Early error path** — on permission denial or device unavailable in `start_recording`, nothing is written yet (no cleanup needed).
- **Mid-recording crash** — files linger until next app startup, when `cleanup_stale_temp_files()` sweep removes them (Phase 1.0).
- **Stop-side error** — `mix_to_wav` or `read_and_remove_file` failing should still attempt file removal (Phase 1.1).

**Verification**: every code path that creates a temp file has a corresponding delete, or relies on startup sweep.

## 2. Writer thread lifecycle

For each recording, **exactly two** writer threads are spawned (system + mic):

- **Start**: spawned in `start_recording` before returning success.
- **Stop**: sender is dropped, thread exits its `recv()` loop, flushes, closes file.
- **Wait**: `stop_recording` calls `.join()` on handle and propagates error if thread panicked or I/O failed.
- **Never abandoned**: if `stop_recording` is called, both threads are joined before returning (Phase 2.1).
- **Idempotent stop**: if `stop_recording` is called twice, second call sees no RECORDING state and returns early (Phase 2.2).

**Verification**: `ThreadJoinError` logged; no silent thread panics.

## 3. Audio unit / stream cleanup on error

On macOS, if `start_recording` fails **after** an AudioUnit is created:
- The unit is dropped (implicit via Rust scope).
- No `.stop()` needed if `.start()` never succeeded.
- If `.start()` succeeded but later steps fail, `stop_recording` must be called to stop the unit (enforced via RECORDING guard).

On Windows, if `start_recording` fails **after** a cpal stream is created:
- The stream is dropped (implicit).
- `play()` must not be called if stream creation failed.

**Verification**: no dangling AudioUnits / streams emit audio after failure.

## 4. Chunk ordering is monotonic

Live transcription via `/ai/transcribe-chunk` arrives with `chunkIndex`:

- **Desktop**: `chunkIndexRef.current` is incremented **before** upload; chunks are 0, 1, 2, ... across the session.
- **Server**: accepts any `chunkIndex` value; no validation (client is trusted).
- **Assembly**: `transcriptChunksRef.current: Map<number, string>` is populated as responses arrive; order doesn't matter because `getOrderedTranscript()` iterates `0..maxIdx` and joins ordered text.
- **Dedup**: same `(sessionId, chunkIndex)` pair received twice results in the **later** response overwriting the earlier one (simple Map behavior). If Whisper returned different text for identical audio, second response wins. (Phase 3.1: clarify if this is intentional or needs dedup warning.)

**Verification**: final transcript never has gaps (`getOrderedTranscript()` would have undefined entries) or out-of-order chunks.

## 5. Session ID is unique per recording

`generateSessionId()` creates a unique ID at recording start:

```typescript
`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
```

- **Uniqueness**: timestamp (ms precision) + random suffix minimize collisions.
- **Scope**: session ID is used to group chunks during recording; after `stop_recording`, session is discarded (no persistence).
- **Multiple recordings**: each new recording starts a new session; old chunks are never re-assembled with new recordings.

**Verification**: session ID never reused within a single app session; cleanup on recording stop (Phase 2.3).

## 6. MediaRecorder lifecycle is bounded

In mic mode, an independent `MediaRecorder` is created for chunked transcription:

- **Creation**: in `startMicChunkRecorder()` with `mimeType` from `getSupportedMimeType()`.
- **Data flow**: `ondataavailable` collects blobs into `chunkBufferRef.current`.
- **Stop + restart**: every 20 seconds, `.stop()` is called; `onstop` handler uploads and conditionally restarts if `chunkRecorderShouldRestartRef.current` is true.
- **Final stop**: on `handleStop()`, `chunkRecorderShouldRestartRef.current` is set to `false`; next `onstop` skips restart.
- **Cleanup**: on unmount or recording end, `mediaRecorderRef.current` is nulled (Phase 2.4).

**Verification**: no MediaRecorder instances leak to new recordings; `chunkBufferRef` is always cleared on stop.

## 7. Whisper retries are transient-only

`transcribeAudio()` in `whisperService.ts`:

- **Retryable**: 502, 503, 504 (server issues, timeouts).
- **Non-retryable**: 401 (auth), 400 (bad request), 422 (validation), etc.
- **Backoff**: 1000ms * attempt (1s on retry 1, 2s on retry 2, etc.).
- **Max attempts**: 3 (initial + 2 retries).
- **Timeout**: 5 minutes per request.
- **Last error**: thrown if all retries exhausted.

**Verification**: unit tests cover retry matrix; non-retryable errors fail fast; timeout never silently hangs.

## 8. Transcript assembly is atomic

Final note creation includes either:

- **Full transcription path** (`/ai/transcribe`): audio → Whisper → structure → createNote (all-or-nothing via server tx).
- **Live transcript path** (`/ai/structure-transcript`): pre-transcribed text → structure → createNote (all-or-nothing).
- **Inline transcript save** (PATCH `/notes/{id}`): after createNote succeeds, save live chunks. If PATCH fails, note exists but transcript field is empty (non-fatal, Phase 3.2).

**Verification**: no partial notes (title but no content, or vice versa); live transcript is auxiliary.

## 9. Live transcript capture is best-effort

During recording, live chunks are accumulated in `transcriptChunksRef.current`. On stop:

- Captured transcript is the **ordered string** of chunk texts joined with spaces.
- If no chunks succeeded, captured transcript is empty.
- If Whisper failed on some chunks, those indices are missing from the map; `getOrderedTranscript()` skips them.
- Captured transcript is used to **seed** the final note's transcript field via PATCH; if PATCH fails, the note still exists (Phase 3.2).

**Verification**: final note never contains "partial" or broken transcript (empty or complete only); full audio is transcribed separately for authoritative result.

## 10. Tick events are best-effort

Tick thread emits `meeting-recording-tick` every ~66ms:

- Payload: `(elapsed_secs: u64, level: f32)`.
- If stop_flag is set, thread exits.
- If RMS lock fails, uses stale value (no panic).
- UI uses ticks to update elapsed time and waveform; missing ticks result in visual jank, not data loss.

**Verification**: tick thread never blocks recording or stop path.

## 11. Permission state is queried once per app session

`check_meeting_recording_support()` is called on AudioRecorder mount:

- Checks OS version (macOS ≥ 14.2) or returns true (Windows).
- Result cached in `meetingSupported` state.
- User can revoke permissions after check; `start_recording` will fail if permissions change.
- **No re-check**: if user denies permissions mid-app, UI shows error but doesn't re-check (Phase 5.0: consider refresh button for permission recovery).

**Verification**: permission check doesn't block UI; errors propagate to toast/error callback.

## 12. Stop is re-entrant guarded

`handleMeetingStop()` in AudioRecorder:

- First line checks `isMeetingRef.current`; if false, returns early (no-op).
- Sets `isMeetingRef.current = false` immediately to guard against re-entry.
- If caller clicks Stop button twice, second click is silently ignored (Phase 2.2).

**Verification**: `invoke("stop_meeting_recording")` is called at most once per recording; no double-cleanup errors.
