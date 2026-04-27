// Phase E.3: serialize an AI Assistant chat session into a Markdown
// note body suitable for createNote(). Source citations Claude emitted
// inline as `[Note Title]` are converted to `[[Note Title]]` wiki-links
// so the resulting note stays connected to the cited sources.
//
// Besides inline `[Title]` prose citations, two other ways the chat
// links to notes are also preserved:
// - `noteCards`: clickable pills attached to assistant turns (from
//   search_notes, /recent, /favorites, etc.)
// - `sources`: Q&A citation pills (from the Q&A flow)
// Both are serialized as a "Referenced notes:" bullet list of
// [[wiki-links]] at the end of their assistant turn.
//
// The serializer is panel-agnostic: callers pass the messages array
// they're already keeping in component state.

export interface ExportMessage {
  role: string;
  content: string;
  meetingData?: {
    mode?: string;
    noteTitle?: string;
    status?: string;
  };
  /** Clickable note pills attached to an assistant turn (search
   *  results, /recent, /favorites, etc.). Each becomes a wiki-link
   *  under the turn in the exported markdown. */
  noteCards?: { id: string; title: string }[];
  /** Q&A citation sources — the "related notes" pills that appear
   *  below answered questions. Also become wiki-links in the export. */
  sources?: { id: string; title: string }[];
}

export interface ExportOptions {
  /** Title that will land in the note metadata; included as the H1. */
  title: string;
  /** ISO-ish timestamp printed at the top, e.g. new Date().toISOString(). */
  timestamp?: string;
}

const CITE_RE = /\[([^\]]+)\]/g;

/** Convert `[Title]` citations into `[[Title]]` wiki-links so the
 *  exported note stays linked to the cited sources in the editor. */
function citationsToWikiLinks(text: string): string {
  return text.replace(CITE_RE, (_full, title) => `[[${title}]]`);
}

/** Deduplicate pills by title (case-sensitive exact match — these
 *  come from the UI where titles are canonical). */
function collectReferencedTitles(m: ExportMessage): string[] {
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const c of m.noteCards ?? []) {
    if (c.title && !seen.has(c.title)) {
      seen.add(c.title);
      titles.push(c.title);
    }
  }
  for (const s of m.sources ?? []) {
    if (s.title && !seen.has(s.title)) {
      seen.add(s.title);
      titles.push(s.title);
    }
  }
  return titles;
}

/** Serialize a panel chat session to Markdown. Skips empty turns and
 *  confirmation cards (they have no user-meaningful content once the
 *  action resolved). */
export function serializeChatToMarkdown(
  messages: ExportMessage[],
  options: ExportOptions,
): string {
  const lines: string[] = [];
  lines.push(`# ${options.title}`);
  lines.push("");
  if (options.timestamp) {
    lines.push(`*Exported ${options.timestamp}*`);
    lines.push("");
  }

  for (const m of messages) {
    if (m.role === "user") {
      const content = m.content.trim();
      if (!content) continue;
      lines.push(`## You`);
      lines.push("");
      lines.push(content);
      lines.push("");
    } else if (m.role === "assistant") {
      const content = m.content.trim();
      const refs = collectReferencedTitles(m);
      // An assistant turn is worth including if it has ANY of:
      // prose content, clickable note cards, or Q&A sources.
      if (!content && refs.length === 0) continue;
      lines.push(`## Assistant`);
      lines.push("");
      if (content) {
        lines.push(citationsToWikiLinks(content));
        lines.push("");
      }
      if (refs.length > 0) {
        lines.push(`**Referenced notes:**`);
        for (const title of refs) {
          lines.push(`- [[${title}]]`);
        }
        lines.push("");
      }
    } else if (m.role === "meeting-summary" && m.meetingData) {
      const mode = m.meetingData.mode ?? "recording";
      const noteTitle = m.meetingData.noteTitle;
      lines.push(`## Meeting`);
      lines.push("");
      if (noteTitle) {
        lines.push(`A ${mode} recording ended — captured in [[${noteTitle}]].`);
      } else if (m.meetingData.status === "failed") {
        lines.push(`A ${mode} recording ended; note generation failed.`);
      } else {
        lines.push(`A ${mode} recording ended; note generation in progress.`);
      }
      lines.push("");
    }
  }

  return lines.join("\n").trim() + "\n";
}

/** Default export title: "Chat — Apr 23, 2026 at 5:24 PM". */
export function defaultChatTitle(now: Date = new Date()): string {
  const date = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `Chat — ${date} at ${time}`;
}
