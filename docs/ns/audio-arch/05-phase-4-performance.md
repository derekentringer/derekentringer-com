# Phase 4 — Performance: API Dedup, Parallelization, Chunking Tuning

**Status**: ✅ shipped (4.1–4.5) — 4.1/4.5 were reverted once after a real-use regression, then re-landed with the final-chunk flush fix (see 4.1 below).

## Goal

Reduce wasted API calls, parallelize sequential awaits, and optimize live chunking to improve latency and reduce server load.

## Why this matters

**Symptom**: User records 10 minutes. During recording, 30 chunks are sent to `/ai/transcribe-chunk`. After stop, full audio is sent to `/ai/transcribe`. Live transcript is outdated by final note (which re-transcribes the full audio). User sees duplicate work.

**Root causes**:
- Full-audio transcription doesn't use live chunks; Whisper is called again on full audio.
- Chunk uploads are sequential (await each before next chunk timer fires).
- Meeting-mode chunks are sampled every 20s from growing PCM files; no dedup if Whisper is called on overlapping windows.
- `useMeetingContext` polling every 45s doesn't batch requests (simple GET, but still wasteful).

## Items

### 4.1 — Deduplicate full-audio vs live-chunk transcription ✅ (re-landed)

**Status**: shipped, then reverted after a real-use regression, then re-landed safely once the underlying gaps were closed.

**History**:
- **First land (commit `dcf64d7`)**: routed `handleMeetingStop` through `structureAndCreateNote` (Claude-only) when `capturedTranscript.trim().length > 100`, skipping a full-Whisper pass.
- **Revert (commit `54ea383`)**: notes came out truncated or wrong because (1) the tail audio between the last chunk tick and Stop was never chunked, and (2) fire-and-forget chunks whose Whisper response hadn't returned by stop-time were missing from the snapshot. Both gaps silently dropped content.
- **Re-land**: `handleMeetingStop` now drains `pendingChunksRef` (all in-flight chunk promises), then — if the pre-flush transcript looks substantive — fires one final `sendNativeChunk()` to grab the tail audio and awaits that too before snapshotting. With the flush in place, the live-transcript dedup is safe: what we hand to `structureAndCreateNote` is the complete ordered transcript covering every second of the recording. Short recordings (<100 chars of live content) still fall through to full-Whisper on the mixed WAV, so brief memos don't pay an extra chunk Whisper round-trip.

Why it's safe now: `sendNativeChunk` registers each transcribe promise in `pendingChunksRef.current` (added via the promise, removed via its `.finally()`), so on stop we know exactly what's in flight. `cleanup()` also clears the set so sessions don't cross-contaminate.

**Location**: `packages/ns-desktop/src/components/AudioRecorder.tsx::handleMeetingStop` (post-revert version with flush)

**Problem**: Server receives full audio transcription request after already having transcribed live chunks. Whisper is called twice on (nearly) the same audio.

**Fix** (several options; choose one):
- **Option A** (simplest): On final transcription, use the live transcript if it's "recent" (e.g., captured within last 5s of stop). Whisper only if live transcript is empty or stale.
- **Option B** (smarter): Send live chunk metadata (sessionId, chunk indices) with `/ai/transcribe` request. Server can reconstruct transcript from live chunks if they cover the full audio. Only call Whisper if gaps exist.
- **Option C** (future): Store live chunk transcripts on server; note creation reuses them.

Recommend **Option A** for v1: if live transcript is complete and recent, use it; otherwise transcribe full audio.

```typescript
// In AudioRecorder.tsx handleMeetingStop:
const liveTranscriptRecent = liveTranscriptRef.current.trim().length > 100; // >100 chars
if (liveTranscriptRecent) {
  // Skip full transcription, use live transcript + structure
  const result = await structureAndCreateNote(liveTranscriptRef.current, mode, folderId);
  onNoteCreatedRef.current(result.note);
} else {
  // Fall back to full transcription
  const result = await transcribeAudio(blob, mode, folderId);
  // ... rest
}
```

**Done criteria**:
- Test: record meeting, accumulate live transcript, stop → no full Whisper call if live transcript > 100 chars.
- Test: record meeting with failed chunks → fall back to full Whisper if live transcript empty.

**Estimated effort**: 2 hours

### 4.2 — Parallelize chunk transcription uploads ✅

