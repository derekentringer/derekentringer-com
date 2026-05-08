// Phase H — Server-managed transcription jobs (mobile client).
//
// Mobile uploads audio once to /ai/transcribe-jobs and lets the
// server own the rest of the pipeline (transcribe → structure →
// note creation). The client gets `{ jobId, sessionId }` back
// immediately; terminal status arrives via the existing SSE
// stream as `event: transcription-job`.
//
// See docs/ns/mobile-parity-arch/phase-h-server-jobs.md.

import * as FileSystem from "expo-file-system/legacy";
import api, { tokenManager } from "@/services/api";
import type { AudioMode } from "./ai";
import { getApiBaseUrl } from "@/lib/devHost";

const API_BASE_URL = getApiBaseUrl();

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

export interface UploadTelemetry {
  durationSeconds?: number;
  retryCount?: number;
  bytesTransferred?: number;
}

/** Upload audio to the new /ai/transcribe-jobs endpoint. The
 *  request returns as soon as the audio lands in R2 + the job row
 *  is created — typically a few seconds. The actual transcribe →
 *  structure → note-create work runs server-side; clients learn
 *  about completion via the SSE `transcription-job` event. */
export async function createTranscriptionJob(args: {
  uri: string;
  sessionId: string;
  mode: AudioMode;
  mimeType: string;
  filename: string;
  telemetry?: UploadTelemetry;
}): Promise<CreateTranscriptionJobResult> {
  const accessToken = tokenManager.getAccessToken();
  if (!accessToken) {
    throw new Error("Not authenticated");
  }

  const parameters: Record<string, string> = {
    sessionId: args.sessionId,
    mode: args.mode,
  };
  if (args.telemetry?.durationSeconds !== undefined) {
    parameters.uploadDurationSeconds = String(args.telemetry.durationSeconds);
  }
  if (args.telemetry?.retryCount !== undefined) {
    parameters.uploadRetryCount = String(args.telemetry.retryCount);
  }
  if (args.telemetry?.bytesTransferred !== undefined) {
    parameters.uploadBytesTransferred = String(args.telemetry.bytesTransferred);
  }

  const result = await FileSystem.uploadAsync(
    `${API_BASE_URL}/ai/transcribe-jobs`,
    args.uri,
    {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: "audio",
      mimeType: args.mimeType,
      parameters,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Client-Type": "mobile",
      },
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
    throw new Error(serverMessage ?? `Upload failed: HTTP ${result.status}`);
  }

  return JSON.parse(result.body) as CreateTranscriptionJobResult;
}

/** Fetch the latest snapshot of a single job. Used to reconcile
 *  state when SSE was disconnected during a status change. */
export async function getTranscriptionJob(
  jobId: string,
): Promise<TranscriptionJob> {
  const response = await api.get<TranscriptionJob>(`/ai/transcribe-jobs/${jobId}`);
  return response.data;
}

/** List the user's recent jobs. Used on app launch / connectivity
 *  restore to reconcile any state changes that arrived while
 *  offline. */
export async function listTranscriptionJobsSince(
  since?: Date,
): Promise<{ jobs: TranscriptionJob[] }> {
  const url = since
    ? `/ai/transcribe-jobs?since=${encodeURIComponent(since.toISOString())}`
    : "/ai/transcribe-jobs";
  const response = await api.get<{ jobs: TranscriptionJob[] }>(url);
  return response.data;
}

/** Drop a job + its R2 audio. Used when the user taps Discard
 *  on a failed card. */
export async function deleteTranscriptionJob(jobId: string): Promise<void> {
  await api.delete(`/ai/transcribe-jobs/${jobId}`);
}

/** Re-arm a failed job server-side. The audio is still in R2
 *  (within the 7-day failed-job retention window), so the worker
 *  can re-run the pipeline against it without a re-upload. */
export async function retryTranscriptionJob(
  jobId: string,
): Promise<TranscriptionJob> {
  const response = await api.post<TranscriptionJob>(
    `/ai/transcribe-jobs/${jobId}/retry`,
  );
  return response.data;
}

/** Payload shape emitted by the server's SSE
 *  `event: transcription-job`. Worker only emits on terminal
 *  status (`completed` / `failed`) for v1. */
export interface TranscriptionJobSseEvent {
  jobId: string;
  sessionId: string;
  status: TranscriptionJobStatus;
  noteId?: string;
  errorMessage?: string;
}
