import { useState, useRef, useEffect, useCallback } from "react";
import type { AudioMode, RecordingSource } from "../hooks/useAiSettings.ts";
import type { Note } from "@derekentringer/ns-shared";
import { transcribeAudio } from "../api/ai.ts";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { readFile } from "@tauri-apps/plugin-fs";

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
const MAX_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

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

interface AudioRecorderProps {
  defaultMode: AudioMode;
  recordingSource: RecordingSource;
  onNoteCreated: (note: Note) => void;
  onError: (message: string) => void;
}

type RecorderState = "idle" | "recording" | "processing";

export function AudioRecorder({ defaultMode, recordingSource, onNoteCreated, onError }: AudioRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [mode, setMode] = useState<AudioMode>(defaultMode);
  const [showModes, setShowModes] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [meetingSupported, setMeetingSupported] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const tickUnlistenRef = useRef<(() => void) | null>(null);
  const isMeetingRef = useRef(false);

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
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
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
    isMeetingRef.current = false;
  }, []);

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup]);

  const useMeeting = meetingSupported && recordingSource === "meeting";

  async function handleMeetingRecord() {
    try {
      await invoke("start_meeting_recording");
      isMeetingRef.current = true;
      setState("recording");
      setElapsed(0);

      // Listen for tick events from Rust
      const unlisten = await listen<number>("meeting-recording-tick", (event) => {
        setElapsed(event.payload * 1000); // Convert seconds to ms for formatTime
        if (event.payload * 1000 >= MAX_DURATION_MS) {
          handleStop();
        }
      });
      tickUnlistenRef.current = unlisten;
    } catch (err) {
      cleanup();
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleMeetingStop() {
    try {
      const wavPath = await invoke<string>("stop_meeting_recording");

      // Unlisten ticks
      if (tickUnlistenRef.current) {
        tickUnlistenRef.current();
        tickUnlistenRef.current = null;
      }

      setState("processing");
      isMeetingRef.current = false;

      // Read the WAV file from disk
      const data = await readFile(wavPath);
      const blob = new Blob([data], { type: "audio/wav" });

      try {
        const result = await transcribeAudio(blob, mode);
        onNoteCreated(result.note);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Transcription failed");
      } finally {
        setState("idle");
        setElapsed(0);
      }
    } catch (err) {
      cleanup();
      setState("idle");
      setElapsed(0);
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleMicRecord() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = getSupportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blobType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: blobType });
        cleanup();
        setState("processing");

        try {
          const result = await transcribeAudio(blob, mode);
          onNoteCreated(result.note);
        } catch (err) {
          onError(err instanceof Error ? err.message : "Transcription failed");
        } finally {
          setState("idle");
          setElapsed(0);
        }
      };

      recorder.start(1000);
      startTimeRef.current = Date.now();
      setState("recording");

      timerRef.current = setInterval(() => {
        const ms = Date.now() - startTimeRef.current;
        setElapsed(ms);
        if (ms >= MAX_DURATION_MS) {
          handleStop();
        }
      }, 1000);
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

  function handleStop() {
    if (isMeetingRef.current) {
      handleMeetingStop();
      return;
    }
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function formatTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  }

  if (state === "processing") {
    return (
      <div className="flex items-center gap-2 px-2 py-1 text-sm text-muted-foreground">
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
        </svg>
        Processing...
      </div>
    );
  }

  if (state === "recording") {
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm text-destructive">
          <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
          {formatTime(elapsed)}
        </span>
        <button
          onClick={handleStop}
          className="px-2 py-1 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground hover:border-foreground transition-colors cursor-pointer"
          title="Stop recording"
        >
          Stop
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex items-center" ref={dropdownRef}>
      <button
        onClick={handleRecord}
        className="h-7 px-2 rounded-l-md border border-border text-sm text-muted-foreground hover:text-foreground hover:border-foreground transition-colors flex items-center gap-1 cursor-pointer"
        title={`Record audio (${MODE_LABELS[mode]}${useMeeting ? " — Meeting" : ""})`}
      >
        {useMeeting ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
            <polyline points="17 2 12 7 7 2" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        )}
      </button>
      <button
        onClick={() => setShowModes(!showModes)}
        className="h-7 px-1 rounded-r-md border border-l-0 border-border text-sm text-muted-foreground hover:text-foreground hover:border-foreground transition-colors flex items-center cursor-pointer"
        title="Change recording mode"
        aria-label="Recording mode"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {showModes && (
        <div className="absolute top-full right-0 mt-1 bg-card border border-border rounded-md shadow-lg py-1 z-50 min-w-[160px]">
          {meetingSupported && (
            <>
              <div className="px-3 py-1 text-xs text-muted-foreground uppercase tracking-wider">Source</div>
              {(["microphone", "meeting"] as RecordingSource[]).map((src) => (
                <div
                  key={src}
                  className={`w-full text-left px-3 py-1.5 text-sm transition-colors cursor-pointer ${
                    src === recordingSource
                      ? "text-foreground bg-accent"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                  title={src === "meeting" ? "Captures system audio + microphone via macOS Screen Recording" : undefined}
                >
                  {SOURCE_LABELS[src]}
                  {src === recordingSource && (
                    <span className="ml-1 text-xs">✓</span>
                  )}
                </div>
              ))}
              <div className="border-t border-border my-1" />
            </>
          )}
          <div className="px-3 py-1 text-xs text-muted-foreground uppercase tracking-wider">Mode</div>
          {MODES.map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setShowModes(false);
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
