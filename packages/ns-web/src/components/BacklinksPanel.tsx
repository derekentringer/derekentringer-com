import { useState, useEffect } from "react";
import type { BacklinkInfo } from "@derekentringer/shared/ns";
import { fetchBacklinks } from "../api/offlineNotes.ts";

interface BacklinksPanelProps {
  noteId: string;
  onNavigate: (noteId: string) => void;
}

export function BacklinksPanel({ noteId, onNavigate }: BacklinksPanelProps) {
  const [backlinks, setBacklinks] = useState<BacklinkInfo[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchBacklinks(noteId)
      .then((res) => {
        if (!cancelled) {
          setBacklinks(res.backlinks);
          setHasLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBacklinks([]);
          setHasLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  if (!hasLoaded || backlinks.length === 0) return null;

  return (
    <div className="border-t border-border px-4 py-2" data-testid="backlinks-panel">
      <button
        onClick={() => setIsCollapsed((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left"
      >
        <span
          className="inline-block transition-transform"
          style={{ transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
        >
          ▾
        </span>
        Backlinks ({backlinks.length})
      </button>
      {!isCollapsed && (
        <ul className="mt-1.5 space-y-1">
          {backlinks.map((bl) => (
            <li key={`${bl.noteId}-${bl.linkText}`} className="text-sm">
              <button
                onClick={() => onNavigate(bl.noteId)}
                className="text-primary hover:text-primary-hover transition-colors"
              >
                {bl.noteTitle}
              </button>
              <span className="text-muted-foreground ml-1.5 text-xs">
                via [[{bl.linkText}]]
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
