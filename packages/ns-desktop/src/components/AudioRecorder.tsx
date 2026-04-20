import { useState, useRef, useEffect, useCallback } from "react";
import type { AudioMode, RecordingSource } from "../hooks/useAiSettings.ts";
import type { Note } from "@derekentringer/ns-shared";
import { structureAndCreateNote, transcribeAudio, transcribeChunk } from "../api/ai.ts";
import { apiFetch } from "../api/client.ts";
import { assembleTranscript } from "../lib/transcriptAssembly.ts";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const MODE_LABELS: Record<AudioMode, string> = {
  meeting: "Meeting",
  lecture: "Lecture",
  memo: "Memo",
  verbatim: "Verbatim",
};

const SOURCE_LABELS: Record<RecordingSource, string> = {
  microphone: "Microphone only",
  meeting: "Meeting mode",
};

const MODES: AudioMode[] = ["meeting", "lecture", "memo", "verbatim"];
const MAX_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours
// Phase 4.4: 30s cadence. Whisper typically returns a transcribed
// chunk in 5–10s, so a 20s interval meant the next chunk timer
// fired while the previous upload was still in flight, stacking
// requests and producing ~3 concurrent Whisper calls by mid-meeting.
// 30s cuts API load by ~33% with a 10s latency trade-off on the
// live transcript — acceptable because the live view is a
// best-effort preview, not the canonical transcript.
const CHUNK_INTERVAL_MS = 30_000;

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
  audioLevel: number;
  liveTranscript: string;
  onStop: () => void;
}

function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface AudioRecorderProps {
  defaultMode: AudioMode;
  folderId?: string;
  recordingSource: RecordingSource;
  onRecordingSourceChange: (source: RecordingSource) => void;
  onNoteCreated: (note: Note, liveTranscript?: string) => void;
  onError: (message: string) => void;
  onRecordingStateChange?: (recordingState: AudioRecordingState | null) => void;
  onModeChange?: (mode: AudioMode) => void;
  triggerMode?: AudioMode;
  triggerKey?: number;
  headless?: boolean;
}

