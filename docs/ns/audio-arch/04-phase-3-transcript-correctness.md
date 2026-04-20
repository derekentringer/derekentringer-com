# Phase 3 — Transcript Correctness: Ordering, Dedup, Whisper Semantics

**Status**: pending

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

### 3.1 — Chunk ordering verification and dedup

**Location**: `packages/ns-desktop/src/components/AudioRecorder.tsx:156-166` (getOrderedTranscript) + transcribeChunk result handler

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

### 3.2 — Live transcript save race with note creation

**Location**: `packages/ns-desktop/src/components/AudioRecorder.tsx:324-339` (meeting mode) + `393-405` (mic mode)

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

### 3.3 — Whisper retries are transient-only, with proper backoff

**Location**: `packages/ns-api/src/services/whisperService.ts:14-52` (single-chunk retry) + `55-91` (chunked retry)

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

### 3.4 — Session cleanup after note creation

**Location**: `packages/ns-desktop/src/components/AudioRecorder.tsx:256-280` + `379-415`

**Problem**: Live transcript chunks are accumulated in `transcriptChunksRef.current`. After note creation and PATCH, refs are not cleared. If user starts a new recording immediately, old chunk data might leak into new session (unlikely due to unique sessionId, but possible in collision scenarios).

**Fix**: In both stop handlers (meeting + mic), after note creation completes, call `cleanup()` which clears `transcriptChunksRef` and `sessionIdRef`.

**Done criteria**:
- Test: record, stop, create note, immediately start new recording → no old chunks in new session's transcript.

**Estimated effort**: 0.5 hours

### 3.5 — Full-audio transcription is atomic

**Location**: `packages/ns-api/src/routes/ai.ts:590-703`

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

### 3.6 — Chunk transcription failure handling

**Location**: `packages/ns-desktop/src/components/AudioRecorder.tsx:200-208` (meeting) + `379-415` (mic)

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
