import { apiFetch } from "./client.ts";

export async function* fetchCompletion(
  context: string,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const response = await apiFetch("/ai/complete", {
    method: "POST",
    body: JSON.stringify({ context }),
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
