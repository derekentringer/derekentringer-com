// Conversation history fed back to Claude on follow-up questions.
//
// Phase A of the AI Assistant hardening (docs/ns/ai-assist-arch/phase-a-*)
// adds continuity: the previous user/assistant turns ride along with the
// next question so Claude has context for "the second one", "why did you
// say that", etc.
//
// Rehydration policy: TEXT ONLY. We do not resend prior tool_use /
// tool_result blocks because our persisted message schema doesn't keep
// them; Claude infers well enough from assistant text alone.
//
// `meeting-summary` cards are serialized to a short text line so Claude
// knows a recording happened without us trying to represent the card
// structure.

/** A single turn safe to send to Claude as a message. */
export interface ChatHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

/** Shape that's compatible with the panel's Message but decoupled from it. */
interface InputMessage {
  role: string;
  content: string;
  meetingData?: {
    mode?: string;
    noteTitle?: string;
    status?: string;
  };
}

/**
 * Convert in-memory panel messages into the shape Claude expects.
 *
 * - Drops empty-content messages (transient streaming placeholders).
 * - Converts `meeting-summary` cards to a short text summary so Claude has
 *   awareness of the recording without trying to serialize card UI.
 * - Excludes roles outside user/assistant (future-proofing).
 */
export function serializeChatHistory(messages: InputMessage[]): ChatHistoryTurn[] {
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
    // skip everything else
  }
  return out;
}

/**
 * Trim history oldest-first until total content length fits within
 * `maxChars`. Always preserves the most recent turns. Claude's context
 * window is plenty but we don't need to spend it all on history — 20k
 * chars (~5k tokens) is the design default.
 */
export function trimHistoryToBudget(
  history: ChatHistoryTurn[],
  maxChars: number,
): ChatHistoryTurn[] {
  let total = 0;
  for (const turn of history) total += turn.content.length;
  if (total <= maxChars) return history;

  // Drop from the oldest end until we fit.
  let idx = 0;
  while (idx < history.length && total > maxChars) {
    total -= history[idx].content.length;
    idx++;
  }
  return history.slice(idx);
}

/** One call: serialize + trim. Convenience wrapper used by the panel. */
export function buildHistoryForClaude(
  messages: InputMessage[],
  options?: { maxChars?: number; maxTurns?: number },
): ChatHistoryTurn[] {
  const maxChars = options?.maxChars ?? 20_000;
  const maxTurns = options?.maxTurns ?? 40;
  const serialized = serializeChatHistory(messages);
  const turnLimited = serialized.length > maxTurns
    ? serialized.slice(serialized.length - maxTurns)
    : serialized;
  return trimHistoryToBudget(turnLimited, maxChars);
}
