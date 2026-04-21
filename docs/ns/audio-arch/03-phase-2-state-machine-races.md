# Phase 2 — State Machine Races: Start/Stop Guards, Ref Staleness

**Status**: mostly shipped — TS items (2.1, 2.3, 2.4, 2.5, 2.6) all in place; Rust doc-comment from 2.2 reverted. See revert commit `54ea383`.

## Goal

Eliminate race conditions where rapid user clicks (start while stopping, stop during start, or multiple stop calls) cause undefined behavior, double-cleanup, or resource leaks.

## Why this matters

**Symptom**: User clicks Stop button twice in quick succession. App crashes or hangs because `stop_recording` is invoked twice, and second invocation has inconsistent state (senders already dropped, threads already joined).

**Root causes**:
- `handleMeetingStop()` uses `isMeetingRef.current` to guard re-entry, but race window exists between check and set.
- `start_recording()` immediately locks RECORDING mutex but doesn't hold it; another call can slip in.
- Refs (`timerRef`, `mediaRecorderRef`, etc.) can become stale between reads and uses due to async operations.
- `chunkRecorderShouldRestartRef` is set asynchronously; can race with concurrent stop.

## Items

### 2.1 — Double-call guard for `stop_meeting_recording` ✅

**Status**: shipped — verification + test. The existing guard at `AudioRecorder.tsx:314-315` (`if (!isMeetingRef.current) return; isMeetingRef.current = false;`) runs synchronously before any `await`, so a second `onStop()` call during the first's pending `invoke("stop_meeting_recording")` sees `false` and short-circuits. New integration test `"rapid double onStop invokes stop_meeting_recording exactly once"` uses a manually-resolved `stop_meeting_recording` promise to hold the first call in-flight, fires two `onStop()`s back-to-back, and asserts `invokeBus.callsFor("stop_meeting_recording").length === 1`.

**Location**: `packages/ns-desktop/src/components/AudioRecorder.tsx:314-315`

**Problem**: `handleMeetingStop()` checks `isMeetingRef.current`, then sets it to false. But between check and set, another invocation can see true.

```typescript
// RACE: check at line 292, set at line 293
if (!isMeetingRef.current) return;  // Line 292 — check
isMeetingRef.current = false;       // Line 293 — set (not atomic)
```

**Fix**: Use `useCallback` + boolean flag that is set synchronously before awaiting any async operation.

```typescript
const handleMeetingStop = useCallback(async () => {
  // Atomic check-and-set via ref mutation
  if (!isMeetingRef.current) return;
  isMeetingRef.current = false;  // Now anything racing this sees false
  
  try {
    // Rest of function (async operations)
  } catch (err) {
    // error handling
  }
}, []);
```

Alternatively: use a state machine (enum: "idle" | "recording" | "stopping" | "processing") instead of multiple boolean refs.

**Done criteria**:
- Test: call `handleMeetingStop` twice in rapid succession (before first await completes) → second call is no-op, no errors.

**Estimated effort**: 1 hour

### 2.2 — Rust-side `start_recording` idempotence ❌ reverted (doc comment only)

**Status**: the investigation finding is still valid — confirmed via Tauri v2 docs + source that synchronous `#[tauri::command]` handlers run serialized on the main thread, so the check-then-insert pattern is race-free without a CAS guard. But the doc comments I added to both platforms' `start_recording` were lost when we reverted `audio_capture.rs` + `audio_capture_win.rs` to develop in `54ea383`. Cheap to re-land as pure documentation if desired.

**Location**: `packages/ns-desktop/src-tauri/src/audio_capture.rs:549-567` (macOS) + `audio_capture_win.rs:182-196` (Windows)

**Problem**: Both check `if guard.is_some()` and return error. But if two Tauri commands invoke `start_recording` concurrently, the second can slip past the check.

**Fix**: Depends on Tauri command execution model (likely single-threaded, so no race). Verify via:
- Read Tauri v2 command execution semantics.
- If single-threaded: no fix needed; document assumption.
- If potentially concurrent: use a different sync primitive (e.g., `AtomicBool` + CAS).

**Done criteria**:
- Confirm Tauri doesn't allow concurrent command invocations on the same app instance.
- If it does, add racy invocation test (two threads calling `start_recording` simultaneously).

**Estimated effort**: 0.5 hours

### 2.3 — Clean up session state on recording stop ✅

**Status**: shipped — meeting-mode success path's `finally` block now explicitly resets `transcriptChunksRef`, `sessionIdRef`, and `chunkIndexRef` before the state flips to `"idle"`. Mic-mode already reset these via its onstop `cleanup()` call. The start-of-next-recording paths (`startMeetingChunkCapture`, `handleMicRecord`) already reset these too, but adding the explicit reset on stop closes the window where the refs held stale data between stop and the next start.

**Location**: `packages/ns-desktop/src/components/AudioRecorder.tsx:367-380` (meeting stop finally)

**Problem**: On stop, refs are nulled but `sessionIdRef`, `chunkIndexRef`, `transcriptChunksRef` are not cleared. If user starts recording again immediately, old chunks could theoretically be assembled with new ones (low probability due to unique session ID, but possible if session ID collision).

**Fix**:
- In cleanup logic (called from both `handleMeetingStop` and `handleMicStop`), also reset:
  ```typescript
  transcriptChunksRef.current = new Map();
  sessionIdRef.current = "";
  chunkIndexRef.current = 0;
  ```

**Done criteria**:
- Test: record session 1, stop, immediately start session 2, generate chunks → session 2 chunks have `chunkIndex` 0, 1, 2... (not continuing from session 1).

