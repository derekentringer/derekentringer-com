import { create } from "zustand";
import { Platform } from "react-native";
// Use the legacy entry point: in SDK 54 the top-level
// `expo-file-system` re-exports went to a partially-broken
// migration path (getInfoAsync throws on file:// URIs that the
// legacy API handles fine). The legacy surface is supported
// through the SDK's deprecation cycle.
import * as FileSystem from "expo-file-system/legacy";
import { type AudioMode } from "@/api/ai";
import { chunkMimeForPlatform } from "@/lib/audioChunks";
import {
  createTranscriptionJob,
  deleteTranscriptionJob,
  retryTranscriptionJob,
} from "@/api/transcriptionJobs";

// Phase H mobile migration — server-managed transcription jobs.
//
// The mobile client now uploads audio once to /ai/transcribe-jobs
// and the server owns the rest of the pipeline (transcribe →
// structure → note creation). This file's responsibility shrinks
// dramatically:
//   1. Push the "transcribing" summary into the store on stop.
//   2. Upload audio + record the returned jobId on the summary.
//   3. Wait for the server's terminal-status SSE event (handled in
//      the syncEngine's transcriptionJob callback, not here) which
//      patches the summary to completed/failed.
//
// The previous Whisper / structure / note-create orchestration is
// gone — server runs all of it. The Note row syncs in via the
// existing sync engine on the next pull (worker calls sseHub.notify
// after creating the note).
//
// See docs/ns/mobile-parity-arch/phase-h-server-jobs.md.

export type SummaryStatus =
  | "transcribing"
  | "structuring"
  | "completed"
  | "failed";

/** Note surfaced by the meeting-context pgvector search on web/
 *  desktop. Mobile doesn't fetch these during recording yet (no
 *  /ai/meeting-context polling) — the field is reserved so the
 *  card can render them when that lands. */
export interface RelatedNote {
  id: string;
  title: string;
  score: number;
}

export interface RecordingSummary {
  /** Stable id we generated when the recording started. Drives
   *  the AI Assistant card row's React key + matches the chunk
   *  upload's sessionId. */
  sessionId: string;
  /** ISO timestamp the recording stopped — used to order cards
   *  in the AI panel relative to chat messages. */
  createdAt: string;
  mode: AudioMode;
  status: SummaryStatus;
  /** Raw Whisper transcript — populated once transcription
   *  completes. Matches web/desktop's `meetingData.transcript`. */
  transcript?: string;
  /** Notes surfaced as related context during recording. Empty
   *  on mobile until /ai/meeting-context polling lands. */
  relatedNotes?: RelatedNote[];
  /** Local note id once `createNoteLocal` succeeds. The card's
   *  "Open Note" button is enabled only when this is set. */
  noteId?: string;
  noteTitle?: string;
  errorMessage?: string;
  /** Local file:// URI of the recorded audio. Kept around so the
   *  upload can be retried from disk without re-recording. Cleared
   *  once the upload succeeds (audio now lives on the server in
   *  R2 and the device copy is no longer needed). Only set on the
   *  device that did the recording — cross-device hydrated cards
   *  never have it. */
  audioUri?: string;
  /** Phase H — server-side job id returned from POST
   *  /ai/transcribe-jobs. Populated once the upload succeeds.
   *  Drives Retry / Discard against the right server row, and
   *  lets the SSE handler match `event: transcription-job`
   *  payloads to the correct local summary. */
  jobId?: string;
}

interface RecordingResultState {
  summaries: RecordingSummary[];
  start: (sessionId: string, mode: AudioMode) => void;
  patch: (sessionId: string, patch: Partial<RecordingSummary>) => void;
  remove: (sessionId: string) => void;
  clearAll: () => void;
}

const useRecordingResultStore = create<RecordingResultState>((set) => ({
  summaries: [],
  start: (sessionId, mode) => {
    set((state) => ({
      summaries: [
        ...state.summaries,
        {
          sessionId,
          mode,
          status: "transcribing",
          createdAt: new Date().toISOString(),
        },
      ],
    }));
  },
  patch: (sessionId, patch) => {
    set((state) => ({
      summaries: state.summaries.map((s) =>
        s.sessionId === sessionId ? { ...s, ...patch } : s,
      ),
    }));
  },
  remove: (sessionId) => {
    set((state) => ({
      summaries: state.summaries.filter((s) => s.sessionId !== sessionId),
    }));
  },
  clearAll: () => set({ summaries: [] }),
}));

/** Phase H — upload audio to /ai/transcribe-jobs and let the
 *  server own the rest of the pipeline. NOT bound to any
 *  component lifecycle: callers fire-and-forget so the user can
 *  navigate away from RecordingScreen while the upload runs. The
 *  store entry mutates through `transcribing` → `completed` /
 *  `failed` driven by the SSE `transcription-job` event handled
 *  in syncEngine + AppNavigator's `onTranscriptionJob` wiring.
 */
