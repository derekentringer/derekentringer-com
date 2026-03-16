import { apiFetch } from "./client.ts";
import type { CompletionStyle, AudioMode } from "../hooks/useAiSettings.ts";
import type { Note, QASource } from "@derekentringer/ns-shared";

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

export interface AskQuestionEvent {
  sources?: QASource[];
  text?: string;
}

export async function* askQuestion(
  question: string,
  signal: AbortSignal,
): AsyncGenerator<AskQuestionEvent> {
  const response = await apiFetch("/ai/ask", {
    method: "POST",
    body: JSON.stringify({ question }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Q&A request failed: ${response.status}`);
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
          yield parsed as AskQuestionEvent;
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

const TRANSCRIBE_MAX_RETRIES = 2;
const TRANSCRIBE_RETRY_DELAY_MS = 2000;
const TRANSCRIBE_RETRYABLE_STATUSES = new Set([502, 503, 504]);

export async function transcribeAudio(
  audioBlob: Blob,
  mode: AudioMode,
): Promise<TranscribeResult> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= TRANSCRIBE_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, TRANSCRIBE_RETRY_DELAY_MS * attempt));
    }

    const formData = new FormData();
    formData.append("file", audioBlob, "recording.webm");
    formData.append("mode", mode);

    let response: Response;
    try {
      response = await apiFetch("/ai/transcribe", {
        method: "POST",
        body: formData,
      });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      continue;
    }

    if (response.ok) {
      return response.json();
    }

    let message = `Transcribe failed: ${response.status}`;
    try {
      const data = await response.json();
      if (data.message) message = data.message;
    } catch {
      // Use default message
    }

    if (!TRANSCRIBE_RETRYABLE_STATUSES.has(response.status)) {
      throw new Error(message);
    }

    lastError = new Error(message);
  }

  throw lastError ?? new Error("Transcription failed");
}