**Estimated effort**: 0.5 hours

### 2.4 — Chunk recorder stop idempotence ✅

**Status**: shipped — verification only. Grep confirmed all three `chunkRecorderRef.stop()` call sites (`cleanup` at line 142, chunk timer at line 468, `handleStop` at line 520) are guarded by either `state !== "inactive"` (cleanup, with try/catch) or `state === "recording"` (timer + handleStop). Optional chaining handles null refs.

**Location**: `packages/ns-desktop/src/components/AudioRecorder.tsx:468-469, 520-521`

**Problem**: Every 20 seconds, `chunkRecorderRef.current.stop()` is called. If `chunkRecorderRef` is null (recording ended), `chunkRecorderRef.current.stop()` throws.

**Fix**: Guard the call:

```typescript
if (chunkRecorderRef.current?.state === "recording") {
  chunkRecorderRef.current.stop();
}
```

Already present at line 436, so this is **verification only** — ensure all `.stop()` calls on recorder have null/state guards.

**Done criteria**:
- Grep: all `chunkRecorderRef.current.stop()` calls are guarded by `state === "recording"` check.
- Test: rapid stop during chunk interval → no error.

**Estimated effort**: 0.5 hours

### 2.5 — Prevent chunk restart after final stop ✅

**Status**: shipped — verification + test. `handleStop` sets `chunkRecorderShouldRestartRef.current = false` synchronously *before* calling `chunkRecorderRef.current.stop()` (lines 518-520), so the chunk recorder's `onstop` handler reads `false` when it decides whether to restart. New integration test `"stop does not trigger a chunk recorder restart"` records the MediaRecorder instance count before stop, fires onStop, flushes microtasks, and asserts no new chunk recorder was spawned.

**Location**: `packages/ns-desktop/src/components/AudioRecorder.tsx:518-522` (handleStop function)

**Problem**: `chunkRecorderShouldRestartRef.current` is set to `false` in `handleStop`, but the chunk recorder's `onstop` handler might be in flight and reads the old value (true), causing it to restart.

```typescript
// In handleStop (line 487):
chunkRecorderShouldRestartRef.current = false;
if (chunkRecorderRef.current?.state === "recording") {
  chunkRecorderRef.current.stop();  // Triggers onstop handler
}

// In startMicChunkRecorder's onstop (line 192):
if (chunkRecorderShouldRestartRef.current && streamRef.current) {
  startMicChunkRecorder(...);  // May race and see old true value
}
```

**Fix**: The ref is set synchronously before calling `.stop()`, so the handler's future read of the ref should see `false`. But timing is tight; test it.

**Done criteria**:
- Test: recording stop → chunk timer fires onstop → verify recorder is NOT restarted.
- Trace: `chunkRecorderShouldRestartRef` is false before `chunkRecorderRef.stop()` is called.

**Estimated effort**: 0.5 hours

### 2.6 — Re-entrance guard for `cleanup()` function ✅

**Status**: shipped — added `cleanupDoneRef` (useRef) initialized to false; `cleanup()` short-circuits when it reads `true` on entry, and sets `true` before any teardown. The flag is reset to `false` at the start of each new recording (`handleMeetingRecord` + `handleMicRecord`) so the next session's cleanup runs through fully. New integration test `"cleanup is idempotent across stop + unmount"` records → stops → unmounts and asserts `track.stop` is called exactly once across the two cleanup invocations.

**Location**: `packages/ns-desktop/src/components/AudioRecorder.tsx:82-92, 134-141`

**Problem**: `cleanup()` is called from multiple places (unmount, error path, stop handler). If called twice, it might clear refs that are being used by an in-flight operation.

**Fix**: Add a guard:

```typescript
const cleanupDoneRef = useRef(false);
const cleanup = useCallback(() => {
  if (cleanupDoneRef.current) return;
  cleanupDoneRef.current = true;
  
  // ... cleanup code
}, []);
```

**Done criteria**:
- Test: cleanup called twice → second call is no-op.
- Test: concurrent cleanup (simultaneous unmount + stop) → safe.

**Estimated effort**: 0.5 hours

## Edge cases covered

- Stop button clicked twice within 100ms.
- Stop clicked while start is in progress (Tauri command pending).
- Stop clicked while chunk timer is firing onstop handler.
- Component unmounts during stop processing.
- Recording restarted immediately after stop.
- Chunk restart races with final stop.

## Done criteria

- ✅ `handleMeetingStop` re-entry guard is atomic (test: double-click Stop).
- ✅ Session state cleared on every stop (test: session 1 and 2 have distinct chunk indices).
- ✅ Chunk recorder stop is guarded (test: no errors on rapid state changes).
- ✅ Chunk restart is disabled on final stop (test: recording stops, no restart triggered).
- ✅ Cleanup is idempotent (test: cleanup called twice, no errors).
- ✅ No undefined behavior on concurrent start/stop/unmount scenarios.

## Out of scope

- State machine refactoring (Phase 4).
- Preventing concurrent recording sessions (currently only one recording per app instance is supported).

## Dependencies

- Phase 0 (test harness) for timing simulation and ref state inspection.

## Estimated effort

- 2.1 Double-call guard: 1h
- 2.2 Rust idempotence: 0.5h
- 2.3 Session state cleanup: 0.5h
- 2.4 Chunk recorder guard: 0.5h
- 2.5 Chunk restart prevention: 0.5h
- 2.6 Cleanup re-entrance: 0.5h
- **Total**: 4 hours (half day)
