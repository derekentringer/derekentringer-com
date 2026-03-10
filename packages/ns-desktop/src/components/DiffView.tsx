import { useState } from "react";
import type { NoteVersion } from "@derekentringer/ns-shared";
import { diffLines, type DiffLine } from "../lib/diff.ts";

type DiffViewMode = "unified" | "split";

interface DiffViewProps {
  version: NoteVersion;
  currentTitle: string;
  currentContent: string;
  onRestore: () => void;
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
  // Build paired rows for side-by-side display
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
      // Pair removed with following added lines
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
      // Added without preceding removed
      leftLines.push(null);
      rightLines.push(line);
      i++;
    }
  }

  return (
    <div className="overflow-auto flex-1 flex">
      <div className="flex-1 border-r border-border min-w-0">
        <div className="px-3 py-1 bg-card border-b border-border text-xs font-medium text-muted-foreground">
          Version
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
          Current
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

export function DiffView({
  version,
  currentTitle,
  currentContent,
  onRestore,
  onClose,
}: DiffViewProps) {
  const [viewMode, setViewMode] = useState<DiffViewMode>("unified");
  const [confirmRestore, setConfirmRestore] = useState(false);

  const contentDiff = diffLines(version.content, currentContent);
  const titleChanged = version.title !== currentTitle;
  const titleDiff = titleChanged
    ? diffLines(version.title, currentTitle)
    : null;

  const modes: { value: DiffViewMode; label: string }[] = [
    { value: "unified", label: "Unified" },
    { value: "split", label: "Split" },
  ];

  function handleRestore() {
    if (!confirmRestore) {
      setConfirmRestore(true);
      return;
    }
    onRestore();
  }

  return (
    <div className="flex flex-col h-full" data-testid="diff-view">
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

        {confirmRestore ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Restore?</span>
            <button
              onClick={handleRestore}
              className="px-3 py-1 rounded-md bg-primary text-primary-contrast text-xs font-medium hover:bg-primary-hover transition-colors cursor-pointer"
              data-testid="confirm-restore"
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirmRestore(false)}
              className="px-3 py-1 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={handleRestore}
            className="px-3 py-1 rounded-md bg-primary text-primary-contrast text-xs font-medium hover:bg-primary-hover transition-colors cursor-pointer"
            data-testid="restore-button"
          >
            Restore this version
          </button>
        )}

        <button
          onClick={onClose}
          className="px-3 py-1 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          data-testid="close-diff"
        >
          Close
        </button>

        <div className="flex-1" />

        <span className="text-xs text-muted-foreground">
          {new Date(version.createdAt).toLocaleString()}
        </span>
      </div>

      {/* Title diff */}
      {titleDiff && (
        <div className="px-4 py-2 border-b border-border">
          <div className="text-xs font-medium text-muted-foreground mb-1">Title changed</div>
          {titleDiff.map((line, i) => (
            <DiffLineContent key={i} line={line} />
          ))}
        </div>
      )}

      {/* Content diff */}
      {viewMode === "unified" ? (
        <UnifiedDiff diff={contentDiff} />
      ) : (
        <SplitDiff diff={contentDiff} />
      )}
    </div>
  );
}