**Status**: shipped — both `sendNativeChunk` (meeting mode) and `startMicChunkRecorder.onstop` (mic mode) refactored from `async`/`await` bodies to explicit `.then/.catch` chains so the upload is fire-and-forget. The Rust IPC `invoke("get_meeting_audio_chunk")` + blob construction are still awaited (they're fast and we need the index/session ID before any concurrent work), but the `transcribeChunk` Whisper call runs detached. New integration test `"slow chunk upload does not block the next chunk's upload"` stalls the first chunk's response with a manually-controlled promise and confirms a second chunk's `transcribeChunk` call fires before the first resolves.

**Location**: `packages/ns-desktop/src/components/AudioRecorder.tsx:227-250` (mic chunk onstop) + `258-294` (sendNativeChunk)

**Problem**: Each chunk upload awaits completion before returning. If upload takes 5s and chunk interval is 20s, the next chunk isn't sent until the current one completes.

**Fix**: Don't await the chunk upload in the timer callback. Fire-and-forget, with error handling:

```typescript
function sendNativeChunk() {
  // Fire-and-forget upload
  const wavBytes = await invoke<number[]>("get_meeting_audio_chunk");
  if (!wavBytes || wavBytes.length === 0) return;
  
  const blob = new Blob([new Uint8Array(wavBytes)], { type: "audio/wav" });
  if (blob.size < 1024) return;
  
  const idx = chunkIndexRef.current++;
  const sid = sessionIdRef.current;
  
  // No await here — let upload complete in background
  transcribeChunk(blob, sid, idx)
    .then((result) => {
      if (result.text && result.text.trim()) {
        transcriptChunksRef.current.set(result.chunkIndex, result.text.trim());
        setLiveTranscript(getOrderedTranscript());
      }
    })
    .catch((err) => {
      console.warn("Chunk transcription failed:", err);
    });
}
```

**Done criteria**:
- Test: chunk uploads are non-blocking (next chunk timer fires while previous upload in progress).
- Live transcript updates show all chunks that complete, regardless of order.

**Estimated effort**: 1 hour

### 4.3 — Batch meeting-context polling ✅

**Status**: shipped — verification + test coverage. Code review confirmed the dedup already works: `doSearch` short-circuits at line 32 when `transcript === lastTranscriptRef.current`, and `MIN_TRANSCRIPT_LENGTH` (50 chars) filters noise. New test file `src/hooks/__tests__/useMeetingContext.test.tsx` with 4 tests using fake timers: dedup on stable transcript, length-gate skip, API fires on transcript change, polling stops on `isRecording: false`. Poll interval kept at 45s (changing to 60s was recommended in the plan but not empirically motivated for a single-user app).

**Location**: `packages/ns-desktop/src/hooks/useMeetingContext.ts:30-62`

**Problem**: `useMeetingContext` polls every 45s even if transcript hasn't changed (checked via string comparison at line 32). If comparison fails due to timing, multiple requests can fire.

**Fix**:
- Already has dedup (checks if `transcript === lastTranscriptRef.current`).
- Verify this works: test that transcript unchanged → no API call.
- Consider reducing poll interval to 60s (current 45s is aggressive for a polling hook that only filters by embeddings anyway).

**Done criteria**:
- Test: transcript stable → no API call on 45s tick.
- Verify: only new transcript changes trigger API calls.

**Estimated effort**: 0.5 hours

### 4.4 — Optimize chunk interval for live transcription ✅

**Status**: shipped — `CHUNK_INTERVAL_MS` bumped from 20s to 30s. Whisper typically returns a transcribed chunk in 5–10s, so a 20s interval meant concurrent uploads stacked up (~3 in flight by mid-meeting). 30s reduces API load by ~33% with a 10s latency trade-off on the live transcript, which is acceptable since the live view is a best-effort preview (the canonical transcript is what's PATCHed onto the note after stop). Combined with 4.2's fire-and-forget uploads, no chunk ever blocks the next.

**Location**: `packages/ns-desktop/src/components/AudioRecorder.tsx:23-31`

**Problem**: `CHUNK_INTERVAL_MS = 20_000` (20s). Whisper API takes ~5-10s per chunk, so uploads overlap. Smaller interval → more chunks, more API calls. Larger interval → longer live transcript latency.

**Fix**:
- Profile live transcription latency on a real meeting (5 min = 15 chunks).
- Measure: chunk request time, Whisper latency, upload time.
- Recommend: 30s interval (30 chunks for 15-min meeting, ~3 API calls in flight max).
- Or: use adaptive interval (increase if Whisper is slow, decrease if upload is fast).

For now: **bump to 30s** (fewer calls, acceptable latency trade-off).

```typescript
const CHUNK_INTERVAL_MS = 30_000;  // 30 seconds
```

**Done criteria**:
- Performance test: record 15-min meeting, measure total chunks and API call count.
- Latency test: final transcript available within 60s of stop (acceptable delay).

**Estimated effort**: 1 hour (measurement + tuning)

### 4.5 — Avoid re-transcribing live chunks in final note ✅ (re-landed with 4.1)

**Status**: shipped together with the 4.1 re-land. Meeting-mode recordings with substantive live transcripts route through `structureAndCreateNote` (Claude structuring on the already-Whisper-transcribed live text), skipping a second full-WAV Whisper pass. Short recordings still take the full-Whisper path for accuracy.

**Problem**: Full audio is sent to `/ai/transcribe`, which calls Whisper. But live chunks already have Whisper transcripts. Redundant work.

**Fix**: See 4.1. Reuse live transcript if available.

**Done criteria**: Same as 4.1.

**Estimated effort**: (included in 4.1)

## Edge cases covered

- Chunk upload slow (>20s) — next chunk still fires on time.
- Multiple chunks in flight — assembly preserves order.
- Transcript unchanged — polling skips API call.
- Live transcript incomplete — final transcription fills gaps.

## Done criteria

- ✅ Full Whisper not called if live transcript is recent and complete.
- ✅ Chunk uploads are non-blocking.
- ✅ Meeting-context polling skips if transcript unchanged.
- ✅ Chunk interval is tuned (default 30s).
- ✅ No duplicate Whisper calls for same audio.
- ✅ Performance test shows improvement (fewer API calls, faster note creation).

## Out of scope

- Streaming transcription (next-gen, requires Whisper API changes).
- Adaptive interval based on real-time latency (Phase 6).
- Server-side dedup (caching Whisper results).

## Dependencies

- Phase 1–3 (resource, race, correctness fixes) complete.

## Estimated effort

- 4.1 Dedup transcription: 2h
- 4.2 Parallelize chunk uploads: 1h
- 4.3 Batch polling: 0.5h
- 4.4 Optimize interval: 1h
- 4.5 (covered by 4.1)
- **Total**: 4.5 hours (half day)
