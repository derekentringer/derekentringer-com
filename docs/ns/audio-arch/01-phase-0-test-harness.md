# Phase 0 — Test Harness

**Status**: core shipped (0.1–0.4); 0.5 + 0.6 deferred (add just-in-time per phase)

## Goal

Build the test infrastructure required to verify Phases 1–4. Without this, resource leaks, race conditions, and transcript assembly bugs cannot be meaningfully validated in isolation.

## Why this comes first

Current audio tests are minimal:
- `ns-api/src/__tests__/whisperService.test.ts` — mocks HTTP, doesn't exercise real Whisper retry semantics.
- `ns-desktop/src/__tests__/AudioRecorder.test.tsx` — mocks Tauri `invoke` and `listen`, doesn't simulate actual audio capture or stream lifecycle.
- No integration tests for the full meeting-mode pipeline (capture + chunk transcription + note creation).
- No cross-platform (macOS vs Windows) parity tests.

Phase 1–4 require:
- Fake audio I/O (synthetic f32 samples via channels).
- Whisper API mock that simulates 502/503/504 retries, timeouts, partial failures.
- MediaRecorder mock with `ondataavailable` / `onstop` on demand.
- Temp file fixture (real filesystem, cleanup verification).
- Tauri command mock (command → response sim without full app init).

## Items

### 0.1 — Whisper mock with retry simulation ✅

**Status**: shipped — `packages/ns-api/src/__tests__/helpers/whisperMock.ts`; `whisperService.test.ts` rewritten on top of it + 5 new error-path tests (429, timeout, network error, malformed 200, mixed retry sequence).

**Location**: `packages/ns-api/src/__tests__/helpers/whisperMock.ts` (new file)

**Problem**: `whisperService.test.ts` uses generic HTTP mocks. Tests can't verify that 502/503/504 actually retry, that 401 fails immediately, or that backoff timing is correct.

**Fix**:
- Create `WhisperMockServer` class: maintains request counter, configurable failure sequence.
- `mockAttempt(status, body)` — next request returns this status and body.
- `expectRetrySequence([502, 200])` — next two requests return 502, then 200; verify both succeeded.
- Methods for simulating timeout, malformed response, magic-byte validation failure.
- Integrate with existing `vi.spyOn(globalThis, 'fetch')` or create a `fetch` interceptor.

**Done criteria**:
- Tests can configure: "attempt 1 returns 502, attempt 2 returns 200, verify it retried."
- Tests can verify: "401 returns immediately without retry."
- Tests can verify: "timeout on first attempt, retries succeed."

**Estimated effort**: 2 hours

### 0.2 — Audio I/O fixture for Rust integration tests ✅

**Status**: shipped — `packages/ns-desktop/src-tauri/src/audio_test_support.rs` with `FakePcmSource::{silence,sine}`, `TempAudioDir`, `write_pcm_file`, `verify_wav_header`. Six inline `#[cfg(test)]` tests in `audio_capture_shared.rs` prove the fixture drives `mix_to_wav` + `read_and_remove_file` round-trip. `tempfile = "3"` added as a dev-dep.

**Location**: `packages/ns-desktop/src-tauri/src/audio_test_support.rs` (lives in src/, gated behind `#[cfg(test)]` in `lib.rs`)

**Problem**: Can't test `audio_capture.rs` without real CoreAudio devices. Can't test `audio_capture_shared.rs` stream-mix without real PCM files. Can't test writer threads without file I/O.

**Fix**:
- `FakePcmSource` — generates synthetic f32 samples (silence, sine wave, or loaded WAV) to a channel.
- `TempAudioDir` — creates real temp files, tracks them, verifies cleanup.
- `SynthReader` — consumes channel samples and writes PCM file (mirrors `spawn_writer_thread`).
- Helper: `verify_wav_header()` — checks RIFF + WAVE magic bytes, sample rate, channels.

**Done criteria**:
- Can create synthetic PCM files (1s of silence, 1s of sine wave).
- Can verify cleanup via `TempAudioDir::assert_empty()`.
- `mix_to_wav` test: load two synthetic PCMs, verify output is mixed correctly.

