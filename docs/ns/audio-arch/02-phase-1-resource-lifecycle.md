# Phase 1 — Resource Lifecycle: Temp Files, Streams, Threads

**Status**: partial — TS items (1.0, 1.1, 1.4, 1.5, 1.6) shipped; Rust items (1.2, 1.3) reverted after real-use regression. See revert commit `54ea383`.

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

### 1.0 — Startup cleanup sweep (v2.38.0 verification) ✅

**Status**: shipped — `cleanup_stale_temp_files()` is split into a thin wrapper around `cleanup_stale_temp_files_in(&Path)` so tests can sandbox the sweep. Added two Rust tests in `audio_capture_shared.rs`:
- `cleanup_stale_temp_files_in_removes_notesync_prefixed_wav_and_pcm` — writes 3 target files (`notesync_meeting_*.wav`, `notesync_sys_*.pcm`, `notesync_mic_*.pcm`) + 4 survivors (wrong prefix, wrong extension, notesync-prefixed non-audio) into a scoped `TempAudioDir`, asserts only the targets are removed and the returned `(count, bytes)` is accurate.
- `cleanup_stale_temp_files_in_returns_zero_when_dir_missing` — verifies graceful no-op against a nonexistent path.

Startup wiring at `lib.rs:412-414` (background thread) is already live from v2.38.0 and unchanged.

**Location**: `packages/ns-desktop/src-tauri/src/lib.rs` (app initialization) + `audio_capture_shared.rs:343-385`

**Problem**: Already shipped in v2.38.0 (`cleanup_stale_temp_files()`), but verify it's called and effective.

**Fix**:
- Confirm `main()` / app setup calls `cleanup_stale_temp_files()` on startup.
- Verify it logs removed file count + total bytes freed.
- Test: create fake `notesync_*.wav` files in temp dir, restart app, verify they're gone.

**Done criteria**:
- Startup logs: "Cleaned up N stale NoteSync temp file(s), freed X.X MB" (if N > 0).
- Files matching `notesync_*.{wav,pcm}` are actually removed.

**Estimated effort**: 0.5 hours

### 1.1 — Atomic read-and-remove for final WAV ✅

**Status**: shipped — `read_and_remove_file` now logs unlink failure at ERROR (was WARN). Added two tests: happy-path (`read_and_remove_file_returns_bytes_and_deletes`) and unix-only blocked-unlink (`read_and_remove_file_returns_bytes_even_when_unlink_fails`) that locks the parent dir read-only to force the unlink to fail, then asserts bytes are still returned. The ERROR log also calls out that startup sweep will clean up next launch.

**Location**: `packages/ns-desktop/src-tauri/src/audio_capture_shared.rs:329-338`

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

### 1.2 — Writer thread panic handling ❌ reverted

**Status**: reverted in `54ea383`. The `join_writer_and_cleanup` helper and its integration in `stop_recording` were undone when we reverted `audio_capture.rs` + `audio_capture_win.rs` to develop's versions during the TCC-permission debugging saga. The develop stop path uses the simpler pre-existing join logic (`.join().map_err(...)?`). The helper itself has also been removed from `audio_capture_shared.rs` since it was unused; re-landing this item requires re-introducing both the helper and the callsite in a follow-up.

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

### 1.3 — PCM temp file cleanup on early error paths ❌ reverted

**Status**: reverted in `54ea383`. `StartupGuard` and `rollback_writer_and_unlink` have been removed. The develop-parity capture code doesn't clean up partially-allocated resources on an early `?` — an orphaned PCM would get swept at next app launch via `cleanup_stale_temp_files()`, which is a much coarser fallback than the guard provided but matches what develop ships.

Re-landing requires reintroducing `StartupGuard` + `rollback_writer_and_unlink` together; both platforms need it. If reintroduced, test against a packaged `.app` build (not `tauri dev`) so TCC permission state doesn't confuse the results.

**Location**: `packages/ns-desktop/src-tauri/src/audio_capture.rs:37-149, 547-622` (macOS) + `audio_capture_win.rs:82-170, 193-309` (Windows)

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

### 1.4 — MediaRecorder cleanup on TS unmount ✅

**Status**: shipped — `cleanup()` now checks `.state !== "inactive"` on both `mediaRecorderRef.current` and `chunkRecorderRef.current` and calls `.stop()` inside a try/catch before nulling refs and stopping stream tracks. For the chunk recorder, `chunkRecorderShouldRestartRef.current = false` is set first so the onstop restart handler doesn't spawn another recorder after unmount. New integration test `"unmount during recording stops MediaRecorder and releases stream"` in `AudioRecorder.integration.test.tsx` mounts, triggers recording, unmounts mid-stream, and asserts the mock MediaRecorder is `"inactive"` and `track.stop` was called.

**Location**: `packages/ns-desktop/src/components/AudioRecorder.tsx:124-170` (cleanup function)

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

### 1.5 — Timer and interval cleanup on early error ✅

**Status**: shipped — verification + test coverage. A code audit of `handleMeetingRecord`, `handleMeetingStop`, and `handleMicRecord` confirmed every `catch` block calls `cleanup()` *before* `onError(...)`; cleanup nulls `timerRef` / `chunkTimerRef`, unlistens the tick event, stops stream tracks, and (Phase 1.4) stops active MediaRecorders. Two new integration tests pin this down: `"getUserMedia rejection cleans up and reports onError"` (mic path, `DOMException` with `NotAllowedError`) and `"start_meeting_recording rejection runs cleanup, no listener leaks"` (meeting path asserting zero `meeting-recording-tick` listeners after the rejected start). No code change was needed in `AudioRecorder.tsx` for 1.5 — the existing `catch → cleanup() → onError()` order already satisfied the invariant; the tests lock it in against regressions.

**Location**: `packages/ns-desktop/src/components/AudioRecorder.tsx:124-170` (cleanup function) + error paths in `handleMeetingRecord`, `handleMicRecord`

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

### 1.6 — Tauri event listener cleanup on unmount ✅

**Status**: shipped — code audit confirmed AudioRecorder only registers a single `listen()` call (`meeting-recording-tick` at line 289) and the unlisten is invoked in both `cleanup()` and `handleMeetingStop`. New integration test `"unmount during meeting recording calls unlisten for tick events"` uses the Phase 0.3 `MockTauriEventBus` to verify the listener count goes `0 → 1 → 0` across mount → start → unmount, plus `eventBus.totalUnlistens >= 1`.

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
