// Assembles the live-transcript string from the per-chunk Map that
// AudioRecorder populates as `transcribeChunk` responses return.
//
// Chunks can arrive out of order (network stutter, Whisper latency
// variance) and some chunks may never arrive at all (non-retryable
// Whisper failure). The assembled transcript must be:
//
//   - Stable in index order — chunk 1 always precedes chunk 2 even
//     if chunk 2's Whisper response came back first.
//   - Free of "undefined" entries when indices are missing — the
//     older `for (i = 0; i <= maxIdx)` approach produced these when
//     a chunk failed mid-session.
//   - Safe for arbitrarily large indices — using `Math.max(...keys)`
//     with a spread over a Map with thousands of entries risks a
//     stack overflow; sorting entries directly avoids that.
//
// Duplicate indices (same (sessionId, chunkIndex) uploaded twice,
// which can happen on client-side retry) are resolved last-write-wins
// by the Map itself before this function sees it — callers should
// rely on `Map.set()` to overwrite on duplicate.
export function assembleTranscript(map: ReadonlyMap<number, string>): string {
  if (map.size === 0) return "";
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, text]) => text)
    .join(" ");
}