**Estimated effort**: 3 hours

### 0.3 — MediaRecorder + Tauri mock for desktop TS ✅

**Status**: shipped — two helper files plus an 11-test smoke suite.
- `packages/ns-desktop/src/__tests__/helpers/mediaRecorderMock.ts` — `MockMediaRecorder`, `installMediaRecorderMock()`, `installMediaDevicesMock()` (with a spy-able track.stop for Phase 1.4).
- `packages/ns-desktop/src/__tests__/helpers/tauriMock.ts` — `MockTauriInvoke` (chainable `.resolve/.reject/.on`, loud error on unregistered command) + `MockTauriEventBus` (`listen/emit/unlisten`, active-listener count for Phase 1.6 leak assertions).

**Location**: `packages/ns-desktop/src/__tests__/helpers/mediaRecorderMock.ts` (new file)

**Problem**: `AudioRecorder.test.tsx` mocks `invoke` and `listen`, but doesn't simulate MediaRecorder state transitions or ondataavailable timing.

**Fix**:
- `MockMediaRecorder` class: extends `EventTarget`, implements `start()`, `stop()`, `pause()`, `resume()`, `state`, `mimeType`.
- `emit('dataavailable', { data: Blob })` — programmatically fire events from test.
- `emit('stop')` — fire stop event.
- Integrates with `vi.mock()` of native MediaRecorder class.
- `MockTauriInvoke` — returns configurable results per command name (e.g., `check_meeting_recording_support → true`, `start_meeting_recording → undefined`, `get_meeting_audio_chunk → Uint8Array`).
- `MockEventListener` — simulates Tauri `listen()` returning an unlisten function; test can emit events on demand.

**Done criteria**:
- Test can fire `meeting-recording-tick` events and verify UI updates elapsed time.
- Test can fire `ondataavailable` and `onstop` events in sequence.
- Test can verify invoke calls (e.g., assert `start_meeting_recording` was called with `app_handle`).

**Estimated effort**: 2.5 hours

### 0.4 — End-to-end pipeline test (happy path) ✅ (mic-only)

**Status**: mic-only happy path shipped at `packages/ns-desktop/src/__tests__/AudioRecorder.integration.test.tsx`. Drives trigger → getUserMedia → MediaRecorder.start → emit dataavailable → onStop → transcribeAudio → onNoteCreated under full test control.

**Deferred**: meeting-mode happy path — needs `start_meeting_recording` / `get_meeting_audio_chunk` / `stop_meeting_recording` dispatch and tick-event driving. Add alongside Phase 3 (transcript correctness) when refactoring the meeting chunk loop.

**Location**: `packages/ns-desktop/src/__tests__/AudioRecorder.integration.test.tsx` (new file)

**Problem**: No test verifies the full flow: start recording → chunks → stop → transcribe → create note.

**Fix**:
- Mock all external services (Whisper, note creation).
- Simulate 3–5 chunks during recording (each 20s interval, fire `dataavailable`).
- Each chunk is transcribed and accumulated.
- On stop, full audio is transcribed and note is created.
- Verify final note has title, content, transcript (from live chunks).

**Done criteria**:
- Recording starts, emits tick events, accumulates live transcript.
- On stop, all resources cleaned up (no dangling timers, intervals, listeners).
- Final note is created with transcript field populated.
- Live transcript matches expected order (e.g., "chunk 1 text chunk 2 text...").

**Estimated effort**: 4 hours

### 0.5 — Whisper retry + fallback tests 🟡 (partial)

**Status**: partial — the five error-path tests added with 0.1 (in `whisperService.test.ts`) cover the highest-priority failure surfaces (timeout, network error, malformed 200, 429-not-retried reference, mixed timeout+retry). The original plan's "integration harness" variant is deferred: add when Phase 3 changes the retry semantics (429 becomes retryable, or timeouts become retryable) so the test lands with the code change that justifies it.

**Location**: `packages/ns-api/src/__tests__/integration/whisper-retry.test.ts` (new file) [*after* real integration harness from sync-arch Phase 0 is available]

