import { useState, useEffect } from "react";
import type { NoteVersion } from "@derekentringer/shared/ns";
import { fetchVersions } from "../api/offlineNotes.ts";

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(dateStr).toLocaleDateString();
}

interface VersionHistoryPanelProps {
  noteId: string;
  onSelectVersion: (version: NoteVersion) => void;
  selectedVersionId?: string;
  refreshKey?: number;
}

export function VersionHistoryPanel({
  noteId,
  onSelectVersion,
  selectedVersionId,
  refreshKey,
}: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<NoteVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const result = await fetchVersions(noteId);
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
        {versions.map((version) => (
          <button
            key={version.id}
            onClick={() => onSelectVersion(version)}
            className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
              selectedVersionId === version.id
                ? "bg-primary text-primary-contrast"
                : "text-foreground hover:bg-accent"
            }`}
            data-testid="version-item"
          >
            <div className="font-medium truncate">{version.title || "Untitled"}</div>
            <div
              className={`text-xs mt-0.5 ${
                selectedVersionId === version.id
                  ? "text-primary-contrast/70"
                  : "text-muted-foreground"
              }`}
            >
              {formatRelativeTime(version.createdAt)}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
