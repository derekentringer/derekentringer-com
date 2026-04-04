import type { AudioMode } from "../hooks/useAiSettings.ts";
import { AudioWaveform } from "./AudioWaveform.tsx";

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
  onStop: () => void;
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export function RecordingBar({ state, elapsed, mode, stream, onStop }: RecordingBarProps) {
  if (state === "processing") {
    return (
      <div className="h-9 px-4 bg-sidebar border-b border-border flex items-center gap-3 shrink-0">
        <svg className="animate-spin h-4 w-4 text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
        </svg>
        <span className="text-xs text-muted-foreground">Processing transcription...</span>
      </div>
    );
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
      <span className="text-[10px] text-muted-foreground shrink-0">{MODE_LABELS[mode]}</span>

      <div className="flex-1" />

      {/* Stop button */}
      <button
        onClick={onStop}
        className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:border-foreground transition-colors cursor-pointer"
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
