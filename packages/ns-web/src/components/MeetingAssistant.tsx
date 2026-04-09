import type { MeetingContextNote } from "../api/ai.ts";

interface MeetingAssistantProps {
  isRecording: boolean;
  isSearching: boolean;
  liveTranscript: string;
  relevantNotes: MeetingContextNote[];
  onSelectNote: (noteId: string) => void;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  if (diffMs < 0) return "just now";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function scoreLabel(score: number): string {
  return `${Math.round(score * 100)}%`;
}

export function MeetingAssistant({
  isRecording,
  isSearching,
  liveTranscript,
  relevantNotes,
  onSelectNote,
}: MeetingAssistantProps) {
  const hasTranscript = liveTranscript.length > 0;
  const hasNotes = relevantNotes.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          {isRecording && (
            <span className="h-2 w-2 rounded-full bg-destructive animate-pulse shrink-0" />
          )}
          <h2 className="text-sm font-semibold text-foreground">Meeting Assistant</h2>
          {isSearching && (
            <svg className="animate-spin h-3 w-3 text-muted-foreground shrink-0 ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
            </svg>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {!isRecording && !hasNotes ? (
          /* Idle state */
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/40">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            <p className="text-sm text-muted-foreground">Start a recording</p>
            <p className="text-xs text-muted-foreground/60 text-center">
              Your relevant notes will appear here as topics come up in the conversation.
            </p>
          </div>
        ) : isRecording && !hasTranscript ? (
          /* Listening, waiting for transcript */
          <div className="flex flex-col items-center justify-center py-12 gap-2 animate-fade-in">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/40">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            <p className="text-sm text-muted-foreground">Listening...</p>
            <p className="text-xs text-muted-foreground/60 text-center">
              Waiting for conversation context to build up.
            </p>
          </div>
        ) : isRecording && hasTranscript && !hasNotes ? (
          /* Has transcript but no matching notes yet */
          <div className="flex flex-col items-center justify-center py-12 gap-2 animate-fade-in">
            <svg className="animate-spin h-5 w-5 text-muted-foreground/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
            </svg>
            <p className="text-sm text-muted-foreground">Searching your notes...</p>
            <p className="text-xs text-muted-foreground/60 text-center">
              Looking for notes related to the current discussion.
            </p>
          </div>
        ) : (
          /* Note cards */
          <div className="space-y-2 animate-fade-in">
            {relevantNotes.map((note, index) => (
              <button
                key={note.id}
                onClick={() => onSelectNote(note.id)}
                className="w-full text-left bg-card rounded-md border border-border hover:border-primary/50 p-3 transition-colors cursor-pointer animate-fade-in"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* Title + score */}
                <div className="flex items-start gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0 mt-0.5">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <h3 className="text-sm font-medium text-foreground flex-1 truncate">
                    {note.title}
                  </h3>
                  <span className="text-[10px] text-primary/70 shrink-0 tabular-nums">
                    {scoreLabel(note.score)}
                  </span>
                </div>

                {/* Snippet */}
                {note.snippet && (
                  <p className="text-xs text-foreground/45 mt-1 line-clamp-2 ml-[22px]">
                    {note.snippet}
                  </p>
                )}

                {/* Date */}
                <div className="flex items-center mt-1.5 ml-[22px]">
                  <span className="text-[10px] text-muted-foreground">
                    {relativeTime(note.updatedAt)}
                  </span>
                </div>
              </button>
            ))}

            {/* Searching indicator at bottom when we already have notes */}
            {isSearching && hasNotes && (
              <div className="flex items-center justify-center gap-2 py-2 text-muted-foreground/50">
                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                </svg>
                <span className="text-[10px]">Searching for more...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer — live transcript preview */}
      {isRecording && hasTranscript && (
        <div className="px-3 py-2 border-t border-border shrink-0">
          <p className="text-[10px] text-muted-foreground/60 line-clamp-2">
            {liveTranscript.slice(-200)}
          </p>
        </div>
      )}
    </div>
  );
}
