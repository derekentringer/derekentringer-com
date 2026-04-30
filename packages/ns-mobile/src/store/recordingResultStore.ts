import { create } from "zustand";
import { Platform } from "react-native";
// Use the legacy entry point: in SDK 54 the top-level
// `expo-file-system` re-exports went to a partially-broken
// migration path (getInfoAsync throws on file:// URIs that the
// legacy API handles fine). The legacy surface is supported
// through the SDK's deprecation cycle.
import * as FileSystem from "expo-file-system/legacy";
import {
  structureTranscript,
  transcribeChunk,
  type AudioMode,
} from "@/api/ai";
import { chunkMimeForPlatform } from "@/lib/audioChunks";
import { createNoteLocal } from "@/lib/noteStore";
import { notifyLocalChange } from "@/lib/syncEngine";

// Phase C.1.2/.3 mobile parity: cross-screen handoff for the
// post-stop pipeline. The user taps Stop on RecordingScreen and
// is immediately routed to the AI tab; meanwhile the
// transcribe → structure → create-note pipeline continues in the
// background regardless of which tab is active. The store is
// where every consumer reads from / writes to so the meeting
// summary card on AiScreen survives navigation away from
// RecordingScreen.

export type SummaryStatus =
  | "transcribing"
  | "structuring"
  | "completed"
  | "failed";

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
   *  completes, so the card can show a snippet even before
   *  Claude finishes structuring. */
  transcript?: string;
  /** Local note id once `createNoteLocal` succeeds. The card's
   *  "Open Note" button is enabled only when this is set. */
  noteId?: string;
  noteTitle?: string;
  errorMessage?: string;
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

/**
 * Run the post-stop pipeline (transcribe → structure → create
 * note) for a recording session. NOT bound to any component
 * lifecycle: callers fire-and-forget so the user can navigate
 * away from RecordingScreen while this runs. The store entry
 * mutates through `transcribing` → `structuring` → `completed` /
 * `failed` so any subscribed UI (the AI Assistant card) stays in
 * sync.
 */
export async function processRecording(
  sessionId: string,
  uri: string,
  mode: AudioMode,
): Promise<void> {
  const { patch } = useRecordingResultStore.getState();
  const { mime, extension } = chunkMimeForPlatform(Platform.OS);

  try {
    console.log(
      "[recording] start session=%s uri=%s mode=%s",
      sessionId,
      uri,
      mode,
    );
    // Best-effort sanity check on the file. Don't fail the
    // pipeline if `getInfoAsync` itself throws — older legacy /
    // newer-API edge cases trip on it but the upload may still
    // succeed (RN's XHR reads the URI directly).
    let infoSize: number | undefined;
    try {
      const info = await FileSystem.getInfoAsync(uri);
      console.log("[recording] file info", info);
      if (info.exists && "size" in info) {
        infoSize = info.size as number;
      } else if (!info.exists) {
        patch(sessionId, {
          status: "failed",
          errorMessage:
            "Audio file is missing — the recorder didn't produce a saved file.",
        });
        return;
      }
    } catch (e) {
      console.warn("[recording] getInfoAsync failed, continuing", e);
    }

    // Step 1: Whisper transcription via the same chunk endpoint
    // the chunk-loop plan would have used. Single chunk, index 0.
    console.log("[recording] uploading chunk size=%s", infoSize ?? "unknown");
    const transcription = await transcribeChunk(
      uri,
      mime,
      extension,
      sessionId,
      0,
    );
    const rawTranscript = (transcription.text ?? "").trim();
    console.log(
      "[recording] transcription length=%s",
      rawTranscript.length,
    );

    if (rawTranscript.length === 0) {
      patch(sessionId, {
        status: "failed",
        errorMessage: "No speech detected in the recording.",
      });
      return;
    }

    patch(sessionId, {
      status: "structuring",
      transcript: rawTranscript,
    });

    // Step 2: AI structuring → title / content / tags. Falls back
    // to the raw transcript if structuring fails so the user
    // still ends up with a usable note.
    let structured: { title: string; content: string; tags: string[] };
    try {
      const result = await structureTranscript(rawTranscript, mode);
      structured = {
        title: result.title || "Untitled Recording",
        content: result.content || rawTranscript,
        tags: result.tags ?? [],
      };
    } catch (e) {
      console.warn("[recording] structuring failed, using raw transcript", e);
      structured = {
        title: "Untitled Recording",
        content: rawTranscript,
        tags: [],
      };
    }

    // Step 3: write the note locally. Sync push happens via the
    // outbox queue.
    const note = await createNoteLocal({
      title: structured.title,
      content: structured.content,
      tags: structured.tags,
      audioMode: mode,
    });
    notifyLocalChange();
    console.log("[recording] note created id=%s title=%s", note.id, note.title);

    patch(sessionId, {
      status: "completed",
      noteId: note.id,
      noteTitle: note.title,
    });
  } catch (err) {
    console.warn("[recording] pipeline failed", err);
    // Surface as much axios detail as we can — "Network Error"
    // alone leaves us guessing whether it was a timeout, a 4xx,
    // or a connection drop. Axios errors carry `.code` + a
    // possible `.response.status` we'd otherwise lose.
    const axiosErr = err as {
      message?: string;
      code?: string;
      response?: { status?: number; data?: { message?: string } };
    };
    const serverMsg = axiosErr?.response?.data?.message;
    const status = axiosErr?.response?.status;
    const code = axiosErr?.code;
    const baseMessage =
      err instanceof Error ? err.message : "Unknown error";
    const detail = [
      serverMsg ?? baseMessage,
      status ? `HTTP ${status}` : null,
      code ? `(${code})` : null,
    ]
      .filter(Boolean)
      .join(" ");
    patch(sessionId, {
      status: "failed",
      errorMessage: detail || baseMessage,
    });
  } finally {
    // Best-effort cleanup of the local audio file.
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch {
      /* ignore */
    }
  }
}

export default useRecordingResultStore;
