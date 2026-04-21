# Phase 3 — Transcript Correctness: Ordering, Dedup, Whisper Semantics

**Status**: ✅ shipped (3.1–3.6)

## Goal

Ensure the final note's transcript is never corrupted, out-of-order, or missing chunks due to network stutter, retries, or out-of-order arrival.

## Why this matters

**Symptom**: User records 10 minutes, sees live transcript update smoothly, but final note has "chunk 3 text chunk 1 text chunk 2 text..." (chunks in wrong order) or missing some chunks.

**Root causes**:
- Chunks arrive out-of-order on the wire (network stutter).
- `getOrderedTranscript()` assumes all indices 0..maxIdx are present; missing indices cause gaps.
- Whisper retries on the same chunk might return different text; no dedup or version tracking.
- Live transcript save (PATCH `/notes/{id}`) can race with note creation.
- Final-audio transcription happens in parallel with live chunks; final result might truncate if it completes while chunks are still being appended.

## Items

### 3.1 — Chunk ordering verification and dedup ✅

**Status**: shipped — extracted the assembly logic into `packages/ns-desktop/src/lib/transcriptAssembly.ts::assembleTranscript(map)`, rewritten to sort `map.entries()` numerically and join the values. Missing indices naturally drop out (no `undefined` in the output), huge maps no longer risk a `Math.max(...keys)` stack overflow, and duplicate-index (last-write-wins) behavior is preserved via `Map.set()`. New unit tests in `src/lib/__tests__/transcriptAssembly.test.ts` cover out-of-order inserts, missing indices, 5000-entry stress, dedup, single-chunk, and whitespace hygiene.

**Location**: `packages/ns-desktop/src/lib/transcriptAssembly.ts` + `AudioRecorder.tsx:196-199` (thin wrapper)

**Problem**: `getOrderedTranscript()` iterates `0..maxIdx` and assumes every index has content. If index 5 is missing (failed Whisper), it produces `undefined`, which `.join(" ")` converts to "undefined text".

**Fix**:
- Change assembly: only include indices that exist in the map.
- Optionally warn on gaps: log "warning: chunk index 5 missing, skipping" at warning level.
- For dedup: if same `(sessionId, chunkIndex)` is sent twice (network retry on client side), Whisper API might return different text. Current behavior: Map.set() overwrites, so later response wins. Document this as intentional and acceptable (live transcript is best-effort, final transcript uses full audio).

```typescript
function getOrderedTranscript(): string {
  const map = transcriptChunksRef.current;
  if (map.size === 0) return "";
  const sorted = Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  return sorted.map(([_idx, text]) => text).join(" ");
}
```

**Done criteria**:
- Test: chunks 0, 1, 3 arrive (2 missing) → transcript is "text-0 text-1 text-3" (not "text-0 text-1 undefined text-3").
- Test: chunk 1 arrives twice with different text → second text overwrites, final transcript uses second.
- Warning logged on gap detection (optional).

**Estimated effort**: 1 hour

### 3.2 — Live transcript save race with note creation ✅

