import { useState, useRef, useEffect, useCallback } from "react";
import type { AudioMode } from "../hooks/useAiSettings.ts";
import type { Note } from "@derekentringer/shared/ns";
import { transcribeAudio, transcribeChunk } from "../api/ai.ts";
import { apiFetch } from "../api/client.ts";

const MODE_LABELS: Record<AudioMode, string> = {
  meeting: "Meeting",
  lecture: "Lecture",
  memo: "Memo",
  verbatim: "Verbatim",
};

const MODES: AudioMode[] = ["meeting", "lecture", "memo", "verbatim"];
const MAX_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours
const CHUNK_INTERVAL_MS = 20_000; // Send a chunk every 20 seconds

const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function getSupportedMimeType(): string | undefined {
  for (const type of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}

// "processing" exists in the type for parity with desktop, but the mic-only
// web path never enters it — stop is synchronous, processing runs detached.
export type RecorderState = "idle" | "recording" | "processing";

export interface AudioRecordingState {
  state: RecorderState;
  elapsed: number;
  mode: AudioMode;
  stream: MediaStream | null;
  liveTranscript: string;
  sessionId: string;
  onStop: () => void;
  /** Discard the in-progress recording without producing a note.
   *  The MediaRecorder is stopped and resources are released, but
   *  the post-stop processing pipeline is skipped so no transcript
   *  upload, no Whisper call, no /notes/:id PATCH happens. */
  onCancel: () => void;
}

/** Self-contained snapshot of a recording session, handed to a detached
 *  processing task. Contains everything needed to transcribe/PATCH without
 *  reading component refs — so a new recording can safely start while this
 *  session's task is still in flight. */
interface SessionSnapshot {
  sessionId: string;
  mode: AudioMode;
  folderId?: string;
  capturedTranscript: string;
  audioBlob: Blob;
}

interface AudioRecorderProps {
  defaultMode: AudioMode;
  folderId?: string;
  /** Fired when a detached processing task finishes successfully. sessionId
   *  identifies which recording this note came from — needed because multiple
   *  processing tasks can be in flight concurrently. */
  onNoteCreated: (note: Note, sessionId: string, liveTranscript?: string) => void;
  /** Immediate capture-path errors (mic denied). No session exists yet. */
  onError: (message: string) => void;
  /** Fired when a detached processing task fails. Parents that leave this
   *  unset still get a toast via `onError`. */
  onNoteFailed?: (sessionId: string, message: string) => void;
  onRecordingStateChange?: (recordingState: AudioRecordingState | null) => void;
  onModeChange?: (mode: AudioMode) => void;
  /** When set, auto-starts recording with this mode. Change `triggerKey` to re-trigger. */
  triggerMode?: AudioMode;
  triggerKey?: number;
  /** When true, renders no UI — only responds to triggerMode/triggerKey */
  headless?: boolean;
  /** Phase 2: populated by the component with a `retry` / `discard` control. */
  controlRef?: React.MutableRefObject<AudioRecorderControl | null>;
  /** Phase 3: fires whenever the in-flight processing-task count changes. */
  onInFlightCountChange?: (count: number) => void;
}

export interface AudioRecorderControl {
  retry: (sessionId: string) => void;
  discard: (sessionId: string) => void;
  /** Returns true when a SessionSnapshot for this sessionId is
   *  still in memory — i.e. retry can do something useful. False
   *  for cross-device chat-hydrated cards (we never had the
   *  snapshot) and for prior-session failed cards after a page
   *  reload (snapshotsRef is in-memory only). */
  hasSnapshot: (sessionId: string) => boolean;
}

function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AudioRecorder({ defaultMode, folderId, onNoteCreated, onError, onNoteFailed, onRecordingStateChange, onModeChange, triggerMode, triggerKey, headless, controlRef, onInFlightCountChange }: AudioRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [mode, setMode] = useState<AudioMode>(defaultMode);
  const [showModes, setShowModes] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef(mode);
  const folderIdRef = useRef(folderId);
  const onNoteCreatedRef = useRef(onNoteCreated);
  const onErrorRef = useRef(onError);
  const onNoteFailedRef = useRef(onNoteFailed);
  const onInFlightCountChangeRef = useRef(onInFlightCountChange);
  modeRef.current = mode;
  folderIdRef.current = folderId;
  onNoteCreatedRef.current = onNoteCreated;
  onErrorRef.current = onError;
  onNoteFailedRef.current = onNoteFailed;
  onInFlightCountChangeRef.current = onInFlightCountChange;

  function emitInFlightCount() {
    onInFlightCountChangeRef.current?.(inFlightTasksRef.current.size);
  }

  // Per-session AbortControllers for detached processing tasks. Aborted
  // on unmount so pending fetches don't run against a dead parent.
  const inFlightTasksRef = useRef<Map<string, AbortController>>(new Map());

  // Phase 2: snapshots retained for retry. Purged on success or discard.
  const snapshotsRef = useRef<Map<string, SessionSnapshot>>(new Map());

  // Chunked transcription state
  const sessionIdRef = useRef("");
  const chunkIndexRef = useRef(0);
  const chunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptChunksRef = useRef<Map<number, string>>(new Map());
  const allAudioChunksRef = useRef<Blob[]>([]);
  const lastChunkSentRef = useRef(0); // number of audio chunks already sent

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowModes(false);
      }
    }
    if (showModes) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [showModes]);

  // Auto-start recording when triggered from ribbon
  useEffect(() => {
    if (triggerKey && triggerMode && state === "idle") {
      setMode(triggerMode);
      onModeChange?.(triggerMode);
      // Defer to next tick so mode state is set
      requestAnimationFrame(() => handleRecordRef.current?.());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerKey]);

  const handleRecordRef = useRef<(() => void) | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (chunkTimerRef.current) {
      clearInterval(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    allAudioChunksRef.current = [];
    lastChunkSentRef.current = 0;
    transcriptChunksRef.current = new Map();
    sessionIdRef.current = "";
    chunkIndexRef.current = 0;
  }, []);

  // Cleanup on unmount — also abort every in-flight detached processing
  // task so their fetches stop and their callbacks don't fire after unmount.
  useEffect(() => {
    return () => {
      cleanup();
      for (const controller of inFlightTasksRef.current.values()) {
        controller.abort();
      }
      inFlightTasksRef.current.clear();
      snapshotsRef.current.clear();
      emitInFlightCount();
    };
  }, [cleanup]);

  // ─── Detached processing ────────────────────────────────────────────────
  // Runs transcribe → PATCH → onNoteCreated/onNoteFailed. Takes a self-
  // contained snapshot; reads no component refs except callback refs.
  async function processSession(snapshot: SessionSnapshot, signal: AbortSignal) {
    const { sessionId, mode: snapMode, folderId: snapFolderId, capturedTranscript, audioBlob } = snapshot;

    try {
      const result = await transcribeAudio(audioBlob, snapMode, snapFolderId);
      if (signal.aborted) return;

      if (capturedTranscript && capturedTranscript.trim().length > 0) {
        try {
          await apiFetch(`/notes/${result.note.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transcript: capturedTranscript }),
            signal,
          });
          result.note.transcript = capturedTranscript;
        } catch {
          // Non-fatal — note still created without transcript
        }
      }

      if (signal.aborted) return;
      snapshotsRef.current.delete(sessionId);
      onNoteCreatedRef.current(result.note, sessionId, capturedTranscript);
    } catch (err) {
      if (signal.aborted) return;
      const message = err instanceof Error ? err.message : "Transcription failed";
      // Phase 2: snapshot stays for retry.
      if (onNoteFailedRef.current) {
        onNoteFailedRef.current(sessionId, message);
      } else {
        onErrorRef.current(message);
      }
    }
  }

  function startProcessing(snapshot: SessionSnapshot) {
    snapshotsRef.current.set(snapshot.sessionId, snapshot);
    const controller = new AbortController();
    inFlightTasksRef.current.set(snapshot.sessionId, controller);
    emitInFlightCount();
    processSession(snapshot, controller.signal).finally(() => {
      inFlightTasksRef.current.delete(snapshot.sessionId);
      emitInFlightCount();
    });
  }

  // Phase 2: expose retry/discard through a control ref.
  useEffect(() => {
    if (!controlRef) return;
    controlRef.current = {
      retry: (sessionId: string) => {
        const snap = snapshotsRef.current.get(sessionId);
        if (!snap) return;
        const existing = inFlightTasksRef.current.get(sessionId);
        if (existing) existing.abort();
        startProcessing(snap);
      },
      discard: (sessionId: string) => {
        const existing = inFlightTasksRef.current.get(sessionId);
        if (existing) existing.abort();
        if (inFlightTasksRef.current.delete(sessionId)) {
          emitInFlightCount();
        }
        snapshotsRef.current.delete(sessionId);
      },
      hasSnapshot: (sessionId: string) =>
        snapshotsRef.current.has(sessionId),
    };
    return () => {
      if (controlRef) controlRef.current = null;
    };
  }, [controlRef]);

  // When set, the next `recorder.onstop` skips the post-stop
  // processing pipeline (no transcribe upload, no note creation).
  // Set by handleCancel right before stop() so the resulting blob
  // is dropped on the floor instead of producing a "Meeting Ended"
  // card the user explicitly discarded.
  const cancelledRef = useRef(false);

  const handleStop = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (chunkTimerRef.current) {
      clearInterval(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }
  }, []);

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    handleStop();
  }, [handleStop]);

  // Build the full transcript from ordered chunks
  function getOrderedTranscript(): string {
    const map = transcriptChunksRef.current;
    if (map.size === 0) return "";
    const maxIdx = Math.max(...map.keys());
    const parts: string[] = [];
    for (let i = 0; i <= maxIdx; i++) {
      const text = map.get(i);
      if (text) parts.push(text);
    }
    return parts.join(" ");
  }

  // Send accumulated audio as a chunk for transcription
  async function sendChunk() {
    const allChunks = allAudioChunksRef.current;
    const lastSent = lastChunkSentRef.current;
    if (allChunks.length <= lastSent) return; // no new data

    lastChunkSentRef.current = allChunks.length;

    // Include all chunks from the start so the blob has valid container headers (WebM EBML header is in the first chunk)
    const mimeType = mediaRecorderRef.current?.mimeType || "audio/webm";
    const chunkBlob = new Blob(allChunks, { type: mimeType });

    // Skip tiny chunks (< 1KB likely silence/noise)
    if (chunkBlob.size < 1024) return;

    const idx = chunkIndexRef.current++;
    const sid = sessionIdRef.current;

    try {
      const result = await transcribeChunk(chunkBlob, sid, idx);
      if (result.text && result.text.trim()) {
        // Cumulative audio means each result contains the full transcript so far — replace all previous chunks
        transcriptChunksRef.current.clear();
        transcriptChunksRef.current.set(0, result.text.trim());
        setLiveTranscript(result.text.trim());
      }
    } catch (err) {
      // Non-fatal — chunk transcription failure doesn't stop recording
      console.warn("Chunk transcription failed:", err);
    }
  }

  // Keep a ref copy of liveTranscript so it's accessible from stale closures
  const liveTranscriptRef = useRef(liveTranscript);
  liveTranscriptRef.current = liveTranscript;

  // Notify parent of recording state changes
  useEffect(() => {
    if (state === "idle") {
      onRecordingStateChange?.(null);
    } else {
      onRecordingStateChange?.({
        state,
        elapsed,
        mode,
        stream: streamRef.current,
        liveTranscript,
        sessionId: sessionIdRef.current,
        onStop: handleStop,
        onCancel: handleCancel,
      });
    }
  }, [state, elapsed, mode, liveTranscript, handleStop, handleCancel, onRecordingStateChange]);

  async function handleRecord() {
    setShowModes(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = getSupportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      allAudioChunksRef.current = [];
      lastChunkSentRef.current = 0;
      transcriptChunksRef.current = new Map();
      sessionIdRef.current = generateSessionId();
      chunkIndexRef.current = 0;
      setLiveTranscript("");

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
          allAudioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        // Cancel path: discard chunks, abort any in-flight chunk
        // transcription, skip the post-stop processing pipeline.
        // The MediaStream / MediaRecorder are still cleaned up via
        // `cleanup()` so the mic light goes off.
        if (cancelledRef.current) {
          cancelledRef.current = false;
          cleanup();
          setState("idle");
          setElapsed(0);
          setLiveTranscript("");
          return;
        }

        const blobType = recorder.mimeType || "audio/webm";
        const audioBlob = new Blob(chunksRef.current, { type: blobType });
        const fromMap = getOrderedTranscript();
        const fromState = liveTranscriptRef.current;
        const capturedTranscript = fromMap || fromState;

        const snapshot: SessionSnapshot = {
          sessionId: sessionIdRef.current,
          mode: modeRef.current,
          folderId: folderIdRef.current,
          capturedTranscript,
          audioBlob,
        };

        cleanup();
        // Mic has no meaningful sync-async boundary on stop, so we never
        // enter the "processing" state. Go straight to idle; processing
        // runs detached.
        setState("idle");
        setElapsed(0);
        setLiveTranscript("");

        startProcessing(snapshot);
      };

      recorder.start(1000); // 1s data chunks for smooth collection
      startTimeRef.current = Date.now();
      setState("recording");

      // Elapsed timer
      timerRef.current = setInterval(() => {
        const ms = Date.now() - startTimeRef.current;
        setElapsed(ms);
        if (ms >= MAX_DURATION_MS) {
          handleStop();
        }
      }, 1000);

      // Chunk transcription timer — send a chunk every 20 seconds
      chunkTimerRef.current = setInterval(() => {
        sendChunk();
      }, CHUNK_INTERVAL_MS);
    } catch (err) {
      cleanup();
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        onErrorRef.current("Microphone permission denied");
      } else {
        onErrorRef.current("Failed to start recording");
      }
    }
  }

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPressRef = useRef(false);
  handleRecordRef.current = handleRecord;

  function handlePointerDown() {
    if (state !== "idle") return;
    didLongPressRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      didLongPressRef.current = true;
      setShowModes(true);
    }, 500);
  }

  const handledByPointerRef = useRef(false);

  function handlePointerUp() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (state !== "idle") return;
    if (!didLongPressRef.current && !showModes) {
      handledByPointerRef.current = true;
      handleRecord();
    }
  }

  function handlePointerLeave() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  if (headless) return null;

  // Idle state — click to record, long-press for mode selector
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onPointerDown={state === "idle" ? handlePointerDown : undefined}
        onPointerUp={state === "idle" ? handlePointerUp : undefined}
        onPointerLeave={state === "idle" ? handlePointerLeave : undefined}
        onClick={state === "recording" ? handleStop : state === "idle" ? () => {
          if (handledByPointerRef.current) { handledByPointerRef.current = false; return; }
          if (!showModes) handleRecord();
        } : undefined}
        className={`flex items-center justify-center w-7 h-7 rounded transition-colors cursor-pointer select-none ${
          state === "recording"
            ? "text-destructive hover:bg-destructive/10"
            : state === "processing"
              ? "text-muted-foreground opacity-50 cursor-not-allowed"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
        }`}
        title={state === "recording" ? "Stop recording" : state === "processing" ? "Processing..." : `Record audio (${MODE_LABELS[mode]}) — hold for options`}
        aria-label={state === "recording" ? "Stop recording" : "Record audio"}
        disabled={state === "processing"}
      >
        {state === "recording" ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <rect x="4" y="4" width="16" height="16" rx="2" />
          </svg>
        ) : state === "processing" ? (
          <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        )}
      </button>
      {showModes && state === "idle" && (
        <div className="absolute top-0 left-full ml-1 bg-card border border-border rounded-md shadow-lg py-1 z-50 min-w-[120px]">
          <div className="px-3 py-1 text-[10px] text-muted-foreground uppercase tracking-wider">Mode</div>
          {MODES.map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setShowModes(false);
                onModeChange?.(m);
              }}
              className={`w-full text-left px-3 py-1.5 text-sm transition-colors cursor-pointer ${
                m === mode
                  ? "text-foreground bg-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
