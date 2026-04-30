// Phase A.1 (mobile parity): AI chat API client.
//
// Mirrors `packages/ns-desktop/src/api/ai.ts` and
// `packages/ns-web/src/api/ai.ts` so the mobile chat panel can speak
// the same protocol — same `AskQuestionEvent` shape, same
// `confirmTool`, same `fetchChatHistory` / `replaceChatMessages` /
// `clearServerChatHistory`. Future sub-phases (A.2: tools/cards,
// A.3: slash commands, A.4: confirmations, A.5: persistence) will
// layer on top without changing the wire shape.
//
// Streaming: the desktop / web clients use `fetch` + `body.getReader()`
// for SSE. React Native's fetch doesn't support streaming bodies, so
// mobile uses `react-native-sse` (XMLHttpRequest under the hood with
// progress events). It supports POST + custom headers.
import EventSource from "react-native-sse";
import type { QASource } from "@derekentringer/ns-shared";
import api, { tokenManager, API_BASE_URL } from "../services/api";

// ─── Types — kept verbatim from desktop/web for protocol parity ───

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
  confirmation?: PendingConfirmation;
  openNote?: { id: string; title: string };
}

export type ConfirmationPreview =
  | { type: "delete_note"; title: string; folder?: string }
  | { type: "update_note_content"; title: string; oldContent: string; newContent: string; oldLen: number; newLen: number }
  | { type: "rename_note"; oldTitle: string; newTitle: string; folder?: string }
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

export interface AutoApproveFlags {
  deleteNote?: boolean;
  deleteFolder?: boolean;
  updateNoteContent?: boolean;
  renameNote?: boolean;
  renameFolder?: boolean;
  renameTag?: boolean;
}

export interface ChatMessageData {
  role: "user" | "assistant" | "meeting-summary";
  content: string;
  sources?: QASource[];
  noteCards?: NoteCard[];
  meetingData?: unknown;
  confirmation?: unknown;
  createdAt?: string;
}

// ─── askQuestion (streaming) ──────────────────────────────────────

const SSE_BASE_URL = __DEV__
  ? "http://localhost:3004"
  : "https://ns-api.derekentringer.com";

