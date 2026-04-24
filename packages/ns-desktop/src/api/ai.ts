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

export interface NoteCard {
  id: string;
  title: string;
  folder?: string;
  tags?: string[];
  updatedAt?: string;
}

export interface AskQuestionEvent {
  sources?: QASource[];
  text?: string;
  error?: string;
  tool?: { name: string; description: string };
  noteCards?: NoteCard[];
  // Phase C: a deferred destructive tool call awaiting user approval.
  confirmation?: PendingConfirmation;
}

export type ConfirmationPreview =
  | { type: "delete_note"; title: string; folder?: string }
  | { type: "update_note_content"; title: string; oldContent: string; newContent: string; oldLen: number; newLen: number }
  | { type: "delete_folder"; folderName: string; affectedCount: number }
  | { type: "rename_folder"; oldName: string; newName: string }
  | { type: "rename_tag"; oldName: string; newName: string; affectedCount: number };

export interface PendingConfirmation {
  id: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  preview: ConfirmationPreview;
}

export interface ConfirmToolResult {
  text: string;
  noteCards?: NoteCard[];
}

/** Commit a deferred destructive tool call after the user clicks Apply. */
export async function confirmTool(
  toolName: string,
  toolInput: Record<string, unknown>,
): Promise<ConfirmToolResult> {
  const response = await apiFetch("/ai/tools/confirm", {
    method: "POST",
    body: JSON.stringify({ toolName, toolInput }),
  });
  if (!response.ok) {
    throw new Error(`Confirm failed: ${response.status}`);
  }
  return (await response.json()) as ConfirmToolResult;
}

/** Phase C.5: per-tool auto-approve sent to the backend so destructive
 *  tools can skip the confirmation gate when the user has opted in. */
export interface AutoApproveFlags {
  deleteNote?: boolean;
  deleteFolder?: boolean;
  updateNoteContent?: boolean;
  renameFolder?: boolean;
  renameTag?: boolean;
}

export async function* askQuestion(
  question: string,
  signal: AbortSignal,
  transcript?: string,
  activeNote?: { id: string; title: string; content: string },
  history?: Array<{ role: "user" | "assistant"; content: string }>,
  autoApprove?: AutoApproveFlags,
): AsyncGenerator<AskQuestionEvent> {
  const body: {
    question: string;
    transcript?: string;
    activeNote?: { id: string; title: string; content: string };
    history?: Array<{ role: "user" | "assistant"; content: string }>;
    autoApprove?: AutoApproveFlags;
  } = { question };
  if (transcript && transcript.trim().length > 0) {
    body.transcript = transcript;
  }
  if (activeNote) {
    body.activeNote = activeNote;
  }
  if (history && history.length > 0) {
    body.history = history;
  }
  if (autoApprove && Object.values(autoApprove).some(Boolean)) {
    body.autoApprove = autoApprove;
  }
  const response = await apiFetch("/ai/ask", {
    method: "POST",
    body: JSON.stringify(body),
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

export interface TranscribeChunkResult {
  sessionId: string;
  chunkIndex: number;
  text: string;
}

export async function transcribeChunk(
  audioBlob: Blob,
  sessionId: string,
  chunkIndex: number,
): Promise<TranscribeChunkResult> {
  const ext = audioBlob.type.includes("wav") ? "wav"
    : audioBlob.type.includes("mp4") ? "mp4"
    : audioBlob.type.includes("ogg") ? "ogg"
    : "webm";
  const formData = new FormData();
  formData.append("file", audioBlob, `chunk-${chunkIndex}.${ext}`);
  formData.append("sessionId", sessionId);
  formData.append("chunkIndex", String(chunkIndex));

  const response = await apiFetch("/ai/transcribe-chunk", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    let message = `Chunk transcription failed: ${response.status}`;
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

// ─── Chat History ────────────────────────────────────────

export interface ChatMessageData {
  id: string;
  role: string;
  content: string;
  sources?: QASource[] | null;
  meetingData?: Record<string, unknown> | null;
  noteCards?: NoteCard[] | null;
  /** Phase E follow-up: only terminal statuses (applied/discarded/failed)
   *  are persisted — in-flight pending/applying cards are dropped on save. */
  confirmation?: Record<string, unknown> | null;
  createdAt: string;
}

export async function fetchChatHistory(): Promise<ChatMessageData[]> {
  const response = await apiFetch("/ai/chat-history");
  if (!response.ok) return [];
  const data = await response.json();
  return data.messages ?? [];
}

export async function saveChatMessages(
  messages: { role: string; content: string; sources?: unknown; meetingData?: unknown; noteCards?: unknown; confirmation?: unknown }[],
): Promise<void> {
  await apiFetch("/ai/chat-history", {
    method: "POST",
    body: JSON.stringify({ messages }),
  });
}

export async function clearServerChatHistory(): Promise<void> {
  await apiFetch("/ai/chat-history", { method: "DELETE" });
}

/** Structure an already-transcribed text and create a note (skip audio transcription) */
export async function structureAndCreateNote(
  transcript: string,
  mode: AudioMode,
  folderId?: string,
): Promise<TranscribeResult> {
  const response = await apiFetch("/ai/structure-transcript", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript, mode, folderId }),
  });

  if (!response.ok) {
    let message = `Structure failed: ${response.status}`;
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

const TRANSCRIBE_MAX_RETRIES = 2;
const TRANSCRIBE_RETRY_DELAY_MS = 2000;
const TRANSCRIBE_RETRYABLE_STATUSES = new Set([502, 503, 504]);

export async function transcribeAudio(
  audioBlob: Blob,
  mode: AudioMode,
  folderId?: string,
): Promise<TranscribeResult> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= TRANSCRIBE_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, TRANSCRIBE_RETRY_DELAY_MS * attempt));
    }

    const ext = audioBlob.type.includes("wav") ? "wav"
      : audioBlob.type.includes("mp4") ? "mp4"
      : audioBlob.type.includes("ogg") ? "ogg"
      : "webm";
    const formData = new FormData();
    formData.append("file", audioBlob, `recording.${ext}`);
    formData.append("mode", mode);
    if (folderId) formData.append("folderId", folderId);

    const response = await apiFetch("/ai/transcribe", {
      method: "POST",
      body: formData,
    });

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

// --- Meeting Context ---

export interface MeetingContextNote {
  id: string;
  title: string;
  snippet: string;
  score: number;
  updatedAt: string;
}

export interface MeetingContextResult {
  relevantNotes: MeetingContextNote[];
}

export async function fetchMeetingContext(
  transcript: string,
  excludeNoteIds?: string[],
  threshold?: number,
): Promise<MeetingContextResult> {
  const response = await apiFetch("/ai/meeting-context", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript, excludeNoteIds, threshold }),
  });

  if (!response.ok) {
    let message = `Meeting context failed: ${response.status}`;
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
