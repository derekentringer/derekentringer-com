# Phase 5 — Test Coverage: Close Gaps, Integration Tests, Cross-Platform Parity

**Status**: pending

## Goal

Achieve >80% coverage on audio pipeline code; add integration tests for end-to-end flows; verify macOS and Windows behave identically under test fixtures.

## Why this matters

- **Current state**: `AudioRecorder.test.tsx` has happy-path tests; Rust audio modules have no unit tests; Whisper service has mock-based tests (no real retry behavior).
- **Risk**: Edge cases slip through (e.g., writer thread panic, permission denial mid-recording, chunk reordering under network loss).

## Items

### 5.1 — Unit tests for Rust audio modules

**Location**: `packages/ns-desktop/src-tauri/src/` — new `#[cfg(test)]` modules

**Problem**: `audio_capture.rs` and `audio_capture_win.rs` have zero unit tests. Only integration path is via Tauri commands (slow, requires app init).

**Fix**:
- **audio_capture.rs**: test `to_mono`, `ChunkResampler`, `read_pcm_since`, `encode_mixed_wav_chunk` in isolation.
- **audio_capture_win.rs**: same helpers + test `build_input_stream` mocking cpal devices.
- Use fake audio I/O from Phase 0.
- **No tests for**: `start_recording`, `stop_recording` (require real device access; skip or mock heavily).

**Done criteria**:
- `cargo test --lib` passes for all audio modules.
- >70% coverage on shared helpers.

**Estimated effort**: 3 hours

### 5.2 — Integration test for meeting-mode flow

**Location**: `packages/ns-desktop/src/__tests__/audio-meeting-integration.test.tsx` (new file)

**Problem**: No test simulates the full flow: start recording → chunks accumulate → stop → note created.

**Fix**:
- Mock Tauri commands (`start_meeting_recording`, `get_meeting_audio_chunk`, `stop_meeting_recording`).
- Simulate `meeting-recording-tick` events.
- Simulate chunk transcription results.
- Verify: final note has correct transcript, live transcript matches expected order.

**Done criteria**:
- Test starts, records 3 chunks, stops, creates note, verifies transcript.
- Test exercises error paths (e.g., Whisper fails on one chunk).

**Estimated effort**: 3 hours

### 5.3 — Cross-platform parity tests

**Location**: `packages/ns-desktop/src-tauri/src/__tests__/audio-parity.rs` (new file)

**Problem**: macOS uses CoreAudio + Process Tap; Windows uses cpal + WASAPI loopback. No test verifies they produce identical output for the same audio input.

**Fix**:
- Use fake I/O fixture from Phase 0 (same synthetic samples for both platforms).
- Test `mix_to_wav`, `encode_mixed_wav_chunk`, `to_mono`, `ChunkResampler` on both platforms.
- Verify output is byte-identical (or at least mathematically equivalent after resampling jitter).

**Done criteria**:
- Both platforms produce 16kHz mono WAV from identical synthetic input.
- Resampling differences are documented (linear interpolation may vary slightly).

**Estimated effort**: 2 hours

### 5.4 — Whisper API error path tests

**Location**: `packages/ns-api/src/__tests__/whisper-errors.test.ts` (new file)

**Problem**: `whisperService.test.ts` covers retries, but not all error types (timeout, malformed response, rate limiting, quota exceeded).

**Fix**:
- Test: Whisper timeout (AbortSignal fires).
- Test: Whisper returns malformed JSON.
- Test: Whisper returns 429 (rate limit).
- Test: Whisper returns 401 + body indicates quota.
- Verify error messages are clear.

**Done criteria**:
- All error scenarios return meaningful messages to UI.

**Estimated effort**: 1.5 hours

### 5.5 — Meeting-context hook tests

**Location**: `packages/ns-desktop/src/__tests__/useMeetingContext.test.ts` (new file)

**Problem**: `useMeetingContext` polling logic has no tests.

**Fix**:
- Test: polling starts on recording, fires API call every 45s.
- Test: if transcript unchanged, no API call.
- Test: results are accumulated (new notes prepended).
- Test: already-seen notes are not re-shown.
- Test: on stop recording, polling stops and state resets.

**Done criteria**:
- All polling logic tested with controlled timers.

**Estimated effort**: 2 hours

### 5.6 — Error recovery tests

**Location**: `packages/ns-desktop/src/__tests__/audio-error-recovery.test.tsx` (new file)

**Problem**: No tests for permission denial, device unavailable, or mid-recording failures.

**Fix**:
- Test: permission denied on start → error surfaced, no cleanup hangs.
- Test: device becomes unavailable mid-recording → stop gracefully.
- Test: Whisper fails on all chunks → final transcription still succeeds.
- Test: note creation fails → UI shows error, no orphan chunks.

**Done criteria**:
- All error paths have assertions (e.g., error toast called, state reset).

**Estimated effort**: 2.5 hours

## Edge cases covered

- All error types (401, 429, 502, 503, 504, timeout, malformed).
- Slow upload (multiple chunks in flight).
- Permission denial at various stages.
- Device unavailable mid-recording.
- Chunk reordering under network loss.

## Done criteria

- ✅ Rust audio modules: >70% coverage.
- ✅ Meeting-mode integration test passes.
- ✅ Cross-platform tests verify parity (same input → same output).
- ✅ Whisper error paths all tested.
- ✅ `useMeetingContext` polling verified.
- ✅ Error recovery paths have coverage.
- ✅ Overall audio module coverage: >80%.

## Out of scope

- E2E Tauri app tests (requires full app initialization).
- Real device integration tests (Phase 6 may add with CI support).
- Performance profiling (Phase 4).

## Dependencies

- Phase 0 (test harness).
- Phase 1–4 (fixes; tests verify they work).

## Estimated effort

- 5.1 Rust unit tests: 3h
- 5.2 Meeting-mode integration: 3h
- 5.3 Cross-platform parity: 2h
- 5.4 Whisper errors: 1.5h
- 5.5 Meeting-context tests: 2h
- 5.6 Error recovery: 2.5h
- **Total**: 14 hours (2 days)
