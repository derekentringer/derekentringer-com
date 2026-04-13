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

export type RecorderState = "idle" | "recording" | "processing";

export interface AudioRecordingState {
  state: RecorderState;
  elapsed: number;
  mode: AudioMode;
  stream: MediaStream | null;
  liveTranscript: string;
  onStop: () => void;
}

interface AudioRecorderProps {
  defaultMode: AudioMode;
  folderId?: string;
  onNoteCreated: (note: Note, liveTranscript?: string) => void;
  onError: (message: string) => void;
  onRecordingStateChange?: (recordingState: AudioRecordingState | null) => void;
  onModeChange?: (mode: AudioMode) => void;
  /** When set, auto-starts recording with this mode. Change `triggerKey` to re-trigger. */
  triggerMode?: AudioMode;
  triggerKey?: number;
  /** When true, renders no UI — only responds to triggerMode/triggerKey */
  headless?: boolean;
}

function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AudioRecorder({ defaultMode, folderId, onNoteCreated, onError, onRecordingStateChange, onModeChange, triggerMode, triggerKey, headless }: AudioRecorderProps) {
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
  modeRef.current = mode;
  folderIdRef.current = folderId;
  onNoteCreatedRef.current = onNoteCreated;
  onErrorRef.current = onError;

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

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup]);

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
        transcriptChunksRef.current.set(result.chunkIndex, result.text.trim());
        setLiveTranscript(getOrderedTranscript());
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
        onStop: handleStop,
      });
    }
  }, [state, elapsed, mode, liveTranscript, handleStop, onRecordingStateChange]);

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

      recorder.onstop = async () => {
        const blobType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: blobType });
        // Capture transcript before cleanup destroys it
        const fromMap = getOrderedTranscript();
        const fromState = liveTranscriptRef.current;
        const capturedTranscript = fromMap || fromState;
        cleanup();
        setState("processing");

        try {
          // Always transcribe the full audio for highest quality final note
          const result = await transcribeAudio(blob, modeRef.current, folderIdRef.current);

          // Save transcript directly to the note via API (bypass React closure issues)
          if (capturedTranscript && capturedTranscript.trim().length > 0) {
            try {
              await apiFetch(`/notes/${result.note.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ transcript: capturedTranscript }),
              });
              result.note.transcript = capturedTranscript;
            } catch {
              // Non-fatal — note still created without transcript
            }
          }

          onNoteCreatedRef.current(result.note);
        } catch (err) {
          onErrorRef.current(err instanceof Error ? err.message : "Transcription failed");
        } finally {
          setState("idle");
          setElapsed(0);
          setLiveTranscript("");
        }
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