/** Stream the assistant's reply for `question`. Yields each parsed
 *  SSE event in order. Caller iterates with `for await`. Pass an
 *  AbortSignal to cancel mid-stream — the underlying EventSource is
 *  closed when the signal aborts. */
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
  if (transcript && transcript.trim().length > 0) body.transcript = transcript;
  if (activeNote) body.activeNote = activeNote;
  if (history && history.length > 0) body.history = history;
  if (autoApprove && Object.values(autoApprove).some(Boolean)) body.autoApprove = autoApprove;

  const accessToken = tokenManager.getAccessToken();
  if (!accessToken) throw new Error("Not authenticated");

  // Channel for the polyfill's onmessage / onerror / onclose →
  // async iterator. We push events into a queue and the generator
  // pulls them off via a Promise resolver. When the stream ends or
  // errors, we resolve the pending wait with `done`.
  type Envelope =
    | { kind: "event"; ev: AskQuestionEvent }
    | { kind: "done" }
    | { kind: "error"; err: Error };

  const queue: Envelope[] = [];
  let pendingResolve: ((env: Envelope) => void) | null = null;
  const push = (env: Envelope) => {
    if (pendingResolve) {
      const r = pendingResolve;
      pendingResolve = null;
      r(env);
    } else {
      queue.push(env);
    }
  };

  const es = new EventSource(`${SSE_BASE_URL}/ai/ask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "X-Client-Type": "mobile",
    },
    body: JSON.stringify(body),
    pollingInterval: 0, // disable auto-reconnect; this is a one-shot stream
  });

  es.addEventListener("message", (event) => {
    const data = (event as { data?: string }).data;
    if (!data) return;
    if (data === "[DONE]") {
      push({ kind: "done" });
      return;
    }
    try {
      const parsed = JSON.parse(data) as AskQuestionEvent;
      push({ kind: "event", ev: parsed });
    } catch {
      // Malformed line — skip silently, same as desktop/web.
    }
  });

  es.addEventListener("error", (event) => {
    const err = (event as { message?: string }).message ?? "stream error";
    push({ kind: "error", err: new Error(err) });
  });

  es.addEventListener("close", () => {
    push({ kind: "done" });
  });

  const onAbort = () => {
    es.close();
    push({ kind: "done" });
  };
  signal.addEventListener("abort", onAbort);

  try {
    while (true) {
      const env = queue.shift() ?? (await new Promise<Envelope>((resolve) => {
        pendingResolve = resolve;
      }));
      if (env.kind === "done") return;
      if (env.kind === "error") throw env.err;
      yield env.ev;
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    es.close();
  }
}

// ─── confirmTool ──────────────────────────────────────────────────

export async function confirmTool(
  toolName: string,
  toolInput: Record<string, unknown>,
): Promise<ConfirmToolResult> {
  const response = await api.post<ConfirmToolResult>("/ai/tools/confirm", {
    toolName,
    toolInput,
  });
  return response.data;
}

// ─── Chat history ─────────────────────────────────────────────────

export async function fetchChatHistory(): Promise<ChatMessageData[]> {
  const response = await api.get<{ messages: ChatMessageData[] }>("/ai/chat-history");
  return response.data.messages ?? [];
}

export async function replaceChatMessages(
  messages: ChatMessageData[],
): Promise<void> {
  await api.put("/ai/chat-history", { messages });
}

export async function clearServerChatHistory(): Promise<void> {
  await api.delete("/ai/chat-history");
}

// ─── AI single-note helpers (Phase A.6) ──────────────────────────

export async function summarizeNote(noteId: string): Promise<string> {
  const response = await api.post<{ summary: string }>("/ai/summarize", { noteId });
  return response.data.summary;
}

export async function suggestTags(noteId: string): Promise<string[]> {
  const response = await api.post<{ tags: string[] }>("/ai/tags", { noteId });
  return response.data.tags ?? [];
}

// ─── Audio transcription + structuring (Phase C.1) ─────────────────

import * as FileSystem from "expo-file-system/legacy";

/** Mode mirrors desktop's `audioMode` field: dictates how the AI
 *  structures the transcript on save. Mobile surfaces all four
 *  modes — meeting mode produces an action-items + attendees +
 *  decisions template even though the phone can only capture mic
 *  (not system audio), which is still useful when you're holding
 *  the device in a room or on speakerphone. */
export type AudioMode = "meeting" | "lecture" | "memo" | "verbatim";

export interface TranscribeChunkResult {
  sessionId: string;
  chunkIndex: number;
  text: string;
}

export interface TranscribeResult {
  title: string;
  content: string;
  tags: string[];
}

/**
 * Upload an audio file via `FileSystem.uploadAsync` (multipart,
 * native streaming). RN's JS-side `FormData` polyfill chokes on
 * multi-megabyte files — the request leaves axios with a
 * "Network Error" before it reaches the server. expo-file-system's
 * native uploader streams the file directly from disk via a
 * platform multipart implementation, which handles long
 * recordings without choking.
 *
 * Caller passes the auth header explicitly because we bypass the
 * axios interceptor stack here.
 */
async function uploadAudioMultipart<T>(
  endpoint: string,
  fileUri: string,
  fileName: string,
  mimeType: string,
  parameters: Record<string, string>,
): Promise<T> {
  const accessToken = tokenManager.getAccessToken();
  if (!accessToken) {
    throw new Error("Not authenticated");
  }
  const result = await FileSystem.uploadAsync(
    `${API_BASE_URL}${endpoint}`,
    fileUri,
    {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: "file",
      mimeType,
      parameters,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Client-Type": "mobile",
      },
      // `httpMethod`'s default is POST; explicit for clarity.
      // Native upload library passes the file's actual filename
      // through to the multipart `filename=` directive.
    },
  );
  if (result.status < 200 || result.status >= 300) {
    let serverMessage: string | undefined;
    try {
      const parsed = JSON.parse(result.body) as { message?: string };
      serverMessage = parsed.message;
    } catch {
      /* body wasn't JSON */
    }
    const err = new Error(
      serverMessage ?? `Upload failed: HTTP ${result.status}`,
    ) as Error & {
      response?: { status: number; data?: { message?: string } };
      code?: string;
    };
    err.response = {
      status: result.status,
      data: serverMessage ? { message: serverMessage } : undefined,
    };
    throw err;
  }
  // The body is JSON for both /ai/transcribe-chunk and
  // /ai/transcribe — server returns `{ sessionId, chunkIndex, text }`
  // or `{ title, content, tags, ... }`.
  return JSON.parse(result.body) as T;
}

/** Send one slice to the server's chunk endpoint. Caller is
 *  responsible for tracking `sessionId` (stable across the
 *  recording) and incrementing `chunkIndex`. Streams via
 *  expo-file-system rather than axios + FormData to avoid the
 *  RN JS FormData polyfill choking on large multipart bodies. */
export async function transcribeChunk(
  uri: string,
  mimeType: string,
  extension: string,
  sessionId: string,
  chunkIndex: number,
): Promise<TranscribeChunkResult> {
  return uploadAudioMultipart<TranscribeChunkResult>(
    "/ai/transcribe-chunk",
    uri,
    `chunk-${chunkIndex}.${extension}`,
    mimeType,
    { sessionId, chunkIndex: String(chunkIndex) },
  );
}

/** One-shot transcription of a complete audio file. Useful when
 *  the chunked path failed (retry from the saved file) or when we
 *  decide to skip live transcription for short memos. */
export async function transcribeAudio(
  uri: string,
  mimeType: string,
  extension: string,
  mode: AudioMode,
  folderId?: string,
): Promise<TranscribeResult> {
  const parameters: Record<string, string> = { mode };
  if (folderId) parameters.folderId = folderId;
  return uploadAudioMultipart<TranscribeResult>(
    "/ai/transcribe",
    uri,
    `recording.${extension}`,
    mimeType,
    parameters,
  );
}

/** Run AI structuring on an already-transcribed string — used
 *  after the chunk pipeline has assembled the full transcript.
 *  No explicit timeout: long transcripts can take Claude tens of
 *  seconds and we don't want to cap recording length. */
export async function structureTranscript(
  transcript: string,
  mode: AudioMode,
  folderId?: string,
): Promise<TranscribeResult> {
  const response = await api.post<TranscribeResult>(
    "/ai/structure-transcript",
    { transcript, mode, folderId },
  );
  return response.data;
}
