import { apiFetch } from "./client.ts";
import type { CompletionStyle, AudioMode } from "../hooks/useAiSettings.ts";
import type { Note } from "@derekentringer/ns-shared";

export type RewriteAction =
  | "rewrite"
  | "concise"
  | "fix-grammar"
  | "to-list"
  | "expand"
  | "summarize";

export async function* fetchCompletion(
  context: string,
  signal: AbortSignal,
  style?: CompletionStyle,
): AsyncGenerator<string> {
  const response = await apiFetch("/ai/complete", {
    method: "POST",
    body: JSON.stringify({ context, ...(style && { style }) }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`AI completion failed: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const data = trimmed.slice(6);
        if (data === "[DONE]") return;

        try {
          const parsed = JSON.parse(data);
          if (parsed.text) {
            yield parsed.text;
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function summarizeNote(noteId: string): Promise<string> {
  const response = await apiFetch("/ai/summarize", {
    method: "POST",
    body: JSON.stringify({ noteId }),
  });

  if (!response.ok) {
    throw new Error(`Summarize failed: ${response.status}`);
  }

  const data = await response.json();
  return data.summary;
}

export async function suggestTags(noteId: string): Promise<string[]> {
  const response = await apiFetch("/ai/tags", {
    method: "POST",
    body: JSON.stringify({ noteId }),
  });

  if (!response.ok) {
    throw new Error(`Tag suggestion failed: ${response.status}`);
  }

  const data = await response.json();
  return data.tags;
}

export async function rewriteText(
  text: string,
  action: RewriteAction,
): Promise<string> {
  const response = await apiFetch("/ai/rewrite", {
    method: "POST",
    body: JSON.stringify({ text, action }),
  });

  if (!response.ok) {
    throw new Error(`Rewrite failed: ${response.status}`);
  }

  const data = await response.json();
  return data.text;
}

export async function requestEmbedding(text: string): Promise<number[]> {
  const response = await apiFetch("/ai/embeddings/generate", {
    method: "POST",
    body: JSON.stringify({ text, inputType: "document" }),
  });

  if (!response.ok) {
    throw new Error(`Embedding failed: ${response.status}`);
  }

  const data = await response.json();
  return data.embedding;
}

export async function requestQueryEmbedding(text: string): Promise<number[]> {
  const response = await apiFetch("/ai/embeddings/generate", {
    method: "POST",
    body: JSON.stringify({ text, inputType: "query" }),
  });

  if (!response.ok) {
    throw new Error(`Query embedding failed: ${response.status}`);
  }

  const data = await response.json();
  return data.embedding;
}

export interface TranscribeResult {
  title: string;
  content: string;
  tags: string[];
  note: Note;
}

export async function transcribeAudio(
  audioBlob: Blob,
  mode: AudioMode,
): Promise<TranscribeResult> {
  const formData = new FormData();
  formData.append("file", audioBlob, "recording.webm");
  formData.append("mode", mode);

  const response = await apiFetch("/ai/transcribe", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    let message = `Transcribe failed: ${response.status}`;
    try {
      const data = await response.json();
      if (data.message) message = data.message;
    } catch {
      // Use default message
    }
    throw new Error(message);
  }

  return response.json();
}
