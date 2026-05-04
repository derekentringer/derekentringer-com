import { useState, useEffect, useRef } from "react";
import type { AudioMode } from "../hooks/useAiSettings.ts";
import { useAudioLevel } from "../hooks/useAudioLevel.ts";
import { FolderPicker, type FolderOption } from "./FolderPicker.tsx";

const MODE_LABELS: Record<AudioMode, string> = {
  meeting: "Meeting",
  lecture: "Lecture",
  memo: "Memo",
  verbatim: "Verbatim",
};

interface RecordingBarProps {
  state: "recording" | "processing";
  elapsed: number;
  mode: AudioMode;
  stream: MediaStream | null;
  audioLevel?: number;
  folderId?: string;
  folders?: FolderOption[];
  onFolderChange?: (folderId: string | null) => void;
  onStop: () => void;
  /** Discard the in-progress recording without producing a note. */
  onCancel: () => void;
  /** True when this session is mixing system audio + mic (meeting
   *  mode). Drives the "MIC & SYSTEM CAPTURE" badge label/tooltip. */
  isMeetingCapture?: boolean;
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

const PROCESSING_STEPS = [
  "Preparing audio for transcription...",
  "Sending audio to Whisper AI...",
  "Transcribing speech to text...",
  "Structuring transcript with AI...",
  "Generating title and tags...",
  "Generating note...",
];

function ProcessingStatus() {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, PROCESSING_STEPS.length - 1));
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="h-9 px-4 bg-sidebar border-b border-border flex items-center gap-3 shrink-0">
      <span className="flex items-end gap-0.5 text-primary shrink-0 h-4 w-4 justify-center">
        <span className="bounce-dot" />
        <span className="bounce-dot" />
        <span className="bounce-dot" />
      </span>
      <span key={stepIndex} className="text-xs text-foreground animate-fade-in">
        {PROCESSING_STEPS[stepIndex]}
      </span>
    </div>
  );
}

function getPrimaryRgb(): [number, number, number] {
  const hex = getComputedStyle(document.documentElement).getPropertyValue("--color-primary").trim();
  if (hex.startsWith("#") && hex.length >= 7) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }
  return [212, 225, 87];
}

export function RecordingBar({ state, elapsed, mode, stream, audioLevel, folderId, folders, onFolderChange, onStop, onCancel, isMeetingCapture }: RecordingBarProps) {
  const level = useAudioLevel(stream, state === "recording", audioLevel);
  const borderRef = useRef<HTMLDivElement>(null);
  const primaryRgbRef = useRef<[number, number, number]>(getPrimaryRgb());

  useEffect(() => {
    primaryRgbRef.current = getPrimaryRgb();
  }, []);

  useEffect(() => {
    if (borderRef.current) {
      const [r, g, b] = primaryRgbRef.current;
      const opacity = 0.15 + level * 0.85;
      borderRef.current.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
  }, [level]);

  if (state === "processing") {
    return <ProcessingStatus />;
  }

  return (
    <div className="h-9 bg-sidebar flex flex-col shrink-0">
      {/* Top border — pulses with waveform */}
      <div
        ref={borderRef}
        className="h-px w-full transition-colors duration-75"
        style={{ backgroundColor: `rgba(${primaryRgbRef.current.join(", ")}, 0.15)` }}
      />

      <div className="flex-1 flex items-center gap-4">
        {/* Cancel + Stop grouped together (mirrors mobile
            RecordingScreen). The outer row uses `gap-4` for breathing
            room around the rest of the controls; this inner pair sits
            flush so they read as one transport-control cluster. */}
        <div className="flex items-center h-full shrink-0">
          {/* Cancel button — confirm before discarding to protect
              against stray clicks killing a long recording. */}
          <button
            onClick={() => {
              if (window.confirm("Discard this recording? Your audio and transcript will be lost.")) {
                onCancel();
              }
            }}
            className="flex items-center gap-1 h-full px-3 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer shrink-0"
            title="Cancel recording"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            <span>Cancel</span>
          </button>

          {/* Stop button with pulsing recording dot */}
          <button
            onClick={onStop}
            className="flex items-center gap-1.5 h-full px-3 text-xs text-foreground hover:bg-destructive/10 transition-colors cursor-pointer shrink-0"
            title="Stop recording"
          >
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive" />
            </span>
            <span>Stop</span>
          </button>
        </div>

        {/* Elapsed time */}
        <span className="text-xs text-foreground tabular-nums shrink-0">{formatTime(elapsed)}</span>

        {/* Mode label */}
        <span className="text-xs text-foreground shrink-0">{MODE_LABELS[mode]}</span>

        {/* Capture-source badge — "MIC CAPTURE" for mic-only sessions,
            "MIC & SYSTEM CAPTURE" when Rust is also tapping system audio
            via CoreAudio (macOS) / WASAPI loopback (Windows). */}
        <CaptureBadge isMeetingCapture={!!isMeetingCapture} />

        {/* Folder picker */}
        {folders && onFolderChange && (
          <FolderPicker
            selectedId={folderId ?? null}
            folders={folders}
            onChange={onFolderChange}
            emptyLabel="All Notes"
            iconSize={10}
            textSize="text-xs"
            showLabel
            className="text-foreground"
            ariaLabel="Recording folder"
          />
        )}
      </div>

      {/* Bottom border — static */}
      <div className="h-px w-full bg-border" />
    </div>
  );
}

/** Capture-source badge with hover/click popover. Shows "MIC CAPTURE"
 *  when only the mic is being recorded, "MIC & SYSTEM CAPTURE" when
 *  Rust is also tapping system audio via CoreAudio/WASAPI. The
 *  popover explains which sources are active and points the user at
 *  Settings to change the recording-source preference. */
function CaptureBadge({ isMeetingCapture }: { isMeetingCapture: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const label = isMeetingCapture ? "Mic & System Capture" : "Mic Capture";
  const tooltip = isMeetingCapture
    ? "Capturing audio from device microphone and system audio. You can change this in the settings."
    : "Capturing audio from device microphone. System audio is disabled. You can change this in the settings.";

  return (
    <div
      ref={ref}
      className="relative shrink-0 inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded bg-primary/15 text-primary cursor-help"
        aria-expanded={open}
        aria-label={`${label} — what does this mean?`}
      >
        {label}
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute top-full left-0 mt-1 w-72 z-20 px-3 py-2 rounded-md bg-card border border-border shadow-lg text-xs text-foreground leading-relaxed"
        >
          {tooltip}
        </div>
      )}
    </div>
  );
}
