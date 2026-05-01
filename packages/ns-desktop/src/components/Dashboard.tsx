import { useState, useEffect } from "react";
import type { Note } from "@derekentringer/ns-shared";
import { fetchRecentlyEditedNotes, fetchFavoriteNotes, fetchAudioNotes } from "../lib/db.ts";
import { DashboardNoteCard } from "./DashboardNoteCard.tsx";
import { DashboardSection } from "./DashboardSection.tsx";
import type { AudioMode } from "../hooks/useAiSettings.ts";

interface DashboardProps {
  onSelectNote: (noteId: string) => void;
  onCreateNote: () => void;
  /** Caller passes the recording mode so the dashboard can wire
   *  separate Meeting / Lecture / Memo / Verbatim tiles directly
   *  to `recordTrigger` without going through a generic "open the
   *  recorder" button. */
  onStartRecording: (mode: AudioMode) => void;
  audioNotesEnabled: boolean;
  refreshKey?: number;
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
  audioNotesEnabled,
  refreshKey = 0,
}: DashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [recentlyEdited, favs, audio] = await Promise.all([
          fetchRecentlyEditedNotes(10),
          fetchFavoriteNotes(),
          fetchAudioNotes(10),
        ]);
        if (!cancelled) {
          setData({
            recentlyEdited,
            favorites: favs,
            audioNotes: audio,
          });
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
  }, [refreshKey]);

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto min-w-0 p-4 space-y-4 animate-pulse">
        {/* Quick Actions skeleton */}
        <div>
          <div className="h-4 w-24 bg-subtle rounded mb-2" />
          <div className="flex gap-3">
            {[1, 2].map((i) => (
              <div key={i} className="bg-card rounded-md border border-border p-4 min-w-[100px] flex flex-col items-center gap-2">
                <div className="w-5 h-5 bg-subtle rounded" />
                <div className="h-3 w-14 bg-subtle rounded" />
              </div>
            ))}
          </div>
        </div>

        {/* Resume Editing skeleton */}
        <div>
          <div className="h-4 w-28 bg-subtle rounded mb-2" />
          <div className="bg-card rounded-md border border-border p-3 w-full">
            <div className="h-4 w-40 bg-subtle rounded mb-2" />
            <div className="space-y-1.5">
              <div className="h-3 w-full bg-subtle rounded" />
              <div className="h-3 w-4/5 bg-subtle rounded" />
              <div className="h-3 w-3/5 bg-subtle rounded" />
            </div>
            <div className="flex gap-1 mt-2">
              <div className="h-4 w-12 bg-subtle rounded-full" />
              <div className="h-4 w-14 bg-subtle rounded-full" />
            </div>
          </div>
        </div>

        {/* Card row skeleton */}
        <div>
          <div className="h-4 w-20 bg-subtle rounded mb-2" />
          <div className="flex gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-card rounded-md border border-border p-3 w-[220px] flex-shrink-0">
                <div className="h-4 w-28 bg-subtle rounded mb-2" />
                <div className="space-y-1.5">
                  <div className="h-3 w-full bg-subtle rounded" />
                  <div className="h-3 w-3/4 bg-subtle rounded" />
                </div>
                <div className="flex gap-1 mt-2">
                  <div className="h-4 w-10 bg-subtle rounded-full" />
                  <div className="h-4 w-12 bg-subtle rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Second card row skeleton */}
        <div>
          <div className="h-4 w-32 bg-subtle rounded mb-2" />
          <div className="flex gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-card rounded-md border border-border p-3 w-[220px] flex-shrink-0">
                <div className="h-4 w-24 bg-subtle rounded mb-2" />
                <div className="space-y-1.5">
                  <div className="h-3 w-full bg-subtle rounded" />
                  <div className="h-3 w-2/3 bg-subtle rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const heroNote = data?.recentlyEdited[0] ?? null;
  const remainingRecent = data?.recentlyEdited.slice(1) ?? [];

  return (
    <div className="flex-1 overflow-y-auto min-w-0 p-4 space-y-4">
      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-2">Quick Actions</h2>
        <div className="flex gap-3 flex-wrap">
          {/* New Note — always available, even when AI / Audio
              Notes are off. Sits first so the no-AI-tools case
              still surfaces a useful action. */}
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

          {/* Meeting / Lecture / Memo / Verbatim — only when Audio
              Notes is on. Each tile fires `onStartRecording(mode)`
              which the parent forwards to `recordTrigger` so the
              recorder starts in the right preset. */}
          {audioNotesEnabled && (
            <>
              <button
                onClick={() => onStartRecording("meeting")}
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
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span className="text-xs text-foreground">Meeting</span>
              </button>

              <button
                onClick={() => onStartRecording("lecture")}
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
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                  <path d="M6 12v5c3 3 9 3 12 0v-5" />
                </svg>
                <span className="text-xs text-foreground">Lecture</span>
              </button>

              <button
                onClick={() => onStartRecording("memo")}
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
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
                <span className="text-xs text-foreground">Memo</span>
              </button>

              <button
                onClick={() => onStartRecording("verbatim")}
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
                  <path d="M3 21c3-3 6-6 6-9a4 4 0 0 0-8 0c0 3 3 6 2 9z" />
                  <path d="M14 21c3-3 6-6 6-9a4 4 0 0 0-8 0c0 3 3 6 2 9z" />
                </svg>
                <span className="text-xs text-foreground">Verbatim</span>
              </button>
            </>
          )}
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