**Status**: shipped — `apiFetch` returns a `Response` without throwing on non-2xx, so the previous code updated `result.note.transcript = capturedTranscript` even when the server returned 500 (UI would then show a transcript that wasn't persisted). Both meeting-mode (line 368-378) and mic-mode (line 453-464) PATCH paths now mirror the transcript into the in-memory note only when `patchRes.ok`. New integration test `"PATCH failure still returns the note without mirroring transcript"` exercises a 500 response and asserts the note is still handed to `onNoteCreated` but without a `transcript` field.

**Location**: `packages/ns-desktop/src/components/AudioRecorder.tsx:367-382` (meeting) + `453-469` (mic)

**Problem**: Note is created, then PATCH is sent to save transcript. If PATCH fails, note exists with empty transcript. Worse: if PATCH succeeds but note wasn't yet fetched by UI, user sees old empty transcript briefly.

**Fix**:
- Document that live transcript save is best-effort and non-blocking.
- If PATCH fails, log error but don't fail the recording (note still exists).
- Optionally: pass `transcript` in the initial `createNote` call (server-side issue if transcript isn't accepted; check schema).
- On success: the returned `note` object is updated in-place (`result.note.transcript = capturedTranscript`), so UI sees the transcript immediately.

**Done criteria**:
- Test: PATCH `/notes/{id}` with transcript fails → note is still created and returned to UI.
- Test: PATCH succeeds → `result.note.transcript` is updated in memory before callback.
- UI never shows stale transcript (uses result.note, not re-fetched).

**Estimated effort**: 0.5 hours

### 3.3 — Whisper retries are transient-only, with proper backoff ✅

**Status**: shipped — added `429` to `RETRYABLE_STATUSES` in `whisperService.ts` with a comment explaining why (OpenAI rate-limit pushback on burst traffic is expected, not a permanent failure). Existing backoff logic (1s × attempt) handles the delay. Permanent errors (401/400/404/413/422) continue to propagate immediately. The Phase 0.6 reference test was flipped: `"does NOT retry on 429"` became `"retries on 429 up to MAX_RETRIES, then gives up"` + added a happy-path companion `"succeeds after a single 429 retry"`. Jitter was considered but skipped (the 1s-×-attempt spacing is already conservative for a single-user app).

**Location**: `packages/ns-api/src/services/whisperService.ts:8-21`

**Problem**: 
- Current backoff is `1000 * attempt`, which is correct (1s, 2s, 3s...).
- But if Whisper returns 429 (rate limited), it's not in `RETRYABLE_STATUSES`, so it fails immediately.
- No exponential jitter, so if multiple clients retry, they might hammer the API in sync.

**Fix**:
- Add 429 to `RETRYABLE_STATUSES`.
- Optional: add jitter (e.g., `backoff * (0.5 + Math.random())`).
- Verify that non-retryable errors (401, 400, 422) are surfaced to caller without retry.

**Done criteria**:
- Test: 429 retries up to 2 times.
- Test: 401 fails immediately (no retry).
- Test: backoff timing is correct (1s, 2s, etc.; maybe with jitter).

**Estimated effort**: 1 hour

### 3.4 — Session cleanup after note creation ✅

**Status**: shipped via the Phase 2.3 work. Mic mode's `onstop` handler calls `cleanup()` before `transcribeAudio`, which resets `transcriptChunksRef` / `sessionIdRef` / `chunkIndexRef`. Meeting mode's success path resets these same refs in its `finally` block after the note is created. Back-to-back recordings therefore start with an empty map, fresh session ID, and chunk index 0 — no stale-state carryover.

**Location**: `packages/ns-desktop/src/components/AudioRecorder.tsx:367-382` (meeting finally) + `452` (mic cleanup call)

**Problem**: Live transcript chunks are accumulated in `transcriptChunksRef.current`. After note creation and PATCH, refs are not cleared. If user starts a new recording immediately, old chunk data might leak into new session (unlikely due to unique sessionId, but possible in collision scenarios).

**Fix**: In both stop handlers (meeting + mic), after note creation completes, call `cleanup()` which clears `transcriptChunksRef` and `sessionIdRef`.

**Done criteria**:
- Test: record, stop, create note, immediately start new recording → no old chunks in new session's transcript.

**Estimated effort**: 0.5 hours

### 3.5 — Full-audio transcription is atomic ✅

**Status**: shipped — both `/ai/transcribe` and `/ai/structure-transcript` were missing `try/catch` around the final `createNote()` call, so a DB-side failure (connection loss, constraint violation) would fall through to Fastify's default 500 handler with an inconsistent response shape. Both routes now wrap `createNote` and return `502 { statusCode, error, message }` — the same shape used for Whisper / Claude failures. Earlier branches in both routes (Whisper fail → 502, empty transcript → 422, structuring fail → 502) were already correct and left alone.

**Location**: `packages/ns-api/src/routes/ai.ts:432-452` (structure-transcript) + `686-706` (transcribe)

**Problem**: `/ai/transcribe` is called after live chunks are captured. If Whisper fails during full-audio transcription, the note is never created. But live transcript is already displayed in UI (from earlier chunks). User might think note was created.

**Fix**: Ensure error handling is clear:
- If `transcribeAudioChunked` fails → return 502 + error message.
- If `structureTranscript` fails → return 502 + error message.
- If `createNote` fails → return 502 + error message.
- UI receives error; toast displayed; no note is created.

**Done criteria**:
- Test: Whisper fails on full audio → no note created, error returned to UI.
- UI shows error toast (not just silent failure).

**Estimated effort**: 1 hour

### 3.6 — Chunk transcription failure handling ✅

**Status**: shipped — verification + test. Both `startMicChunkRecorder.onstop` (line 235-243) and `sendNativeChunk` (line 253-270) already wrap `transcribeChunk` in try/catch with `console.warn` on failure, so a chunk-level rejection is non-fatal by design. Combined with Phase 3.1's `assembleTranscript`, missing chunks drop out of the live transcript cleanly. New integration test `"chunk transcription failure does not block final note creation"` rejects the first chunk with a simulated 429, completes the stop flow, and asserts the note is still created via the full-audio transcribe path with no `onError` fired.

**Location**: `packages/ns-desktop/src/components/AudioRecorder.tsx:235-243` (mic chunk onstop) + `253-270` (native chunk)

**Problem**: If `transcribeChunk` fails, error is logged but silently skipped (live transcript has a gap). User might not realize chunks weren't transcribed. On final transcribe, they see inconsistent transcript (live gaps + full audio).

**Fix**:
- Continue to skip (non-fatal).
- But surface a warning to user (optional toast: "Some chunks failed to transcribe; using full audio instead").
- Document this as expected behavior.

**Done criteria**:
- Test: chunk transcription fails → live transcript has gap, final note still created with full audio.
- UI gracefully handles empty chunk transcript.

**Estimated effort**: 0.5 hours

## Edge cases covered

- Chunks arrive out-of-order (network stutter).
- Some chunks missing (failed Whisper).
- Same chunk uploaded twice (duplicate request).
- Live transcript save fails after note creation.
- Whisper rate-limited (429).
- Full audio transcription fails.
- Chunk transcription fails for one chunk, other chunks succeed.

## Done criteria

- ✅ Ordered transcript never has gaps or "undefined" entries (test: out-of-order + missing chunks).
- ✅ Chunk dedup is handled (later response wins; documented as acceptable for live transcript).
- ✅ Live transcript save race is handled (PATCH failure is non-fatal).
- ✅ Whisper retries cover 429 (rate limit).
- ✅ Session state is cleared after note creation.
- ✅ Full-audio transcription failures don't create partial notes.
- ✅ Chunk transcription failures don't silently corrupt final transcript.

## Out of scope

- Implementing per-chunk error recovery (e.g., auto-retry failed chunks).
- Transcript versioning or change history.
- User-facing "missing chunks" warning (Phase 6).

## Dependencies

- Phase 0 (test harness) for Whisper retry simulation, out-of-order chunk arrival.
- Phase 1–2 (resource + race fixes) for stable state machine.

## Estimated effort

- 3.1 Chunk ordering and dedup: 1h
- 3.2 Live transcript save race: 0.5h
- 3.3 Whisper retries (429, backoff): 1h
- 3.4 Session cleanup: 0.5h
- 3.5 Full-audio atomicity: 1h
- 3.6 Chunk failure handling: 0.5h
- **Total**: 4.5 hours (half day)
