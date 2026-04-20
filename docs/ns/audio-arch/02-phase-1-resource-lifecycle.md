# Phase 1 — Resource Lifecycle: Temp Files, Streams, Threads

**Status**: pending

## Goal

Plug resource leaks: ensure every temp file, MediaRecorder, stream, and writer thread is cleaned up on all code paths — happy path, early error, mid-recording crash, and unmount.

## Why this matters

- **Symptom**: `$TMPDIR` fills with `notesync_*.pcm` and `notesync_*.wav` files after crashes or if cleanup fails.
- **Root causes**: 
  - `read_and_remove_file()` can fail to unlink after successful read → WAV orphaned (v2.38.0 added startup sweep, not final fix).
  - Writer thread panic → PCM files orphaned forever (no recovery).
  - `mix_to_wav` fails → temporary WAV on disk before error reported.
  - MediaRecorder never stopped on unmount → `ondataavailable` callbacks leak.
  - `chunkTimerRef` or `timerRef` not cleared on early error → setInterval leaks.
  - Tauri `listen` unlisten never called → event listeners leak.

## Items

### 1.0 — Startup cleanup sweep (v2.38.0 verification)

**Location**: `packages/ns-desktop/src-tauri/src/lib.rs` (app initialization) + `audio_capture_shared.rs:343-374`

**Problem**: Already shipped in v2.38.0 (`cleanup_stale_temp_files()`), but verify it's called and effective.

**Fix**:
- Confirm `main()` / app setup calls `cleanup_stale_temp_files()` on startup.
- Verify it logs removed file count + total bytes freed.
- Test: create fake `notesync_*.wav` files in temp dir, restart app, verify they're gone.

**Done criteria**:
- Startup logs: "Cleaned up N stale NoteSync temp file(s), freed X.X MB" (if N > 0).
- Files matching `notesync_*.{wav,pcm}` are actually removed.

**Estimated effort**: 0.5 hours

### 1.1 — Atomic read-and-remove for final WAV

**Location**: `packages/ns-desktop/src-tauri/src/audio_capture_shared.rs:329-336`

**Problem**: `read_and_remove_file()` reads file successfully but unlink fails (permission denied on Windows, etc.) → logs warning but returns success → WAV stays in temp dir.

**Fix**:
- Change behavior: if unlink fails after successful read, still return bytes but log error level (not warn).
- Caller (`stop_recording` in both macOS/Windows) can see if deletion failed.
- Alternatively: `read_and_remove_file()` returns `Result<(Vec<u8>, DeleteStatus)>` where status indicates success/partial/failure.
- Document: "If unlink fails, startup sweep will clean up on next launch; non-fatal."

**Done criteria**:
- Unlink failure is logged as ERROR (not WARN).
- Test: mock FS that fails unlink, verify bytes still returned, error logged.

**Estimated effort**: 1 hour

### 1.2 — Writer thread panic handling

**Location**: `packages/ns-desktop/src-tauri/src/audio_capture_shared.rs:163-179` + Rust call sites

**Problem**: Writer thread panics (e.g., disk full) → PCM file is left in temp dir, not cleaned up. `stop_recording` joins the thread and propagates error, but doesn't clean files.

**Fix**:
- `spawn_writer_thread` returns `JoinHandle<Result<(), String>>`.
- Caller (`stop_recording`) joins and checks result.
- If join fails (panic), manually delete the temp file before returning error.
- Both macOS (`audio_capture.rs:666-676`) and Windows (`audio_capture_win.rs:287-292`): wrap `.join()` result, attempt unlink on panic.

**Done criteria**:
- Test: poison sender to force write error in writer thread → thread returns Err → stop_recording catches it, attempts unlink.
- Verify: if test can't simulate disk-full, at least verify panic path has unlink attempt.

**Estimated effort**: 1.5 hours

### 1.3 — PCM temp file cleanup on early error paths

**Location**: `packages/ns-desktop/src-tauri/src/audio_capture.rs:425-589` (macOS) + `audio_capture_win.rs:89-213` (Windows)

**Problem**: If any step in `start_recording` fails after `spawn_writer_thread` is called (e.g., `create_process_tap` fails 30 times, or `get_device_channels` fails), the PCM files are created but not cleaned up (sender thread still holding open the file).

**Fix**:
- Track which resources were successfully allocated in `start_recording`.
- If error occurs after writer threads are spawned, drop senders and wait for threads to finish + unlink files.
- Use a scoped guard or explicit rollback: on error, call a cleanup helper that closes senders, joins threads, unlinks files.

**MacOS example** (audio_capture.rs:425-589):
- If `get_device_channels(aggregate_device_id)` fails at line 522, system_temp_path and mic_temp_path files exist but are never removed.
- Fix: wrap writer thread creation and subsequent setup in a scope; on error, drop senders, join threads, unlink.