export async function processRecording(
  sessionId: string,
  uri: string,
  mode: AudioMode,
): Promise<void> {
  const { patch } = useRecordingResultStore.getState();
  const { mime, extension } = chunkMimeForPlatform(Platform.OS);

  // Stamp the audio URI on the summary up front so a failed
  // upload can be retried from disk without re-recording. Cleared
  // once the upload succeeds (R2 now has the canonical copy).
  patch(sessionId, { audioUri: uri, status: "transcribing" });

  const uploadStartedAt = Date.now();
  let audioSizeBytes: number | undefined;
  try {
    // Best-effort size lookup — feeds the server's upload
    // telemetry. Don't fail if getInfoAsync throws on the legacy
    // SDK 54 surface (handled like the prior pipeline did).
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists && "size" in info) {
        audioSizeBytes = info.size as number;
      } else if (!info.exists) {
        patch(sessionId, {
          status: "failed",
          errorMessage:
            "Audio file is missing — the recorder didn't produce a saved file.",
        });
        return;
      }
    } catch {
      /* legacy API quirk; let the upload itself surface any real I/O issue */
    }

    console.log(
      "[recording] upload start session=%s mode=%s size=%s",
      sessionId,
      mode,
      audioSizeBytes ?? "unknown",
    );

    const result = await createTranscriptionJob({
      uri,
      sessionId,
      mode,
      mimeType: mime,
      filename: `${sessionId}.${extension}`,
      telemetry: {
        durationSeconds: Math.ceil((Date.now() - uploadStartedAt) / 1000),
        bytesTransferred: audioSizeBytes,
      },
    });

    console.log(
      "[recording] upload ok session=%s jobId=%s status=%s",
      sessionId,
      result.jobId,
      result.status,
    );

    // Upload succeeded — server owns the work now. Record the
    // jobId so SSE terminal events can match. The local audio
    // file is no longer needed for the success path; delete it
    // immediately so we don't leak storage. Failed-job retry on
    // mobile re-uses the server-side row + R2 audio (within the
    // 7-day failed retention window).
    patch(sessionId, {
      jobId: result.jobId,
      audioUri: undefined,
    });
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch {
      /* best-effort */
    }
  } catch (err) {
    console.warn("[recording] upload failed", err);
    const baseMessage = err instanceof Error ? err.message : "Upload failed";
    patch(sessionId, {
      status: "failed",
      errorMessage: baseMessage,
    });
    // Audio file stays on disk so the user's Retry button can
    // re-attempt the upload without re-recording.
  }
}

/** Re-arm a failed recording. Two paths:
 *   - We have a `jobId` (upload succeeded once, server-side
 *     pipeline failed). Call POST /ai/transcribe-jobs/:id/retry —
 *     server reuses the audio still in R2.
 *   - We don't (upload itself failed). Re-run the upload from
 *     the local audio file via processRecording.
 *  No-op if neither a jobId nor an audioUri is available (e.g. a
 *  cross-device hydrated card with no local audio). */
export async function retryRecording(sessionId: string): Promise<void> {
  const { summaries, patch } = useRecordingResultStore.getState();
  const summary = summaries.find((s) => s.sessionId === sessionId);
  if (!summary) return;

  patch(sessionId, {
    status: "transcribing",
    errorMessage: undefined,
  });

  if (summary.jobId) {
    try {
      await retryTranscriptionJob(summary.jobId);
    } catch (err) {
      const baseMessage =
        err instanceof Error ? err.message : "Retry failed";
      patch(sessionId, { status: "failed", errorMessage: baseMessage });
    }
    return;
  }

  if (summary.audioUri) {
    await processRecording(sessionId, summary.audioUri, summary.mode);
  }
}

/** Drop the failed card from the local store and from the server
 *  (if a jobId is set). Cleans up the local audio file too if it
 *  hasn't already been deleted. */
export async function discardRecording(sessionId: string): Promise<void> {
  const { summaries, remove } = useRecordingResultStore.getState();
  const summary = summaries.find((s) => s.sessionId === sessionId);
  remove(sessionId);
  if (!summary) return;
  if (summary.jobId) {
    try {
      await deleteTranscriptionJob(summary.jobId);
    } catch {
      /* best-effort — server retention sweep catches abandoned rows */
    }
  }
  if (summary.audioUri) {
    try {
      await FileSystem.deleteAsync(summary.audioUri, { idempotent: true });
    } catch {
      /* ignore */
    }
  }
}

/** Phase H — patch a summary with the latest server status
 *  delivered via SSE. Called from the syncEngine's
 *  `onTranscriptionJob` callback. Looks up the summary by jobId
 *  (set after the upload) and applies the terminal status. */
export function applyTranscriptionJobEvent(payload: {
  jobId: string;
  sessionId: string;
  status: string;
  noteId?: string;
  errorMessage?: string;
}): void {
  const { summaries, patch } = useRecordingResultStore.getState();
  const summary = summaries.find(
    (s) => s.jobId === payload.jobId || s.sessionId === payload.sessionId,
  );
  if (!summary) return;

  if (payload.status === "completed") {
    patch(summary.sessionId, {
      status: "completed",
      noteId: payload.noteId,
      // Note title comes via the synced Note row; the card just
      // shows the noteId-driven open-note pill.
      audioUri: undefined,
    });
  } else if (payload.status === "failed") {
    patch(summary.sessionId, {
      status: "failed",
      errorMessage: payload.errorMessage ?? "Transcription failed",
    });
  } else {
    // Non-terminal updates aren't emitted by the server in v1
    // (terminal-only SSE), but support them here so future
    // partial-progress events Just Work.
    patch(summary.sessionId, {
      status: payload.status as SummaryStatus,
    });
  }
}

export default useRecordingResultStore;
