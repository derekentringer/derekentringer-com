/**
 * Pure helpers for the C.1.2 chunked-recording pipeline. Kept
 * isolated from the screen's recorder side-effects so they can
 * be unit-tested without mocking expo-audio / FormData.
 */

export interface ChunkEntry {
  index: number;
  text: string;
  status: "ok" | "error";
}

/**
 * iOS records 16kHz mono linear-PCM WAV; Android records AAC
 * inside an MP4 container (M4A is just .mp4 audio-only, no
 * native WAV PCM output format on Android). The server's
 * /ai/transcribe-chunk validator only allows the canonical IANA
 * type `audio/mp4` — it rejects `audio/m4a` even though Whisper
 * accepts both. The .m4a filename extension is fine; the MIME
 * is what the validator checks.
 */
export function chunkMimeForPlatform(
  platform: "ios" | "android" | "web" | "macos" | "windows",
): { mime: string; extension: string } {
  if (platform === "ios" || platform === "macos") {
    return { mime: "audio/wav", extension: "wav" };
  }
  return { mime: "audio/mp4", extension: "m4a" };
}

/**
 * Build a transcript entry from a successful chunk upload. Empty
 * or whitespace-only text returns `null` so the screen can skip
 * appending — Whisper occasionally returns blank for sub-second
 * silent chunks, and rendering an empty <Text> creates visual
 * dead space in the transcript list.
 */
export function buildChunkEntry(
  text: string,
  index: number,
): ChunkEntry | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  return { index, text: trimmed, status: "ok" };
}

/**
 * Sentinel entry for a chunk whose upload failed. We keep these
 * inline in the transcript so the user can see exactly where the
 * gap is, but they style as muted/italic. C.1.5 will add a
 * retry-from-saved-file path to fill these back in.
 */
export function buildErrorChunk(index: number): ChunkEntry {
  return { index, text: "[transcription failed]", status: "error" };
}
