import { useState, useEffect } from "react";
import type { Note } from "@derekentringer/shared/ns";
import { fetchDashboardData } from "../api/notes.ts";
import { DashboardNoteCard } from "./DashboardNoteCard.tsx";
import { DashboardSection } from "./DashboardSection.tsx";

interface DashboardProps {
  onSelectNote: (noteId: string) => void;
  onCreateNote: () => void;
  onStartRecording: () => void;
  onImportFile: () => void;
  audioNotesEnabled: boolean;
}

interface DashboardData {
  recentlyEdited: Note[];
  favorites: Note[];
  audioNotes: Note[];
}

export function Dashboard({
  onSelectNote,
  onCreateNote,
  onStartRecording,
  onImportFile,
  audioNotesEnabled,
}: DashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await fetchDashboardData();
        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        console.error("Failed to fetch dashboard data:", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <svg
          className="animate-spin h-6 w-6 text-primary"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      </div>
    );
  }

  const heroNote = data?.recentlyEdited[0] ?? null;
  const remainingRecent = data?.recentlyEdited.slice(1) ?? [];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-2">Quick Actions</h2>
        <div className="flex gap-3">
          {/* New Note */}
          <button
            onClick={onCreateNote}
            className="bg-card rounded-md border border-border hover:border-primary/50 p-4 flex flex-col items-center gap-2 cursor-pointer min-w-[100px] transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span className="text-xs text-foreground">New Note</span>
          </button>

          {/* New Recording */}
          <button
            onClick={audioNotesEnabled ? onStartRecording : undefined}
            className={`bg-card rounded-md border border-border p-4 flex flex-col items-center gap-2 min-w-[100px] transition-colors ${
              audioNotesEnabled
                ? "hover:border-primary/50 cursor-pointer"
                : "opacity-40 cursor-not-allowed"
            }`}
            disabled={!audioNotesEnabled}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary"
            >
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            <span className="text-xs text-foreground">New Recording</span>
          </button>

          {/* Import File */}
          <button
            onClick={onImportFile}
            className="bg-card rounded-md border border-border hover:border-primary/50 p-4 flex flex-col items-center gap-2 cursor-pointer min-w-[100px] transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span className="text-xs text-foreground">Import File</span>
          </button>
        </div>
      </div>

      {/* Resume Editing (hero card) */}
      {heroNote && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-2">Resume Editing</h2>
          <DashboardNoteCard
            note={heroNote}
            variant="hero"
            onClick={onSelectNote}
          />
        </div>
      )}

      {/* Favorites */}
      {data && data.favorites.length > 0 && (
        <DashboardSection title="Favorites">
          {data.favorites.map((note) => (
            <DashboardNoteCard
              key={note.id}
              note={note}
              variant="default"
              onClick={onSelectNote}
            />
          ))}
        </DashboardSection>
      )}

      {/* Recently Edited (skip hero) */}
      {remainingRecent.length > 0 && (
        <DashboardSection title="Recently Edited">
          {remainingRecent.map((note) => (
            <DashboardNoteCard
              key={note.id}
              note={note}
              variant="default"
              onClick={onSelectNote}
            />
          ))}
        </DashboardSection>
      )}

      {/* Audio Notes */}
      {audioNotesEnabled && data && data.audioNotes.length > 0 && (
        <DashboardSection title="Audio Notes">
          {data.audioNotes.map((note) => (
            <DashboardNoteCard
              key={note.id}
              note={note}
              variant="default"
              onClick={onSelectNote}
            />
          ))}
        </DashboardSection>
      )}
    </div>
  );
}
