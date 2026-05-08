// Phase H — Server-managed transcription jobs (web client).
//
// Web uploads audio (or a prebuilt live transcript for the
// fast path) once to /ai/transcribe-jobs and the server owns
// the rest of the pipeline. Web prefers `XMLHttpRequest` over
// `fetch` for the audio upload because XHR exposes
// `upload.onprogress` events — we want to render a real
// percentage on the meeting card during the upload window.
//
// See docs/ns/mobile-parity-arch/phase-h-server-jobs.md.

import { getAccessToken } from "./client.ts";
import type { AudioMode } from "../hooks/useAiSettings.ts";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3004";

export type TranscriptionJobStatus =
  | "pending"
  | "transcribing"
  | "structuring"
  | "completed"
  | "failed";

export interface TranscriptionJob {
  id: string;
  sessionId: string;
  status: TranscriptionJobStatus;
  mode: AudioMode;
  audioMimeType: string | null;
  audioSizeBytes: number | null;
  transcript: string | null;
  structuredTitle: string | null;
  structuredContent: string | null;
  structuredTags: string[] | null;
  noteId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface CreateTranscriptionJobResult {
  jobId: string;
  sessionId: string;
  status: TranscriptionJobStatus;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  /** 0..1 fraction. -1 when the total is unknown (rare for
   *  local-fs blobs, but possible). */
  fraction: number;
}

interface CreateJobAudioOpts {
  audio: Blob;
  filename: string;
  mimeType: string;
  sessionId: string;
  mode: AudioMode;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

interface CreateJobPrebuiltOpts {
  prebuiltTranscript: string;
  sessionId: string;
  mode: AudioMode;
  signal?: AbortSignal;
}

/** Upload audio bytes to /ai/transcribe-jobs. Uses XHR so the
 *  caller can observe upload progress (fetch's stream API only
 *  reports completion, not in-flight progress on the upload
 *  side, in major browsers as of late 2025). */
export async function createTranscriptionJobWithAudio(
  opts: CreateJobAudioOpts,
): Promise<CreateTranscriptionJobResult> {
  const token = getAccessToken();
  if (!token) throw new Error("Not authenticated");

  const formData = new FormData();
  formData.append("sessionId", opts.sessionId);
  formData.append("mode", opts.mode);
  formData.append(
    "audio",
    opts.audio,
    opts.filename,
  );

  return new Promise<CreateTranscriptionJobResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE_URL}/ai/transcribe-jobs`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("X-Client-Type", "web");

    xhr.upload.onprogress = (e) => {
      if (!opts.onProgress) return;
      const total = e.lengthComputable ? e.total : opts.audio.size;
      const fraction = total > 0 ? e.loaded / total : -1;
      opts.onProgress({ loaded: e.loaded, total, fraction });
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as CreateTranscriptionJobResult);
        } catch (err) {
          reject(err instanceof Error ? err : new Error("Bad JSON"));
        }
      } else {
        let message: string | undefined;
        try {
          const parsed = JSON.parse(xhr.responseText) as { message?: string };
          message = parsed.message;
        } catch {
          /* body wasn't JSON */
        }
        reject(new Error(message ?? `Upload failed: HTTP ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("Network error"));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));

    if (opts.signal) {
      if (opts.signal.aborted) {
        xhr.abort();
        return;
      }
      opts.signal.addEventListener("abort", () => xhr.abort());
    }

    xhr.send(formData);
  });
}

/** Fast path — submit just the prebuilt live transcript with no
 *  audio. Server skips Whisper entirely and goes straight to
 *  structuring + note creation. Used when web/desktop's live-
 *  chunk transcription has accumulated >100 chars at stop time. */
export async function createTranscriptionJobWithTranscript(
  opts: CreateJobPrebuiltOpts,
): Promise<CreateTranscriptionJobResult> {
  const token = getAccessToken();
  if (!token) throw new Error("Not authenticated");

  // The endpoint expects multipart even for the prebuilt path
  // (Fastify reads `request.parts()`); FormData with text fields
  // is the simplest match.
  const formData = new FormData();
  formData.append("sessionId", opts.sessionId);
  formData.append("mode", opts.mode);
  formData.append("prebuiltTranscript", opts.prebuiltTranscript);

  const response = await fetch(`${BASE_URL}/ai/transcribe-jobs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Client-Type": "web",
    },
    body: formData,
    signal: opts.signal,
  });
  if (!response.ok) {
    let message: string | undefined;
    try {
      const parsed = (await response.json()) as { message?: string };
      message = parsed.message;
    } catch {
      /* body wasn't JSON */
    }
    throw new Error(message ?? `Job create failed: HTTP ${response.status}`);
  }
  return (await response.json()) as CreateTranscriptionJobResult;
}

export async function getTranscriptionJob(
  jobId: string,
): Promise<TranscriptionJob> {
  const token = getAccessToken();
  if (!token) throw new Error("Not authenticated");
  const response = await fetch(`${BASE_URL}/ai/transcribe-jobs/${jobId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Get job failed: HTTP ${response.status}`);
  }
  return (await response.json()) as TranscriptionJob;
}

export async function listTranscriptionJobsSince(
  since?: Date,
): Promise<{ jobs: TranscriptionJob[] }> {
  const token = getAccessToken();
  if (!token) throw new Error("Not authenticated");
  const url = since
    ? `${BASE_URL}/ai/transcribe-jobs?since=${encodeURIComponent(since.toISOString())}`
    : `${BASE_URL}/ai/transcribe-jobs`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`List jobs failed: HTTP ${response.status}`);
  }
  return (await response.json()) as { jobs: TranscriptionJob[] };
}

export async function retryTranscriptionJob(
  jobId: string,
): Promise<TranscriptionJob> {
  const token = getAccessToken();
  if (!token) throw new Error("Not authenticated");
  const response = await fetch(
    `${BASE_URL}/ai/transcribe-jobs/${jobId}/retry`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!response.ok) {
    let message: string | undefined;
    try {
      const parsed = (await response.json()) as { message?: string };
      message = parsed.message;
    } catch {
      /* body wasn't JSON */
    }
    throw new Error(message ?? `Retry failed: HTTP ${response.status}`);
  }
  return (await response.json()) as TranscriptionJob;
}

export async function deleteTranscriptionJob(jobId: string): Promise<void> {
  const token = getAccessToken();
  if (!token) throw new Error("Not authenticated");
  await fetch(`${BASE_URL}/ai/transcribe-jobs/${jobId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

/** Payload shape emitted by the server's SSE
 *  `event: transcription-job`. Worker only emits on terminal
 *  status (`completed` / `failed`) for v1. */
export interface TranscriptionJobSseEvent {
  jobId: string;
  sessionId: string;
  status: TranscriptionJobStatus;
  noteId?: string;
  noteTitle?: string;
  errorMessage?: string;
}
