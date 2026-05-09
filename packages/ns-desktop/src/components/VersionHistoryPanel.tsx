import { useState, useEffect, useMemo } from "react";
import type { NoteVersion } from "@derekentringer/ns-shared";
import { listVersions } from "../lib/db.ts";
import { diffLines, diffStats } from "../lib/diff.ts";

/** Relative-time ladder used by the version-history list. Identical
 *  shape on web, desktop, and mobile so a row reads the same on
 *  every device. Goes down to per-minute precision and never falls
 *  back to a raw date — older versions roll up into weeks, months,
 *  then years. */
function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;

  if (diff < 0) return "just now";

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return minutes === 1 ? "1 min ago" : `${minutes} mins ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return hours === 1 ? "1 hr ago" : `${hours} hrs ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 14) return days === 1 ? "1 day ago" : `${days} days ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 8) return `${weeks} wks ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mos ago`;

  const years = Math.floor(days / 365);
  return years === 1 ? "1 yr ago" : `${years} yrs ago`;
}

function formatFullTimestamp(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

function originLabel(origin: string): string {
  if (!origin) return "Edit";
  return origin
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

interface VersionHistoryPanelProps {
  noteId: string;
  onSelectVersion: (version: NoteVersion) => void;
  selectedVersionId?: string;
  refreshKey?: number;
  /** Current note title — used for the "Title changed" badge on
   *  rows whose title differs from the live note. */
  currentTitle?: string;
  /** Current note content — used to compute the "+N −M" diff stats
   *  shown on each row. */
  currentContent?: string;
}

export function VersionHistoryPanel({
  noteId,
  onSelectVersion,
  selectedVersionId,
  refreshKey,
  currentTitle,
  currentContent,
}: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<NoteVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Pre-compute diff stats vs. current content for every version so
  // each row can show a "+N −M" summary. Cheap on small notes; we
  // only re-run when versions or current content change.
  const statsByVersion = useMemo(() => {
    const map = new Map<string, { added: number; removed: number }>();
    if (currentContent === undefined) return map;
    for (const v of versions) {
      map.set(v.id, diffStats(diffLines(v.content, currentContent)));
    }
    return map;
  }, [versions, currentContent]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const result = await listVersions(noteId);
        if (!cancelled) {
          setVersions(result.versions);
        }
      } catch {
        if (!cancelled) {
          setVersions([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [noteId, refreshKey]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 bg-background h-full" data-testid="version-history-panel">
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 bg-background h-full" data-testid="version-history-panel">
        <span className="text-sm text-muted-foreground">No versions yet</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background" data-testid="version-history-panel">
      <div className="px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Version History
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {versions.map((version) => {
          const isSelected = selectedVersionId === version.id;
          const stats = statsByVersion.get(version.id);
          const titleChanged =
            currentTitle !== undefined && version.title !== currentTitle;
          const noChanges = stats && stats.added === 0 && stats.removed === 0;
          return (
            <button
              key={version.id}
              onClick={() => onSelectVersion(version)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors cursor-pointer ${
                isSelected
                  ? "bg-primary text-primary-contrast"
                  : "text-foreground hover:bg-accent"
              }`}
              data-testid="version-item"
              title={formatFullTimestamp(version.createdAt)}
            >
              <div className="font-medium truncate">{version.title || "Untitled"}</div>
              <div
                className={`text-xs mt-0.5 ${
                  isSelected ? "text-primary-contrast/70" : "text-muted-foreground"
                }`}
              >
                <span>{formatFullTimestamp(version.createdAt)}</span>
                <span className="mx-1">·</span>
                <span>{formatRelativeTime(version.createdAt)}</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                <span
                  className={`text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded border ${
                    isSelected
                      ? "border-primary-contrast/30 text-primary-contrast/80"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {originLabel(version.origin)}
                </span>
                {titleChanged ? (
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      isSelected
                        ? "bg-primary-contrast/20 text-primary-contrast"
                        : "bg-amber-500/15 text-amber-500"
                    }`}
                  >
                    Title changed
                  </span>
                ) : null}
                {stats ? (
                  noChanges ? (
                    <span
                      className={`text-[11px] font-mono ${
                        isSelected
                          ? "text-primary-contrast/70"
                          : "text-muted-foreground"
                      }`}
                    >
                      No changes
                    </span>
                  ) : (
                    <span className="text-[11px] font-mono">
                      {stats.added > 0 ? (
                        <span
                          className={
                            isSelected ? "text-primary-contrast" : "text-green-400"
                          }
                        >
                          +{stats.added}
                        </span>
                      ) : null}
                      {stats.added > 0 && stats.removed > 0 ? " " : null}
                      {stats.removed > 0 ? (
                        <span
                          className={
                            isSelected ? "text-primary-contrast" : "text-red-400"
                          }
                        >
                          −{stats.removed}
                        </span>
                      ) : null}
                    </span>
                  )
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
