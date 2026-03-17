import { loadConfig } from "../config.js";
import { splitAudioIfNeeded } from "./audioChunker.js";

const WHISPER_API_URL = "https://api.openai.com/v1/audio/transcriptions";
const WHISPER_TIMEOUT_MS = 300_000; // 5 minutes per chunk
const MAX_PARALLEL_CHUNKS = 3;

export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string,
): Promise<string> {
  const config = loadConfig();

  const formData = new FormData();
  formData.append("file", new Blob([new Uint8Array(audioBuffer)]), filename);
  formData.append("model", "whisper-1");

  const response = await fetch(WHISPER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
    },
    body: formData,
    signal: AbortSignal.timeout(WHISPER_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Whisper API error (${response.status}): ${body}`);
  }

  const result = (await response.json()) as { text: string };
  return result.text;
}

export async function transcribeAudioChunked(
  audioBuffer: Buffer,
  filename: string,
  log?: { info: (obj: Record<string, unknown>, msg: string) => void },
): Promise<string> {
  log?.info({ fileSize: audioBuffer.length, filename }, "Starting audio chunking");
  const chunks = await splitAudioIfNeeded(audioBuffer, filename);
  log?.info({ chunkCount: chunks.length, chunkSizes: chunks.map((c) => c.length) }, "Audio chunked");

  if (chunks.length === 1) {
    log?.info({}, "Transcribing single chunk");
    const text = await transcribeAudio(chunks[0], filename);
    log?.info({ transcriptLength: text.length }, "Transcription complete");
    return text;
  }

  // Transcribe chunks in parallel (batched to avoid overwhelming the API)
  const transcripts: string[] = new Array(chunks.length);

  for (let batchStart = 0; batchStart < chunks.length; batchStart += MAX_PARALLEL_CHUNKS) {
    const batchEnd = Math.min(batchStart + MAX_PARALLEL_CHUNKS, chunks.length);
    const batch = chunks.slice(batchStart, batchEnd);
    log?.info({ batch: `${batchStart + 1}-${batchEnd} of ${chunks.length}` }, "Transcribing chunk batch");

    const results = await Promise.all(
      batch.map((chunk) => transcribeAudio(chunk, filename)),
    );

    for (let i = 0; i < results.length; i++) {
      transcripts[batchStart + i] = results[i];
    }
  }

  const fullTranscript = transcripts.join(" ");
  log?.info({ transcriptLength: fullTranscript.length }, "All chunks transcribed");
  return fullTranscript;
}
