import { loadConfig } from "../config.js";

const WHISPER_API_URL = "https://api.openai.com/v1/audio/transcriptions";

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
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Whisper API error (${response.status}): ${body}`);
  }

  const result = (await response.json()) as { text: string };
  return result.text;
}