export function AudioRecorder({ defaultMode, folderId, recordingSource, onRecordingSourceChange, onNoteCreated, onError, onRecordingStateChange, onModeChange, triggerMode, triggerKey, headless }: AudioRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [mode, setMode] = useState<AudioMode>(defaultMode);
  const [showModes, setShowModes] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [meetingSupported, setMeetingSupported] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // Phase 2.6 re-entrance guard. `cleanup()` is called from multiple
  // places (unmount effect, handleMeetingRecord catch, handleMicRecord
  // catch, handleMicRecord onstop, handleMeetingStop outer catch).
  // A second call after a first has already nulled refs would be a
  // no-op, but we also want to avoid re-stopping already-stopped
  // MediaRecorders (which throws) and re-unlistening a consumed
  // unlisten fn. The flag is reset to `false` at the start of every
  // recording (`handleMeetingRecord` / `handleMicRecord`) so the
  // next session gets a fresh cleanup.
  const cleanupDoneRef = useRef(false);

  // Chunked transcription state
  const sessionIdRef = useRef("");
  const chunkIndexRef = useRef(0);
  const chunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptChunksRef = useRef<Map<number, string>>(new Map());
  const chunkRecorderRef = useRef<MediaRecorder | null>(null);
  const chunkBufferRef = useRef<Blob[]>([]);
  const chunkRecorderShouldRestartRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const tickUnlistenRef = useRef<(() => void) | null>(null);
  const isMeetingRef = useRef(false);
  const modeRef = useRef(mode);
  const folderIdRef = useRef(folderId);
  const onNoteCreatedRef = useRef(onNoteCreated);
  const onErrorRef = useRef(onError);
  modeRef.current = mode;
  folderIdRef.current = folderId;
  onNoteCreatedRef.current = onNoteCreated;
  onErrorRef.current = onError;

  // Check meeting recording support on mount
  useEffect(() => {
    invoke<boolean>("check_meeting_recording_support")
      .then(setMeetingSupported)
      .catch(() => setMeetingSupported(false));
  }, []);

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

  const cleanup = useCallback(() => {
    // Re-entrance guard: cleanup is called from several places and
    // re-entering after refs are already nulled would still re-fire
    // `track.stop()` on an already-stopped stream and re-invoke an
    // already-consumed tickUnlisten fn. The flag is reset when a
    // new recording starts, so the next session gets a fresh
    // cleanup.
    if (cleanupDoneRef.current) return;
    cleanupDoneRef.current = true;

    // Stop active MediaRecorders before nulling refs so onstop can
    // flush any buffered chunks cleanly. Guard with state checks — a
    // double-stop on an already-inactive recorder throws
    // InvalidStateError, and unmount can reach here after stop() has
    // already been called.
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Already stopping / stopped — onstop will still fire, safe to ignore.
      }
    }
    if (chunkRecorderRef.current && chunkRecorderRef.current.state !== "inactive") {
      // Prevent the restart handler from spawning another recorder
      // after this stop fires during unmount.
      chunkRecorderShouldRestartRef.current = false;
      try {
        chunkRecorderRef.current.stop();
      } catch {
        // Same as above — safe to ignore.
      }
    }
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
    if (tickUnlistenRef.current) {
      tickUnlistenRef.current();
      tickUnlistenRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    chunkRecorderRef.current = null;
    chunkBufferRef.current = [];
    chunkRecorderShouldRestartRef.current = false;
    transcriptChunksRef.current = new Map();
    sessionIdRef.current = "";
    chunkIndexRef.current = 0;
    isMeetingRef.current = false;
  }, []);

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup]);

  // See `assembleTranscript` in `../lib/transcriptAssembly.ts` — the
  // chunk-ordering rules and trade-offs live there alongside unit tests.
  function getOrderedTranscript(): string {
    return assembleTranscript(transcriptChunksRef.current);
  }

  // Start an independent MediaRecorder on the shared mic stream whose sole job
  // is to produce self-contained audio files every CHUNK_INTERVAL_MS for live
  // transcription. On stop() it flushes a complete file (with container header),
  // uploads it, and restarts itself if recording is still active. This avoids
  // Chromium/WebView2's fragmented-WebM problem where mid-stream slices lack an
  // EBML header and are rejected by the server's magic-byte check.
  function startMicChunkRecorder(stream: MediaStream, mimeType: string | undefined) {
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    chunkBufferRef.current = [];
    chunkRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunkBufferRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const buf = chunkBufferRef.current;
      chunkBufferRef.current = [];
      const blobType = recorder.mimeType || mimeType || "audio/webm";
      const blob = new Blob(buf, { type: blobType });

      // Restart immediately so we don't miss audio while the upload runs
      if (chunkRecorderShouldRestartRef.current && streamRef.current) {
        startMicChunkRecorder(streamRef.current, mimeType);
      }

      if (blob.size < 1024) return;

      const idx = chunkIndexRef.current++;
      const sid = sessionIdRef.current;
      // Fire-and-forget — see sendNativeChunk for the rationale.
      transcribeChunk(blob, sid, idx)
        .then((result) => {
          if (result.text && result.text.trim()) {
            transcriptChunksRef.current.set(result.chunkIndex, result.text.trim());
            setLiveTranscript(getOrderedTranscript());
          }
        })
        .catch((err) => {
          console.warn("Chunk transcription failed:", err);
        });
    };

    recorder.start();
  }

  const useMeeting = meetingSupported && recordingSource === "meeting";

  async function sendNativeChunk() {
    // Get mixed system+mic audio chunk from the Rust recording. We
    // still `await` the Rust IPC + blob construction because those
    // are cheap and we need the `idx`/`sid` to claim this chunk's
    // position in `transcriptChunksRef` before any other call. The
    // Whisper upload itself is fired-and-forgotten so a slow
    // transcription never delays the NEXT chunk timer tick.
    let wavBytes: number[];
    try {
      wavBytes = await invoke<number[]>("get_meeting_audio_chunk");
    } catch (err) {
      console.warn("Native chunk fetch failed:", err);
      return;
    }
    if (!wavBytes || wavBytes.length === 0) return;

    const blob = new Blob([new Uint8Array(wavBytes)], { type: "audio/wav" });
    if (blob.size < 1024) return; // Skip tiny chunks

    const idx = chunkIndexRef.current++;
    const sid = sessionIdRef.current;

    // Fire-and-forget. Two invariants keep this safe:
    //   1. `idx` was claimed synchronously before this promise ran,
    //      so chunks never collide on the same index even when
    //      multiple uploads are in flight concurrently.
    //   2. Late-arriving responses write into `transcriptChunksRef`
    //      directly; if the user has already stopped by then, the
    //      assembled live transcript was captured at stop time and
    //      this write just updates an abandoned map.
    transcribeChunk(blob, sid, idx)
      .then((result) => {
        if (result.text && result.text.trim()) {
          transcriptChunksRef.current.set(result.chunkIndex, result.text.trim());
          setLiveTranscript(getOrderedTranscript());
        }
      })
      .catch((err) => {
        console.warn("Native chunk transcription failed:", err);
      });
  }

  function startMeetingChunkCapture() {
    transcriptChunksRef.current = new Map();
    sessionIdRef.current = generateSessionId();
    chunkIndexRef.current = 0;
    setLiveTranscript("");

    chunkTimerRef.current = setInterval(() => {
      sendNativeChunk();
    }, CHUNK_INTERVAL_MS);
  }

  function stopMeetingChunkCapture() {
    if (chunkTimerRef.current) {
      clearInterval(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }
  }

  async function handleMeetingRecord() {
    try {
      // New session — re-arm the cleanup guard so the next stop /
      // unmount runs through cleanup() fully.
      cleanupDoneRef.current = false;
      await invoke("start_meeting_recording");
      isMeetingRef.current = true;
      setState("recording");
      setElapsed(0);

      // Start parallel mic capture for live transcription
      startMeetingChunkCapture();

      // Listen for tick events from Rust (payload is [elapsed_secs, rms_level])
      const unlisten = await listen<[number, number]>("meeting-recording-tick", (event) => {
        const [secs, level] = event.payload;
        setElapsed(secs * 1000);
        setAudioLevel(level);
        if (secs * 1000 >= MAX_DURATION_MS) {
          handleStop();
        }
      });
      tickUnlistenRef.current = unlisten;
    } catch (err) {
      cleanup();
      onErrorRef.current(err instanceof Error ? err.message : String(err));
    }
  }

  // Keep a ref copy of liveTranscript so it's accessible from stale closures
  const liveTranscriptRef = useRef(liveTranscript);
  liveTranscriptRef.current = liveTranscript;

  async function handleMeetingStop() {
    // Re-entry guard: subsequent Stop clicks while we're already processing
    // the current recording are no-ops. On Windows the native stop_recording
    // call can take a few seconds (final WAV mix), and the Stop button stays
    // visible until state flips to "processing", so rapid clicks used to
    // queue multiple invokes.
    if (!isMeetingRef.current) return;
    isMeetingRef.current = false;

    try {
      // Capture transcript — try ref map first, fall back to state ref
      const fromMap = getOrderedTranscript();
      const fromState = liveTranscriptRef.current;
      const capturedTranscript = fromMap || fromState;

      // Stop live transcription chunk capture
      stopMeetingChunkCapture();

      // Flip UI to "processing" *before* the native stop call so the Stop
      // button disappears and the user sees the spinner while Rust is
      // mixing the final WAV.
      setState("processing");

      // Rust returns the mixed WAV as a byte array and deletes the
      // underlying temp file in the same call, so nothing lingers in
      // $TMPDIR. Earlier versions returned a path the TS side was
      // supposed to read + delete; the delete never happened and
      // every meeting leaked ~1 MB/sec to System Data on macOS.
      const wavBytes = await invoke<number[]>("stop_meeting_recording");

      // Unlisten ticks
      if (tickUnlistenRef.current) {
        tickUnlistenRef.current();
        tickUnlistenRef.current = null;
      }

      const blob = new Blob([new Uint8Array(wavBytes)], { type: "audio/wav" });

      try {
        // Phase 4.1 — dedup full-audio vs live-chunk transcription.
        // If the live chunks already gathered a substantive transcript
        // (>100 chars, threshold from the hardening plan's "Option A"),
        // skip re-running Whisper on the full WAV and hand the live
        // transcript directly to Claude structuring via
        // `/ai/structure-transcript`. That saves one full-audio
        // Whisper pass per meeting — in a 10-minute meeting, the live
        // chunks have already seen the entire audio anyway, so the
        // duplicate Whisper pass is pure waste.
        //
        // The live transcript can miss up to one chunk interval of
        // trailing audio (the final ~30s window before stop that
        // didn't trigger a chunk timer). That trade-off is documented
        // in the plan; users who need perfect tail-end coverage can
        // record past the content they care about, or we can add a
        // "final-chunk flush" in a future phase.
        //
        // Short transcripts fall back to the full-Whisper path so
        // brief memos still get transcribed accurately.
        const useLiveTranscript =
          !!capturedTranscript && capturedTranscript.trim().length > 100;

        const result = useLiveTranscript
          ? await structureAndCreateNote(
              capturedTranscript,
              modeRef.current,
              folderIdRef.current,
            )
          : await transcribeAudio(blob, modeRef.current, folderIdRef.current);

        // Save transcript directly to the note via API. Failure is
        // non-fatal — the note was already created, so we still hand
        // it to the parent. We only mirror the transcript into
        // `result.note` when the server actually persisted it
        // (response.ok) so the UI doesn't show a transcript that
        // isn't in the database.
        if (capturedTranscript && capturedTranscript.trim().length > 0) {
          try {
            const patchRes = await apiFetch(`/notes/${result.note.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ transcript: capturedTranscript }),
            });
            if (patchRes.ok) {
              result.note.transcript = capturedTranscript;
            }
          } catch {
            // Network error or refresh failure — non-fatal.
          }
        }

        onNoteCreatedRef.current(result.note);
      } catch (err) {
        onErrorRef.current(err instanceof Error ? err.message : "Transcription failed");
      } finally {
        setState("idle");
        setElapsed(0);
        setLiveTranscript("");
        // Reset per-session chunk state so the next recording starts
        // with a clean map, fresh session ID, and chunk index 0.
        // `cleanup()` is only called on the error path above — the
        // success path leaves MediaRecorder refs untouched (Rust
        // owns the capture in meeting mode), so we reset the
        // session-scoped refs here explicitly.
        transcriptChunksRef.current = new Map();
        sessionIdRef.current = "";
        chunkIndexRef.current = 0;
      }
    } catch (err) {
      cleanup();
      setState("idle");
      setElapsed(0);
      onErrorRef.current(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleMicRecord() {
    try {
      // New session — re-arm the cleanup guard so the next stop /
      // unmount runs through cleanup() fully.
      cleanupDoneRef.current = false;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = getSupportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      transcriptChunksRef.current = new Map();
      sessionIdRef.current = generateSessionId();
      chunkIndexRef.current = 0;
      setLiveTranscript("");

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const blobType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: blobType });
        // Capture transcript — try ref map first, fall back to state ref
        const fromMap = getOrderedTranscript();
        const fromState = liveTranscriptRef.current;
        const capturedTranscript = fromMap || fromState;
        cleanup();
        setState("processing");

        try {
          // Always transcribe the full audio for highest quality final note
          const result = await transcribeAudio(blob, modeRef.current, folderIdRef.current);

          // Save transcript directly to the note via API. See
          // handleMeetingStop for the full rationale — we only mirror
          // the transcript into the in-memory `result.note` when the
          // server actually persisted it (response.ok).
          if (capturedTranscript && capturedTranscript.trim().length > 0) {
            try {
              const patchRes = await apiFetch(`/notes/${result.note.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ transcript: capturedTranscript }),
              });
              if (patchRes.ok) {
                result.note.transcript = capturedTranscript;
              }
            } catch {
              // Non-fatal
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

      recorder.start(1000);
      startTimeRef.current = Date.now();
      setState("recording");

      // Spin up the independent live-chunk recorder on the same stream
      chunkRecorderShouldRestartRef.current = true;
      startMicChunkRecorder(stream, mimeType);

      timerRef.current = setInterval(() => {
        const ms = Date.now() - startTimeRef.current;
        setElapsed(ms);
        if (ms >= MAX_DURATION_MS) {
          handleStop();
        }
      }, 1000);

      // Roll the chunk recorder every CHUNK_INTERVAL_MS — its onstop handler
      // uploads the completed file and restarts itself.
      chunkTimerRef.current = setInterval(() => {
        if (chunkRecorderRef.current?.state === "recording") {
          chunkRecorderRef.current.stop();
        }
      }, CHUNK_INTERVAL_MS);
    } catch (err) {
      cleanup();
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        onError("Microphone permission denied");
      } else {
        onError("Failed to start recording");
      }
    }
  }

  function handleRecord() {
    if (useMeeting) {
      handleMeetingRecord();
    } else {
      handleMicRecord();
    }
  }

  // Auto-start recording when triggered from ribbon
  const handleMeetingRecordRef = useRef<(() => void) | null>(null);
  const handleMicRecordRef = useRef<(() => void) | null>(null);
  handleMeetingRecordRef.current = handleMeetingRecord;
  handleMicRecordRef.current = handleMicRecord;
  useEffect(() => {
    if (triggerKey && triggerMode && state === "idle") {
      setMode(triggerMode);
      onModeChange?.(triggerMode);
      const shouldUseMeeting = (triggerMode === "meeting" || triggerMode === "lecture") && meetingSupported;
      onRecordingSourceChange(shouldUseMeeting ? "meeting" : "microphone");
      // Call the correct handler directly — don't rely on prop round-trip for useMeeting
      requestAnimationFrame(() => {
        if (shouldUseMeeting) {
          handleMeetingRecordRef.current?.();
        } else {
          handleMicRecordRef.current?.();
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerKey]);

  const handleStop = useCallback(() => {
    if (isMeetingRef.current) {
      handleMeetingStop();
      return;
    }
    // Prevent the live-chunk recorder from restarting and flush its final chunk
    chunkRecorderShouldRestartRef.current = false;
    if (chunkRecorderRef.current?.state === "recording") {
      chunkRecorderRef.current.stop();
    }
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
        audioLevel,
        liveTranscript,
        onStop: handleStop,
      });
    }
  }, [state, elapsed, mode, audioLevel, liveTranscript, handleStop, onRecordingStateChange]);

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPressRef = useRef(false);

  function handlePointerDown() {
    if (state !== "idle") return;
    didLongPressRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      didLongPressRef.current = true;
      setShowModes(true);
    }, 500);
  }

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

  const handledByPointerRef = useRef(false);

  function handlePointerLeave() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function formatTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  }

  if (headless) return null;

  // Ribbon-style UI — click to record, long-press for options
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
        title={state === "recording" ? "Stop recording" : state === "processing" ? "Processing..." : `Record audio (${MODE_LABELS[mode]}${useMeeting ? " — Meeting mode" : ""}) — hold for options`}
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
        <div className="absolute top-0 left-full ml-1 bg-card border border-border rounded-md shadow-lg py-1 z-50 min-w-[160px]">
          <div className="px-3 py-1 text-xs text-muted-foreground uppercase tracking-wider">Source</div>
          {(["meeting", "microphone"] as RecordingSource[]).map((src) => {
            const disabled = src === "meeting" && !meetingSupported;
            const active = src === recordingSource || (src === "microphone" && recordingSource === "meeting" && !meetingSupported);
            return (
              <button
                key={src}
                onClick={() => {
                  if (!disabled) onRecordingSourceChange(src);
                }}
                disabled={disabled}
                className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                  disabled
                    ? "text-muted-foreground/40 cursor-not-allowed"
                    : active
                      ? "text-foreground bg-accent cursor-pointer"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer"
                }`}
                title={disabled ? "Meeting mode not available on this system" : src === "meeting" ? "Captures system audio + microphone" : "Captures microphone only"}
              >
                {SOURCE_LABELS[src]}
                {active && !disabled && (
                  <span className="ml-1 text-xs">✓</span>
                )}
              </button>
            );
          })}
          <div className="border-t border-border my-1" />
          <div className="px-3 py-1 text-xs text-muted-foreground uppercase tracking-wider">Mode</div>
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
