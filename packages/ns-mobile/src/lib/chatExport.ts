// Phase A.5 (mobile parity): serialize a chat session to a Markdown
// note body. Used by the `/savechat` slash command.
//
// Mirror of `packages/ns-{web,desktop}/src/lib/chatExport.ts`. Inline
// `[Note Title]` prose citations become `[[Note Title]]` wiki-links so
// the resulting note stays connected to the cited sources. NoteCard
// pills + Q&A source pills are appended as a "Referenced notes:"
// wiki-link list at the end of their assistant turn.
//
// Serializer is panel-agnostic — callers pass the messages array
// they're already keeping in component state.

export interface ExportMessage {
  role: string;
  content: string;
  meetingData?: {
    mode?: string;
    noteTitle?: string;
    status?: string;
  };
  noteCards?: { id: string; title: string }[];
  sources?: { id: string; title: string }[];
}

export interface ExportOptions {
  title: string;
  timestamp?: string;
}

const CITE_RE = /\[([^\]]+)\]/g;

function citationsToWikiLinks(text: string): string {
  return text.replace(CITE_RE, (_full, title) => `[[${title}]]`);
}

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

/** Default export title format: "Chat — Apr 28, 2026 at 5:24 PM". */
export function defaultChatTitle(now: Date = new Date()): string {
  const date = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `Chat — ${date} at ${time}`;
}