**Done criteria**:
- Test: mock `get_device_channels` to fail; verify PCM files are unlinked.
- Test: mock `create_process_tap` to fail on last retry; verify PCM files are unlinked.

**Estimated effort**: 2 hours

### 1.4 — MediaRecorder cleanup on TS unmount

**Location**: `packages/ns-desktop/src/components/AudioRecorder.tsx:124-150` (cleanup function)

**Problem**: `cleanup()` nulls refs but doesn't explicitly stop `mediaRecorderRef.current` or `chunkRecorderRef.current` if they're still recording.

**Fix**:
- In `cleanup()`, before nulling `mediaRecorderRef` and `chunkRecorderRef`, check `.state`:
  - If recording, call `.stop()` (will fire `onstop`, which is safe to call even during unmount).
  - Wait for onstop to finish (via promise or callback guard).
  - Then null the refs.

**Done criteria**:
- Test: mount component, start recording, unmount immediately → no error, no memory leak.
- MediaRecorder state is "stopped" by unmount cleanup.

**Estimated effort**: 1 hour

### 1.5 — Timer and interval cleanup on early error

**Location**: `packages/ns-desktop/src/components/AudioRecorder.tsx:124-150` (cleanup function) + error paths in `handleMeetingRecord`, `handleMicRecord`

**Problem**: 
- If `start_meeting_recording()` throws after `startMeetingChunkCapture()`, `chunkTimerRef` is set but might not be cleared (depends on catch order).
- If `getUserMedia()` throws, `timerRef` and `chunkTimerRef` are never initialized but cleanup might reference them.
- Both paths can leak setInterval/setTimeout on early error.

**Fix**:
- Ensure `cleanup()` is called **first** in every catch block, **before** error callback.
- Review all error paths: `handleMeetingRecord`, `handleMicRecord`, `handleMeetingStop`.
- Every `try/catch` block should guarantee cleanup before error propagation.

**Done criteria**:
- Test: `start_meeting_recording` throws → verify `chunkTimerRef` is cleared.
- Test: `getUserMedia` throws → verify `timerRef` is cleared.
- Test: any error path → no timers left running.

**Estimated effort**: 1 hour

### 1.6 — Tauri event listener cleanup on unmount

**Location**: `packages/ns-desktop/src/components/AudioRecorder.tsx:93` (tickUnlistenRef), `138-140` (cleanup)

**Problem**: `listen("meeting-recording-tick", ...)` returns an unlisten function. If recording is stopped but unlisten is not called, the event listener leaks.

**Fix**:
- Already done: `tickUnlistenRef.current()` is called in cleanup and in `handleMeetingStop:316-319`.
- Verify: no other event listeners are registered (grep for `listen(` in AudioRecorder).
- Test: mount, start recording, stop, unmount → verify unlisten was called (can spy on event count or use test mock).

**Done criteria**:
- Only one event listener is active during recording.
- Unlisten is called in both happy path (stop) and error path (early error, unmount).

**Estimated effort**: 0.5 hours

## Edge cases covered

- PCM files created, then permission denied → files cleaned up.
- PCM files created, then device unavailable → files cleaned up.
- Writer thread panics → files unlinked.
- Stop called during setup (before all resources allocated) → minimal cleanup.
- Component unmounts during recording → MediaRecorder stopped, all timers cleared, unlisten called.
- `read_and_remove_file` fails to unlink → bytes still returned, error logged, startup sweep will clean up next launch.

## Done criteria

- ✅ Startup cleanup logs removal of any stale files (test: create fake files, restart app).
- ✅ Writer thread panic unlinks PCM files (test mock).
- ✅ Early error paths in `start_recording` clean up partially-allocated resources (test: mock device failure).
- ✅ MediaRecorder is stopped on unmount (test: unmount during recording, no onstop errors).
- ✅ All timers and event listeners cleared on error and unmount (test: spy on setInterval/setTimeout, verify cleared).
- ✅ No dangling file handles, streams, or threads after any error or unmount scenario.

## Out of scope

- Implementing a proper resource manager / RAII pattern (Phase 4).
- Monitoring disk usage in production (separate ops task).
- User-facing "storage cleanup" UI (Phase 6).

## Dependencies

- Phase 0 (test harness) for resource mock support.

## Estimated effort

- 1.0 Startup cleanup verification: 0.5h
- 1.1 Atomic read-and-remove: 1h
- 1.2 Writer thread panic: 1.5h
- 1.3 Early error cleanup: 2h
- 1.4 MediaRecorder unmount: 1h
- 1.5 Timer cleanup: 1h
- 1.6 Event listener cleanup: 0.5h
- **Total**: 7.5 hours (1 day)
