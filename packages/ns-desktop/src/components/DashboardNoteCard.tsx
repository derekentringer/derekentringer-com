import type { Note } from "@derekentringer/ns-shared";

interface DashboardNoteCardProps {
  note: Note;
  variant: "default" | "hero";
  onClick: (noteId: string) => void;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 8) return `${weeks}w ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

function stripMarkdown(text: string): string {
  return text
    // Remove headings
    .replace(/^#{1,6}\s+/gm, "")
    // Remove bold/italic markers
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/_{1,3}([^_]+)_{1,3}/g, "$1")
    // Remove inline code
    .replace(/`([^`]+)`/g, "$1")
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, "")
    // Remove links but keep text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Remove images
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Remove blockquotes
    .replace(/^>\s+/gm, "")
    // Remove horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, "")
    // Remove strikethrough
    .replace(/~~([^~]+)~~/g, "$1")
    // Remove list markers
    .replace(/^[\s]*[-*+]\s+/gm, "")
    .replace(/^[\s]*\d+\.\s+/gm, "")
    // Remove HTML tags
    .replace(/<[^>]+>/g, "")
    // Collapse multiple newlines/spaces
    .replace(/\n{2,}/g, "\n")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function DashboardNoteCard({ note, variant, onClick }: DashboardNoteCardProps) {
  const contentPreview = stripMarkdown(note.content || "");
  const isHero = variant === "hero";
  const maxTags = 3;
  const visibleTags = note.tags.slice(0, maxTags);
  const overflowCount = note.tags.length - maxTags;

  return (
    <button
      onClick={() => onClick(note.id)}
      className={`text-left bg-card rounded-md border border-border hover:border-primary/50 transition-colors cursor-pointer p-3 ${
        isHero ? "w-full" : "w-[220px] flex-shrink-0"
      }`}
    >
      {/* Title */}
      <h3 className="text-sm font-bold text-foreground truncate">
        {note.title || "Untitled"}
      </h3>

      {/* Content preview */}
      {contentPreview && (
        <p
          className={`text-xs text-muted-foreground mt-1 overflow-hidden ${
            isHero ? "line-clamp-5" : "line-clamp-3"
          }`}
        >
          {contentPreview}
        </p>
      )}

      {/* Tags */}
      {visibleTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {visibleTags.map((tag) => (
            <span
              key={tag}
              className="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary truncate max-w-[80px]"
            >
              {tag}
            </span>
          ))}
          {overflowCount > 0 && (
            <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
              +{overflowCount}
            </span>
          )}
        </div>
      )}

      {/* Folder + date */}
      <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
        {note.folder && (
          <span className="truncate max-w-[120px]">{note.folder}</span>
        )}
        <span className="ml-auto shrink-0">{relativeTime(note.updatedAt)}</span>
      </div>
    </button>
  );
}
