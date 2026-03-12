import { useState } from "react";
import { diffLines, type DiffLine } from "../lib/diff.ts";

type DiffViewMode = "unified" | "split";

interface LocalFileDiffViewProps {
  noteTitle: string;
  cloudContent: string;
  localContent: string;
  onSaveToFile: () => void;
  onUseLocal: () => void;
  onClose: () => void;
}

function DiffLineContent({ line }: { line: DiffLine }) {
  const bgClass =
    line.type === "added"
      ? "bg-green-900/30"
      : line.type === "removed"
        ? "bg-red-900/30"
        : "";
  const textClass =
    line.type === "added"
      ? "text-green-400"
      : line.type === "removed"
        ? "text-red-400"
        : "text-muted-foreground";
  const prefix =
    line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";

  return (
    <div className={`px-3 py-0.5 font-mono text-xs whitespace-pre-wrap ${bgClass}`}>
      <span className={textClass}>
        {prefix} {line.text}
      </span>
    </div>
  );
}

function UnifiedDiff({ diff }: { diff: DiffLine[] }) {
  return (
    <div className="overflow-auto flex-1">
      {diff.map((line, i) => (
        <DiffLineContent key={i} line={line} />
      ))}
    </div>
  );
}

function SplitDiff({ diff }: { diff: DiffLine[] }) {
  const leftLines: (DiffLine | null)[] = [];
  const rightLines: (DiffLine | null)[] = [];

  let i = 0;
  while (i < diff.length) {
    const line = diff[i];
    if (line.type === "same") {
      leftLines.push(line);
      rightLines.push(line);
      i++;
    } else if (line.type === "removed") {
      const removedStart = i;
      while (i < diff.length && diff[i].type === "removed") i++;
      const addedStart = i;
      while (i < diff.length && diff[i].type === "added") i++;

      const removedCount = addedStart - removedStart;
      const addedCount = i - addedStart;
      const maxCount = Math.max(removedCount, addedCount);

      for (let k = 0; k < maxCount; k++) {
        leftLines.push(k < removedCount ? diff[removedStart + k] : null);
        rightLines.push(k < addedCount ? diff[addedStart + k] : null);
      }
    } else {
      leftLines.push(null);
      rightLines.push(line);
      i++;
    }
  }

  return (
    <div className="overflow-auto flex-1 flex">
      <div className="flex-1 border-r border-border min-w-0">
        <div className="px-3 py-1 bg-card border-b border-border text-xs font-medium text-muted-foreground">
          NoteSync
        </div>
        {leftLines.map((line, idx) =>
          line ? (
            <DiffLineContent key={idx} line={line} />
          ) : (
            <div key={idx} className="px-3 py-0.5 font-mono text-xs">&nbsp;</div>
          ),
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="px-3 py-1 bg-card border-b border-border text-xs font-medium text-muted-foreground">
          Local File
        </div>
        {rightLines.map((line, idx) =>
          line ? (
            <DiffLineContent key={idx} line={line} />
          ) : (
            <div key={idx} className="px-3 py-0.5 font-mono text-xs">&nbsp;</div>
          ),
        )}
      </div>
    </div>
  );
}

export function LocalFileDiffView({
  noteTitle,
  cloudContent,
  localContent,
  onSaveToFile,
  onUseLocal,
  onClose,
}: LocalFileDiffViewProps) {
  const [viewMode, setViewMode] = useState<DiffViewMode>("unified");

  const diff = diffLines(cloudContent, localContent);

  const modes: { value: DiffViewMode; label: string }[] = [
    { value: "unified", label: "Unified" },
    { value: "split", label: "Split" },
  ];

  return (
    <div className="flex flex-col h-full" data-testid="local-file-diff-view">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        {/* View mode toggle */}
        <div className="flex rounded-md border border-border overflow-hidden">
          {modes.map((mode) => (
            <button
              key={mode.value}
              onClick={() => setViewMode(mode.value)}
              className={`px-2.5 py-0.5 text-xs transition-colors cursor-pointer ${
                viewMode === mode.value
                  ? "bg-primary text-primary-contrast font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
              data-testid={`diff-mode-${mode.value}`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-border mx-1" />

        <button
          onClick={onSaveToFile}
          className="px-3 py-1 rounded-md bg-primary text-primary-contrast text-xs font-medium hover:bg-primary-hover transition-colors cursor-pointer"
          data-testid="save-to-file-button"
        >
          Save to File
        </button>

        <button
          onClick={onUseLocal}
          className="px-3 py-1 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          data-testid="use-local-button"
        >
          Use Local Version
        </button>

        <button
          onClick={onClose}
          className="px-3 py-1 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          data-testid="close-diff-button"
        >
          Close
        </button>

        <div className="flex-1" />

        <span className="text-xs text-muted-foreground truncate">
          {noteTitle}
        </span>
      </div>

      {/* Content diff */}
      {viewMode === "unified" ? (
        <UnifiedDiff diff={diff} />
      ) : (
        <SplitDiff diff={diff} />
      )}
    </div>
  );
}