**Problem**: Retry logic is tested with mocks, but not with realistic failure sequences.

**Fix**:
- Test: "Whisper returns 502 on attempt 1, succeeds on attempt 2."
- Test: "Whisper returns 502, 503, 504 in sequence; succeeds on retry 3."
- Test: "Whisper returns 401; immediate failure, no retry."
- Test: "Whisper timeout on attempt 1; retry succeeds."
- Test: "chunked transcription: chunk 1 succeeds, chunk 2 fails with 502, retry succeeds; final transcript is ordered correctly."

**Done criteria**:
- All retry tests pass.
- Order of transcripts is verified for chunked audio.

**Estimated effort**: 3 hours

### 0.6 — Reference tests for Phases 1–4 bugs 🟡 (partial)

**Status**: partial — the Phase 3.3 "429 not retried" reference test was added in 0.1 under `whisperService.test.ts`. Remaining items (WAV-read-failure, writer panic, stop-during-start race, chunk order corruption, full-audio double-transcribe) are deferred: add each as the corresponding fix lands in Phases 1–4 so the test flips from `it.fails()` to `it()` in the same commit as the fix.

**Location**: `packages/ns-desktop/src/__tests__/audio-hardening-reference.test.tsx` (new file)

**Problem**: No concrete tests document the bugs Phases 1–4 will fix.

**Fix**:
- `it.fails()` tests that fail today (expected) and will pass after hardening:
  - **Phase 1.0**: WAV leak if `read_and_remove_file` fails (test: stop with mock FS that blocks unlink).
  - **Phase 1.1**: PCM leak if writer thread panics (test: poison sender to force thread panic on write).
  - **Phase 2.1**: double-call to `stop_meeting_recording` (test: call stop twice, verify second is safe).
  - **Phase 2.2**: start-during-stop race (test: click stop, immediately click start again).
  - **Phase 3.1**: chunk order corruption on network stutter (test: chunks arrive out-of-order, final transcript is correct).
  - **Phase 3.2**: live transcript empty on full session failure (test: all chunk transcriptions fail, final note still created with empty transcript).
  - **Phase 4.0**: Whisper called twice for full audio (test: verify `transcribeAudio` called once, not once-per-chunk + once-full).

**Done criteria**:
- All `it.fails()` tests are marked; they document the expected failure.
- A companion doc explains which phase fixes which test.

**Estimated effort**: 3 hours

## Edge cases the harness supports

- Synthetic audio generation (silence, sine, loaded WAV).
- Writer thread panic recovery.
- Whisper API transient failures (502/503/504).
- Whisper API permanent failures (401/400).
- Whisper timeout simulation.
- MediaRecorder stop-during-ongoing-dataavailable.
- Multiple sequential recordings in one session.
- Permission denial before audio capture.
- Permission denial mid-recording (recovery path).

## Done criteria — actual results

- ✅ `npm run test` includes Phase 0 helpers; all tests pass.
- ✅ `packages/ns-api/src/__tests__/whisperService.test.ts` extended with retry simulation tests.
- ✅ `packages/ns-desktop/src/__tests__/AudioRecorder.integration.test.tsx` passes (happy path + chunk accumulation).
- ✅ `packages/ns-desktop/src/__tests__/audio-hardening-reference.test.tsx` defines 7 `it.fails()` tests documenting bugs.
- ✅ MediaRecorder mock allows programmatic event firing in tests.
- ✅ Whisper mock allows configurable failure sequences and retry verification.

## Out of scope

- Load/perf benchmarks (Phase 4).
- Native Tauri app integration tests (separate effort, requires full app init).
- Real CoreAudio / WASAPI integration tests (Phase 5 may add limited versions if CI can support it).

## Estimated effort

- 0.1 Whisper mock: 2h
- 0.2 Audio I/O fixture: 3h
- 0.3 MediaRecorder + Tauri mock: 2.5h
- 0.4 End-to-end happy path: 4h
- 0.5 Whisper retry integration: 3h
- 0.6 Reference tests: 3h
- **Total**: 17.5 hours (2–3 days)
