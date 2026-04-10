import { useState, useEffect } from "react";
import type { AudioMode } from "../hooks/useAiSettings.ts";
import { AudioWaveform } from "./AudioWaveform.tsx";
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
  folderId?: string;
  folders?: FolderOption[];
  onFolderChange?: (folderId: string | null) => void;
  onStop: () => void;
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

export function RecordingBar({ state, elapsed, mode, stream, folderId, folders, onFolderChange, onStop }: RecordingBarProps) {
  if (state === "processing") {
    return <ProcessingStatus />;
  }

  return (
    <div className="h-9 px-4 bg-sidebar border-b border-border flex items-center gap-2 shrink-0">
      {/* Recording indicator */}
      <span className="h-2 w-2 rounded-full bg-destructive animate-pulse shrink-0" />

      {/* Elapsed time */}
      <span className="text-xs text-foreground tabular-nums shrink-0">{formatTime(elapsed)}</span>

      {/* Waveform */}
      <AudioWaveform stream={stream} isRecording={true} width={80} height={20} />

      {/* Mode label */}
      <span className="text-xs text-foreground shrink-0">{MODE_LABELS[mode]}</span>

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

      {/* Stop button */}
      <button
        onClick={onStop}
        className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-destructive/40 text-xs text-destructive/60 hover:text-destructive hover:border-destructive transition-colors cursor-pointer"
        title="Stop recording"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <rect x="4" y="4" width="16" height="16" rx="2" />
        </svg>
        Stop
      </button>
    </div>
  );
}
