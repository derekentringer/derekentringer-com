import { useState, useEffect } from "react";
import type { BacklinkInfo } from "@derekentringer/ns-shared";
import { getBacklinks } from "../lib/db.ts";
import { useResizable } from "../hooks/useResizable.ts";
import { ResizeDivider } from "./ResizeDivider.tsx";

interface BacklinksPanelProps {
  noteId: string;
  onNavigate: (noteId: string) => void;
}

export function BacklinksPanel({ noteId, onNavigate }: BacklinksPanelProps) {
  const [backlinks, setBacklinks] = useState<BacklinkInfo[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem("ns-backlinks-collapsed") === "true";
    } catch {
      return false;
    }
  });

  const { size, isDragging, onPointerDown } = useResizable({
    direction: "horizontal",
    initialSize: 150,
    minSize: 80,
    maxSize: 400,
    storageKey: "ns-backlinks-height",
    invert: true,
  });

  useEffect(() => {
    let cancelled = false;
    getBacklinks(noteId)
      .then((res) => {
        if (!cancelled) {
          setBacklinks(res);
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
    <div data-testid="backlinks-panel">
      {!isCollapsed && (
        <ResizeDivider
          direction="horizontal"
          isDragging={isDragging}
          onPointerDown={onPointerDown}
        />
      )}
      <div className="border-t border-border px-4 py-2">
        <button
          onClick={() => setIsCollapsed((v) => {
            const next = !v;
            try { localStorage.setItem("ns-backlinks-collapsed", String(next)); } catch {}
            return next;
          })}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left cursor-pointer"
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
          <ul
            className="mt-1.5 space-y-1 overflow-y-auto"
            style={{ height: size }}
          >
            {backlinks.map((bl) => (
              <li key={`${bl.noteId}-${bl.linkText}`} className="text-sm">
                <button
                  onClick={() => onNavigate(bl.noteId)}
                  className="text-primary hover:text-primary-hover transition-colors cursor-pointer"
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
    </div>
  );
}
