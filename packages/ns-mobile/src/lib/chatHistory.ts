// Phase A.5 (mobile parity): conversation-history serializer.
//
// Mirror of `packages/ns-{web,desktop}/src/lib/chatHistory.ts`.
// Converts in-memory panel messages into the {role, content} pairs
// Claude expects on `/ai/ask` follow-ups so the assistant has
// continuity across turns ("the second one", "why did you say that").
//
// Rehydration policy is TEXT ONLY. Tool_use / tool_result blocks are
// not re-sent — Claude infers from prose alone.

export interface ChatHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

interface InputMessage {
  role: string;
  content: string;
  meetingData?: {
    mode?: string;
    noteTitle?: string;
    status?: string;
  };
}

/** Convert in-memory panel messages to the {role, content} pairs
 *  Claude expects. Drops empty placeholders, summarizes meeting
 *  cards as text. Skips roles outside user/assistant. */
export function serializeChatHistory(
  messages: InputMessage[],
): ChatHistoryTurn[] {
  const out: ChatHistoryTurn[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      if (m.content.trim().length === 0) continue;
      out.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      if (m.content.trim().length === 0) continue;
      out.push({ role: "assistant", content: m.content });
    } else if (m.role === "meeting-summary" && m.meetingData) {
      const mode = m.meetingData.mode ?? "recording";
      const status = m.meetingData.status;
      if (m.meetingData.noteTitle) {
        out.push({
          role: "assistant",
          content: `[A ${mode} recording ended — I created the note "${m.meetingData.noteTitle}".]`,
        });
      } else if (status === "failed") {
        out.push({
          role: "assistant",
          content: `[A ${mode} recording ended but note generation failed.]`,
        });
      } else {
        out.push({
          role: "assistant",
          content: `[A ${mode} recording ended; note generation is in progress.]`,
        });
      }
    }
    // Skip everything else.
  }
  return out;
}

/** Trim history oldest-first until total content length fits within
 *  `maxChars`. Always preserves the most recent turns. ~20k chars
 *  (~5k tokens) is the design default — Claude's window is plenty,
 *  but we don't need to spend it all on history. */
export function trimChatHistory(
  history: ChatHistoryTurn[],
  maxChars = 20_000,
): ChatHistoryTurn[] {
  let total = history.reduce((sum, t) => sum + t.content.length, 0);
  if (total <= maxChars) return history;
  let i = 0;
  while (i < history.length && total > maxChars) {
    total -= history[i].content.length;
    i++;
  }
  return history.slice(i);
}
