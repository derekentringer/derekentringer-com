import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { askQuestion, type AskQuestionEvent, type NoteCard, fetchChatHistory, replaceChatMessages, clearServerChatHistory, type ChatMessageData, summarizeNote as apiSummarize, suggestTags as apiSuggestTags, confirmTool, type PendingConfirmation } from "../api/ai.ts";
import { createNote, updateNote, deleteNote, fetchNotes, fetchFolders, fetchTags, fetchFavoriteNotes, fetchDashboardData, fetchTrash, restoreNote as apiRestoreNote, deleteFolderApi, renameFolderApi, renameTagApi } from "../api/notes.ts";
import type { QASource } from "@derekentringer/shared/ns";
import type { MeetingContextNote } from "../api/ai.ts";
import { parseCommand, filterCommands, type CommandContext, type CommandResult, type ChatCommand } from "../lib/chatCommands.ts";
import { buildHistoryForClaude } from "../lib/chatHistory.ts";
import { serializeChatToMarkdown, defaultChatTitle } from "../lib/chatExport.ts";
import { CodeBlock } from "./CodeBlock.tsx";
import { ConfirmationCard } from "./ConfirmationCard.tsx";

const ASSISTANT_TIPS = [
  // Search & discover
  "Find notes about last week's sprint",
  "What notes are tagged #meeting?",
  "Which notes mention the Q3 budget?",
  "What links to my Project Plan?",
  "Show me my recent notes",
  // Read & understand
  "Summarize my Meeting Notes",
  "What are the key points in my Research note?",
  "What's in my Work folder?",
  // Create & organize
  "Create a weekly standup template",
  "Move my Draft to the Work folder",
  "Tag my latest note with #important",
  "Generate tags for my Meeting Notes",
  // During meetings
  "What was just discussed?",
  "Create an action item from this meeting",
  "Find notes related to what we're talking about",
  // Slash commands
  "/create Weekly Standup",
  "/favorites",
  "/recent",
  "/stats",
];

/** Typing animation that cycles through tips */
function TypingTips() {
  const [tipIndex, setTipIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const orderRef = useRef<number[]>([]);

  // Shuffle tips on mount
  if (orderRef.current.length === 0) {
    orderRef.current = [...Array(ASSISTANT_TIPS.length).keys()].sort(() => Math.random() - 0.5);
  }

  const currentTip = ASSISTANT_TIPS[orderRef.current[tipIndex % orderRef.current.length]];

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!deleting) {
        if (charIndex < currentTip.length) {
          setCharIndex((c) => c + 1);
        } else {
          // Pause at end, then start deleting
          setTimeout(() => setDeleting(true), 2000);
        }
      } else {
        if (charIndex > 0) {
          setCharIndex((c) => c - 1);
        } else {
          setDeleting(false);
          setTipIndex((i) => i + 1);
        }
      }
    }, deleting ? 25 : 45);
    return () => clearTimeout(timer);
  }, [charIndex, deleting, currentTip.length]);

  return (
    <div className="px-3 py-1.5 shrink-0">
      <p className="text-xs text-muted-foreground/60 truncate">
        <span className="text-muted-foreground/40">Try: </span>
        {currentTip.slice(0, charIndex)}
        <span className="animate-pulse">|</span>
      </p>
    </div>
  );
}

const CITE_RE = /\[([^\]]+)\]/g;

function extractCitations(text: string): string[] {
  const titles: string[] = [];
  let match: RegExpExecArray | null;
  CITE_RE.lastIndex = 0;
  while ((match = CITE_RE.exec(text)) !== null) {
    if (!titles.includes(match[1])) {
      titles.push(match[1]);
    }
  }
  return titles;
}

function stripCitations(text: string): string {
  return text.replace(CITE_RE, "").replace(/ {2,}/g, " ").trim();
}

/** Phase E.5: convert `[Note Title]` markers to numbered superscript
 *  citation links of the form `[N](cite:Title)`. Numbering matches the
 *  order of pills rendered below the message (sources filtered by
 *  cited titles). Citations referencing unknown sources are stripped. */
function linkifyCitations(text: string, sources?: { id: string; title: string }[]): string {
  if (!sources || sources.length === 0) return stripCitations(text);
  const cited = extractCitations(text);
  const displayed = sources.filter((s) => cited.includes(s.title));
  if (displayed.length === 0) return stripCitations(text);
  const titleToIdx = new Map<string, number>();
  displayed.forEach((s, i) => titleToIdx.set(s.title, i + 1));
  return text
    .replace(CITE_RE, (_full, title: string) => {
      const idx = titleToIdx.get(title);
      if (!idx) return "";
      return ` [${idx}](cite:${encodeURIComponent(title)})`;
    })
    .replace(/ {2,}/g, " ")
    .trim();
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

/** Displays transcript text with a typing animation, sticking to bottom unless the user scrolls up */
function LiveTranscript({ text }: { text: string }) {
  const [displayLen, setDisplayLen] = useState(text.length);
  const targetLen = text.length;
  const prevTextRef = useRef(text);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    if (text.length > prevTextRef.current.length) {
      setDisplayLen(prevTextRef.current.length);
    }
    prevTextRef.current = text;
  }, [text]);

  useEffect(() => {
    if (displayLen >= targetLen) return;
    const remaining = targetLen - displayLen;
    const batch = remaining > 30 ? 3 : 2;
    const speed = remaining > 60 ? 30 : 80;
    const timer = setTimeout(() => {
      setDisplayLen((prev) => Math.min(prev + batch, targetLen));
    }, speed);
    return () => clearTimeout(timer);
  }, [displayLen, targetLen]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [displayLen]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 8;
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
  };

  const displayed = text.slice(0, displayLen);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="max-h-[200px] overflow-y-auto pb-2"
    >
      <p className="text-sm text-muted-foreground leading-relaxed">
        {displayed}
      </p>
    </div>
  );
}

const RECORDING_ACTIVE_LABELS: Record<string, string> = {
  meeting: "Meeting Recording",
  lecture: "Lecture Recording",
  memo: "Memo Recording",
  verbatim: "Verbatim Recording",
};

interface MeetingSummaryData {
  relevantNotes: MeetingContextNote[];
  transcript: string;
  mode?: string;
  noteId?: string;
  noteTitle?: string;
  keyTopics?: string[];
  /** Tied to the AudioRecorder session that produced this card. */
  sessionId?: string;
  /** Phase 2: explicit lifecycle so the card can render a failed state. */
  status?: "processing" | "completed" | "failed";
  errorMessage?: string;
}

/** Union returned to the panel for a finished session (success or failure). */
export type AudioSessionResult =
  | { kind: "success"; sessionId: string; id: string; title: string; content: string; mode: string }
  | { kind: "fail"; sessionId: string; message: string };

interface Message {
  role: "user" | "assistant" | "meeting-summary";
  content: string;
  sources?: QASource[];
  meetingData?: MeetingSummaryData;
  noteCards?: NoteCard[];
  confirmation?: ConfirmationState;
  // Phase E.2: marks an assistant turn whose Claude call failed. The
  // chat shows a Retry button that re-fires the preceding user
  // question with full Phase A history.
  failed?: boolean;
}

/** Phase C.4: a single card can hold multiple same-toolName pendings. */
interface ConfirmationState {
  pendings: PendingConfirmation[];
  status: "pending" | "applying" | "applied" | "discarded" | "failed";
  resultText?: string;
  errorMessage?: string;
  itemResults?: Array<{ id: string; ok: boolean; text?: string; error?: string }>;
}

const RECORDING_MODE_LABELS: Record<string, string> = {
  meeting: "meeting",
  lecture: "lecture",
  memo: "memo",
  verbatim: "recording",
};

const RECORDING_ENDED_LABELS: Record<string, string> = {
  meeting: "Meeting Ended",
  lecture: "Lecture Ended",
  memo: "Memo Saved",
  verbatim: "Verbatim Saved",
};

/** Which heading to extract list items from, per recording mode */
const MODE_SECTION_HEADING: Record<string, string> = {
  meeting: "key discussion points",
  lecture: "key concepts",
  memo: "key points",
};

/** Extract up to 3 list items from the target section heading in the note content */
function extractKeyTopics(content: string, mode?: string): string[] {
  const heading = MODE_SECTION_HEADING[mode ?? "meeting"];
  if (!heading) return [];
  // Find the heading, then collect list items until the next heading or end
  const lines = content.split("\n");
  let inSection = false;
  const items: string[] = [];
  for (const line of lines) {
    if (/^#{1,3}\s+/i.test(line)) {
      if (inSection) break; // hit the next heading, stop
      if (line.replace(/^#{1,3}\s+/, "").trim().toLowerCase() === heading) {
        inSection = true;
      }
      continue;
    }
    if (inSection) {
      const match = line.match(/^[-*]\s+\*?\*?(.+?)\*?\*?\s*$/);
      if (match) {
        // Strip bold markers and take first sentence/clause
        const text = match[1].replace(/\*\*/g, "").split(/[:.–—]/)[0].trim();
        if (text) items.push(text);
        if (items.length >= 3) break;
      }
    }
  }
  return items;
}

interface AIAssistantPanelProps {
  onSelectNote: (noteId: string) => void;
  isOpen: boolean;
  isRecording?: boolean;
  isSearchingContext?: boolean;
  liveTranscript?: string;
  relevantNotes?: MeetingContextNote[];
  recordingMode?: string;
  /** Phase 2: unified success/failure result. */
  audioSessionResult?: AudioSessionResult | null;
  /** Currently open note for context */
  activeNote?: { id: string; title: string; content: string } | null;
  /** Incremented when another device updates chat history via SSE */
  chatRefreshKey?: number;
  /** sessionId of the currently-recording session. */
  activeSessionId?: string;
  onAudioRetry?: (sessionId: string) => void;
  onAudioDiscard?: (sessionId: string) => void;
  /** Phase C.5: per-tool auto-approve for destructive actions. */
  autoApprove?: {
    deleteNote: boolean;
    deleteFolder: boolean;
    updateNoteContent: boolean;
    renameFolder: boolean;
    renameTag: boolean;
  };
  /** Phase E.4: bump this counter to force-focus the chat input (used
   *  by the Cmd+J keyboard shortcut to re-focus the input even when
   *  the drawer is already open on the assistant tab). */
  focusNonce?: number;
}

export function AIAssistantPanel({ onSelectNote, isOpen, isRecording, isSearchingContext, liveTranscript, relevantNotes, recordingMode, audioSessionResult, activeNote, chatRefreshKey, activeSessionId, onAudioRetry, onAudioDiscard, autoApprove, focusNonce }: AIAssistantPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [toolActivity, setToolActivity] = useState<string | null>(null);
  const [autocompleteItems, setAutocompleteItems] = useState<ChatCommand[]>([]);
  const [autocompleteIdx, setAutocompleteIdx] = useState(0);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const [notesCollapsed, setNotesCollapsed] = useState(false);
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Phase E.3: live mirror of `messages` so the memoized commandCtx
  // can serialize the current chat without rebuilding on every change.
  const messagesRef = useRef<Message[]>(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const hasTranscript = (liveTranscript?.length ?? 0) > 0;
  const hasNotes = (relevantNotes?.length ?? 0) > 0;
  const historyLoadedRef = useRef(false);

  // Phase 2 chat-load repaint: snapshots are in-memory only, so a persisted
  // "processing" card loaded from server history is stale — the run that
  // would have enriched it is gone. Repaint as "failed" with a helpful
  // message and no retry (no snapshot to retry from).
  function repaintStaleProcessingCards(rows: Message[]): Message[] {
    return rows.map((m) => {
      if (m.role !== "meeting-summary") return m;
      const md = m.meetingData;
      if (!md || md.status !== "processing") return m;
      return {
        ...m,
        meetingData: {
          ...md,
          status: "failed" as const,
          errorMessage: "Recording lost on refresh — the note couldn't be generated.",
        },
      };
    });
  }

  // Phase E follow-up: confirmation state is persisted for terminal
  // statuses (applied/discarded/failed) so those cards survive refresh.
  function rowToMessage(r: ChatMessageData): Message {
    return {
      role: r.role as Message["role"],
      content: r.content,
      sources: (r.sources as QASource[] | undefined) ?? undefined,
      meetingData: (r.meetingData as MeetingSummaryData | undefined) ?? undefined,
      noteCards: (r.noteCards as NoteCard[] | undefined) ?? undefined,
      confirmation: (r.confirmation as ConfirmationState | undefined) ?? undefined,
    };
  }

  // Strip empty assistant placeholders anywhere in the list (not just
  // trailing). When Claude emits a tool_use without any preceding text,
  // the placeholder that was pre-allocated for text sits between the
  // user message and the resulting confirmation card, rendering as a
  // stray empty bubble. Filter them all on hydration / stream end.
  function stripEmptyPlaceholders(list: Message[]): Message[] {
    return list.filter((m) => {
      if (m.role !== "assistant") return true;
      if (m.content) return true;
      if (m.confirmation) return true;
      if (m.noteCards?.length) return true;
      if (m.meetingData) return true;
      if (m.sources?.length) return true;
      if (m.failed) return true;
      return false;
    });
  }

  // Load chat history from server on mount
  useEffect(() => {
    if (historyLoadedRef.current) return;
    historyLoadedRef.current = true;
    fetchChatHistory().then((rows) => {
      if (rows.length > 0) {
        const loaded = stripEmptyPlaceholders(rows.map(rowToMessage));
        setMessages(repaintStaleProcessingCards(loaded));
      }
    }).catch(() => {});
  }, []);

  // Suppress refetch during our own saves
  const isSavingRef = useRef(false);

  // Refetch chat from server when another device updates (SSE chat event)
  useEffect(() => {
    if (!chatRefreshKey) return;
    if (isSavingRef.current) return; // Skip refetch triggered by our own save
    fetchChatHistory().then((rows) => {
      if (rows.length > 0) {
        const loaded = repaintStaleProcessingCards(stripEmptyPlaceholders(rows.map(rowToMessage)));
        setMessages(loaded);
        lastSavedRef.current = JSON.stringify(loaded);
      } else {
        setMessages([]);
        lastSavedRef.current = "[]";
      }
    }).catch(() => {});
  }, [chatRefreshKey]);

  // Phase D.4: debounce raised from 1s → 5s so bursts of fast-following
  // updates coalesce. Stream-end gets a faster flush below.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>("");
  const persistChatNow = useCallback(() => {
    if (!historyLoadedRef.current) return;
    const json = JSON.stringify(messages);
    if (json === lastSavedRef.current) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    lastSavedRef.current = json;
    isSavingRef.current = true;
    // Single transactional PUT replaces all chat messages. Used to be
    // DELETE-then-POST, which had a narrow race: if the user refreshed
    // between the two calls the server ended up empty.
    replaceChatMessages(messages.map((m) => ({
      role: m.role,
      content: m.content,
      sources: m.sources,
      meetingData: m.meetingData,
      noteCards: m.noteCards,
      // Persist every confirmation status, including pending. The
      // panel unmounts on drawer-tab switch (history/toc), so
      // dropping pending cards meant a mid-task tab flip wiped the
      // card the user was about to Apply. Pending cards carry
      // `toolName` + `toolInput`; Apply re-runs the tool server-side
      // against fresh state, so resuming a stale pending is safe —
      // the worst case is a graceful "no note found" if the target
      // was deleted in the meantime. The `applying` status is the
      // only one we still drop (it's transient, replaced by applied
      // or failed within the same tick).
      confirmation:
        m.confirmation && m.confirmation.status !== "applying"
          ? m.confirmation
          : undefined,
    }))).catch(() => {}).finally(() => {
      setTimeout(() => { isSavingRef.current = false; }, 500);
    });
  }, [messages]);

  useEffect(() => {
    if (!historyLoadedRef.current) return;
    if (isStreaming) return;
    const json = JSON.stringify(messages);
    if (json === lastSavedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => persistChatNow(), 5000);
  }, [messages, isStreaming, persistChatNow]);

  // Phase D.4: flush within 200ms when a stream ends so the assistant
  // turn persists quickly.
  const prevStreamingRef = useRef(isStreaming);
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => persistChatNow(), 200);
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, persistChatNow]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  // Phase E.4: Cmd+J bumps a nonce from the parent; re-focus even when
  // the drawer was already open (isOpen didn't change).
  useEffect(() => {
    if (focusNonce === undefined) return;
    inputRef.current?.focus();
  }, [focusNonce]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auto-expand meeting sections when recording starts
  useEffect(() => {
    if (isRecording) {
      setNotesCollapsed(false);
      setTranscriptCollapsed(false);
    }
  }, [isRecording]);

  // Insert meeting summary into chat when recording stops. We capture the
  // sessionId of the stopped session so the enrichment effect can match
  // the correct card when multiple processing tasks are in flight.
  const prevRecordingRef = useRef(isRecording);
  const prevRecordingModeRef = useRef(recordingMode);
  const prevSessionIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (isRecording) {
      prevRecordingModeRef.current = recordingMode;
      prevSessionIdRef.current = activeSessionId;
    }
    if (prevRecordingRef.current && !isRecording) {
      // Recording just stopped — capture the meeting context.
      const notes = relevantNotes ?? [];
      const transcript = liveTranscript ?? "";
      const sessionId = prevSessionIdRef.current;
      if (notes.length > 0 || transcript.trim().length > 0) {
        setMessages((prev) => [
          ...prev,
          {
            role: "meeting-summary",
            content: "",
            meetingData: {
              relevantNotes: [...notes],
              transcript,
              mode: prevRecordingModeRef.current,
              sessionId,
              status: "processing",
            },
          },
        ]);
      }
    }
    prevRecordingRef.current = isRecording;
  }, [isRecording, relevantNotes, liveTranscript, recordingMode, activeSessionId]);

  // Apply the session result (success or failure) to the matching card.
  useEffect(() => {
    if (!audioSessionResult) return;
    setMessages((prev) => {
      let idx = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        const md = prev[i].meetingData;
        if (
          prev[i].role === "meeting-summary" &&
          md &&
          md.status !== "completed" &&
          md.sessionId === audioSessionResult.sessionId
        ) {
          idx = i;
          break;
        }
      }
      // Fallback for pre-upgrade cards (success only — failures always carry sessionId).
      if (idx === -1 && audioSessionResult.kind === "success") {
        for (let i = prev.length - 1; i >= 0; i--) {
          const md = prev[i].meetingData;
          if (prev[i].role === "meeting-summary" && md && !md.noteId && !md.sessionId) {
            idx = i;
            break;
          }
        }
      }
      if (idx === -1) return prev;
      const updated = [...prev];
      const baseMd = updated[idx].meetingData!;
      if (audioSessionResult.kind === "success") {
        updated[idx] = {
          ...updated[idx],
          meetingData: {
            ...baseMd,
            status: "completed",
            noteId: audioSessionResult.id,
            noteTitle: audioSessionResult.title,
            keyTopics: extractKeyTopics(audioSessionResult.content, audioSessionResult.mode),
            errorMessage: undefined,
          },
        };
      } else {
        updated[idx] = {
          ...updated[idx],
          meetingData: {
            ...baseMd,
            status: "failed",
            errorMessage: audioSessionResult.message,
          },
        };
      }
      return updated;
    });
  }, [audioSessionResult]);

  // Optimistic retry: flip the failed card back to "processing" immediately
  // when the user clicks Retry.
  const handleRetryClick = useCallback((sessionId: string) => {
    setMessages((prev) => prev.map((m) =>
      m.role === "meeting-summary" && m.meetingData?.sessionId === sessionId
        ? { ...m, meetingData: { ...m.meetingData!, status: "processing" as const, errorMessage: undefined } }
        : m,
    ));
    onAudioRetry?.(sessionId);
  }, [onAudioRetry]);

  const handleDiscardClick = useCallback((sessionId: string) => {
    setMessages((prev) => prev.filter((m) =>
      !(m.role === "meeting-summary" && m.meetingData?.sessionId === sessionId),
    ));
    onAudioDiscard?.(sessionId);
  }, [onAudioDiscard]);

  // ─── Command Context ──────────────────────────────────
  const commandCtx = useMemo((): CommandContext => ({
    createNote: async (title) => {
      try {
        const note = await createNote({ title });
        return { id: note.id, title: note.title };
      } catch { return null; }
    },
    moveNote: async (noteTitle, folderName) => {
      try {
        const { folders } = await fetchFolders();
        const findFolder = (items: typeof folders): string | null => {
          for (const f of items) {
            if (f.name.toLowerCase() === folderName.toLowerCase()) return f.id;
            const found = findFolder(f.children);
            if (found) return found;
          }
          return null;
        };
        const folderId = findFolder(folders);
        if (!folderId) return `Folder "${folderName}" not found.`;
        // Find note by searching

        const result = await fetchNotes({ search: noteTitle, pageSize: 5 });
        const note = result.notes.find((n) => n.title.toLowerCase() === noteTitle.toLowerCase()) ?? result.notes[0];
        if (!note) return `Note "${noteTitle}" not found.`;
        await updateNote(note.id, { folderId });
        return `Moved "${note.title}" to "${folderName}".`;
      } catch { return "Failed to move note."; }
    },
    tagNote: async (noteTitle, tags) => {
      try {

        const result = await fetchNotes({ search: noteTitle, pageSize: 5 });
        const note = result.notes.find((n) => n.title.toLowerCase() === noteTitle.toLowerCase()) ?? result.notes[0];
        if (!note) return `Note "${noteTitle}" not found.`;
        const existing = Array.isArray(note.tags) ? note.tags : [];
        const merged = [...new Set([...existing, ...tags])];
        await updateNote(note.id, { tags: merged });
        return `Tagged "${note.title}" with: ${merged.join(", ")}`;
      } catch { return "Failed to tag note."; }
    },
    deleteNote: async (noteTitle) => {
      try {

        const result = await fetchNotes({ search: noteTitle, pageSize: 5 });
        const note = result.notes.find((n) => n.title.toLowerCase() === noteTitle.toLowerCase()) ?? result.notes[0];
        if (!note) return `Note "${noteTitle}" not found.`;
        await deleteNote(note.id);
        return `Moved "${note.title}" to trash.`;
      } catch { return "Failed to delete note."; }
    },
    deleteFolder: async (folderName) => {
      try {
        const { folders } = await fetchFolders();
        const findFolder = (items: typeof folders): string | null => {
          for (const f of items) {
            if (f.name.toLowerCase() === folderName.toLowerCase()) return f.id;
            const found = findFolder(f.children);
            if (found) return found;
          }
          return null;
        };
        const folderId = findFolder(folders);
        if (!folderId) return `Folder "${folderName}" not found.`;
        await deleteFolderApi(folderId);
        return `Deleted folder "${folderName}".`;
      } catch { return "Failed to delete folder."; }
    },
    summarizeNote: async (noteTitle) => {
      try {

        const result = await fetchNotes({ search: noteTitle, pageSize: 5 });
        const note = result.notes.find((n) => n.title.toLowerCase() === noteTitle.toLowerCase()) ?? result.notes[0];
        if (!note) return `Note "${noteTitle}" not found.`;
        const summary = await apiSummarize(note.id);
        return `Summary of "${note.title}":\n${summary}`;
      } catch { return "Failed to summarize note."; }
    },
    generateTags: async (noteTitle) => {
      try {

        const result = await fetchNotes({ search: noteTitle, pageSize: 5 });
        const note = result.notes.find((n) => n.title.toLowerCase() === noteTitle.toLowerCase()) ?? result.notes[0];
        if (!note) return `Note "${noteTitle}" not found.`;
        const tags = await apiSuggestTags(note.id);
        return `Suggested tags for "${note.title}": ${tags.join(", ")}`;
      } catch { return "Failed to generate tags."; }
    },
    listFavorites: async () => {
      try {
        const result = await fetchFavoriteNotes();
        return result.notes.map((n) => ({ id: n.id, title: n.title }));
      } catch { return []; }
    },
    listRecent: async () => {
      try {
        const data = await fetchDashboardData();
        return data.recentlyEdited.map((n) => ({ id: n.id, title: n.title, updatedAt: n.updatedAt }));
      } catch { return []; }
    },
    listFolders: async () => {
      try {
        const result = await fetchFolders();
        const folders = result.folders;
        const format = (items: typeof folders, depth = 0): string[] => {
          const lines: string[] = [];
          for (const f of items) {
            lines.push(`${"  ".repeat(depth)}- ${f.name} (${f.count} notes)`);
            if (f.children.length > 0) lines.push(...format(f.children, depth + 1));
          }
          return lines;
        };
        const lines = format(folders);
        return lines.length > 0 ? lines.join("\n") : "No folders.";
      } catch { return "Failed to load folders."; }
    },
    listTags: async () => {
      try {
        const result = await fetchTags();
        if (result.tags.length === 0) return "No tags.";
        return result.tags.map((t) => `- ${t.name} (${t.count})`).join("\n");
      } catch { return "Failed to load tags."; }
    },
    getStats: async () => {
      try {
        const data = await fetchDashboardData();
        const tagResult = await fetchTags();
        const folderResult = await fetchFolders();
        return [
          `Recently edited: ${data.recentlyEdited.length}`,
          `Favorites: ${data.favorites.length}`,
          `Audio notes: ${data.audioNotes.length}`,
          `Folders: ${folderResult.folders.length}`,
          `Tags: ${tagResult.tags.length}`,
        ].join("\n");
      } catch { return "Failed to load stats."; }
    },
    openNote: async (noteTitle) => {
      try {
        const result = await fetchNotes({ search: noteTitle, pageSize: 5 });
        const note = result.notes.find((n) => n.title.toLowerCase() === noteTitle.toLowerCase()) ?? result.notes[0];
        if (!note) return null;
        onSelectNote(note.id);
        return { id: note.id, title: note.title };
      } catch { return null; }
    },
    favoriteNote: async (noteTitle) => {
      try {
        const result = await fetchNotes({ search: noteTitle, pageSize: 5 });
        const note = result.notes.find((n) => n.title.toLowerCase() === noteTitle.toLowerCase()) ?? result.notes[0];
        if (!note) return `Note "${noteTitle}" not found.`;
        await updateNote(note.id, { favorite: true });
        return `Added "${note.title}" to favorites.`;
      } catch { return "Failed to favorite note."; }
    },
    unfavoriteNote: async (noteTitle) => {
      try {
        const result = await fetchNotes({ search: noteTitle, pageSize: 5 });
        const note = result.notes.find((n) => n.title.toLowerCase() === noteTitle.toLowerCase()) ?? result.notes[0];
        if (!note) return `Note "${noteTitle}" not found.`;
        await updateNote(note.id, { favorite: false });
        return `Removed "${note.title}" from favorites.`;
      } catch { return "Failed to unfavorite note."; }
    },
    listTrash: async () => {
      try {
        const result = await fetchTrash();
        return result.notes.map((n) => ({ id: n.id, title: n.title }));
      } catch { return []; }
    },
    restoreNote: async (noteTitle) => {
      try {
        const result = await fetchTrash();
        const note = result.notes.find((n) => n.title.toLowerCase() === noteTitle.toLowerCase())
          ?? result.notes.find((n) => n.title.toLowerCase().includes(noteTitle.toLowerCase()));
        if (!note) return `No trashed note found matching "${noteTitle}".`;
        await apiRestoreNote(note.id);
        return `Restored "${note.title}" from trash.`;
      } catch { return "Failed to restore note."; }
    },
    renameFolder: async (oldName, newName) => {
      try {
        const { folders } = await fetchFolders();
        const findFolder = (items: typeof folders): string | null => {
          for (const f of items) {
            if (f.name.toLowerCase() === oldName.toLowerCase()) return f.id;
            const found = findFolder(f.children);
            if (found) return found;
          }
          return null;
        };
        const folderId = findFolder(folders);
        if (!folderId) return `Folder "${oldName}" not found.`;
        await renameFolderApi(folderId, newName);
        return `Renamed folder "${oldName}" to "${newName}".`;
      } catch { return "Failed to rename folder."; }
    },
    renameTag: async (oldName, newName) => {
      try {
        await renameTagApi(oldName, newName);
        return `Renamed tag "${oldName}" to "${newName}".`;
      } catch { return "Failed to rename tag."; }
    },
    duplicateNote: async (noteTitle) => {
      try {
        const result = await fetchNotes({ search: noteTitle, pageSize: 5 });
        const note = result.notes.find((n) => n.title.toLowerCase() === noteTitle.toLowerCase()) ?? result.notes[0];
        if (!note) return null;
        const copy = await createNote({ title: `${note.title} (Copy)`, content: note.content, folderId: note.folderId ?? undefined, tags: note.tags });
        return { id: copy.id, title: copy.title };
      } catch { return null; }
    },
    clearChat: () => handleClear(),
    saveChat: async (titleArg) => {
      try {
        const current = messagesRef.current;
        const hasContent = current.some(
          (m) => (m.role === "user" || m.role === "assistant") && m.content.trim().length > 0,
        );
        if (!hasContent) return null;
        const title = titleArg?.trim() || defaultChatTitle();
        const content = serializeChatToMarkdown(current, {
          title,
          timestamp: new Date().toLocaleString(),
        });
        const note = await createNote({ title, content });
        return { id: note.id, title: note.title };
      } catch { return null; }
    },
  }), []);

  // ─── Slash Command Handler ───────────────────────────
  async function handleSlashCommand(cmd: ReturnType<typeof parseCommand>) {
    if (!cmd) return false;
    setInput("");
    setAutocompleteItems([]);
    // Keep focus so the user can immediately type another command
    // without clicking back into the input.
    inputRef.current?.focus();
    setMessages((prev) => [...prev, { role: "user", content: `${cmd.command.usage.split(" ")[0]} ${cmd.args}`.trim() }]);
    try {
      const result: CommandResult = await cmd.command.execute(cmd.args, commandCtx);
      if (!result.silent) {
        setMessages((prev) => [...prev, { role: "assistant", content: result.text, noteCards: result.noteCards }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Command failed." }]);
    }
    return true;
  }

  async function handleAsk() {
    const question = input.trim();
    if (!question || isStreaming) return;

    // Check for slash command
    const cmd = parseCommand(question);
    if (cmd) {
      handleSlashCommand(cmd);
      return;
    }

    // Snapshot history BEFORE appending the new user question; Claude's
    // server-side handler adds the current question as the final user
    // turn. Text-only rehydration per Phase A design.
    const history = buildHistoryForClaude(messages);

    setInput("");
    setAutocompleteItems([]);
    // Keep focus so the user can type the next message without
    // reaching for the mouse. Matches the ChatGPT / Claude.app
    // default where Enter submits and focus stays put.
    inputRef.current?.focus();
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    await performAsk(question, history);
  }

  // Phase E.2: retry a failed assistant turn. Removes the failed turn
  // (and any confirmation cards since the last user message), rebuilds
  // history from what's left, and re-fires the question.
  async function handleRetry(failedIdx: number) {
    if (isStreaming) return;
    let question = "";
    let historyBase: Message[] = [];
    setMessages((prev) => {
      for (let i = failedIdx - 1; i >= 0; i--) {
        if (prev[i].role === "user") {
          question = prev[i].content;
          historyBase = prev.slice(0, i);
          return prev.slice(0, failedIdx);
        }
      }
      return prev;
    });
    if (!question) return;
    const history = buildHistoryForClaude(historyBase);
    await performAsk(question, history);
  }

  async function performAsk(question: string, history: Array<{ role: "user" | "assistant"; content: string }>) {
    setIsStreaming(true);
    setToolActivity(null);

    const controller = new AbortController();
    abortRef.current = controller;

    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", sources: [] },
    ]);

    try {
      for await (const event of askQuestion(question, controller.signal, isRecording ? liveTranscript : undefined, activeNote ?? undefined, history, autoApprove)) {
        if (controller.signal.aborted) break;

        setMessages((prev) => {
          const updated = [...prev];
          let last = updated[updated.length - 1];
          if (last.role !== "assistant") return prev;

          if (event.sources) {
            last = { ...last, sources: event.sources };
            updated[updated.length - 1] = last;
          }
          if (event.error) {
            // Phase E.2: mark assistant turn as failed so the UI
            // renders a Retry button instead of a dead-end error.
            last = { ...last, content: event.error, failed: true };
            updated[updated.length - 1] = last;
          }
          if (event.text) {
            setToolActivity(null);
            last = { ...last, content: last.content + event.text };
            updated[updated.length - 1] = last;
          }
          if (event.tool) {
            setToolActivity(event.tool.description);
          }
          if (event.noteCards) {
            const existing = last.noteCards ?? [];
            const merged = [...existing, ...event.noteCards.filter((c) => !existing.some((e) => e.id === c.id))];
            last = { ...last, noteCards: merged };
            updated[updated.length - 1] = last;
          }
          if (event.confirmation) {
            // Phase C.4: merge consecutive same-toolName pendings into one card.
            const prev = updated[updated.length - 1];
            const prevPrev = updated[updated.length - 2];
            const candidate =
              prev?.confirmation?.status === "pending" ? prev :
              prev?.role === "assistant" && prev.content === "" && prevPrev?.confirmation?.status === "pending" ? prevPrev :
              null;
            if (
              candidate?.confirmation &&
              candidate.confirmation.pendings[0]?.toolName === event.confirmation.toolName
            ) {
              const idx = updated.indexOf(candidate);
              updated[idx] = {
                ...candidate,
                confirmation: {
                  ...candidate.confirmation,
                  pendings: [...candidate.confirmation.pendings, event.confirmation],
                },
              };
            } else {
              updated.push({
                role: "assistant",
                content: "",
                confirmation: { pendings: [event.confirmation], status: "pending" },
              });
              updated.push({ role: "assistant", content: "" });
            }
          }
          return updated;
        });
      }
    } catch {
      if (!controller.signal.aborted) {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === "assistant" && !last.content) {
            updated[updated.length - 1] = {
              ...last,
              content: "Something went wrong. Please try again.",
              failed: true,
            };
          }
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
      setToolActivity(null);
      abortRef.current = null;
      // Clean up empty assistant placeholders anywhere in the list.
      // See stripEmptyPlaceholders comment above for why placeholders
      // can end up between a user message and a confirmation card.
      setMessages((prev) => {
        const updated = stripEmptyPlaceholders(prev);
        const last = updated[updated.length - 1];
        if (last?.role === "user") {
          updated.push({
            role: "assistant",
            content: "Something went wrong. Please try again.",
            failed: true,
          });
        }
        return updated;
      });
    }
  }

  // Phase C — apply or discard a pending destructive action. Accepts
  // a batch so Phase C.4 bulk groups iterate through all items.
  async function handleConfirmApply(idx: number, pendings: PendingConfirmation[]) {
    setMessages((prev) => {
      const updated = [...prev];
      const msg = updated[idx];
      if (!msg?.confirmation) return prev;
      updated[idx] = {
        ...msg,
        confirmation: { ...msg.confirmation, status: "applying" },
      };
      return updated;
    });

    const itemResults: Array<{ id: string; ok: boolean; text?: string; error?: string }> = [];
    for (const pending of pendings) {
      try {
        const result = await confirmTool(pending.toolName, pending.toolInput);
        itemResults.push({ id: pending.id, ok: true, text: result.text });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        itemResults.push({ id: pending.id, ok: false, error: message });
      }
    }

    const okCount = itemResults.filter((r) => r.ok).length;
    const allOk = okCount === pendings.length;
    const noneOk = okCount === 0;

    setMessages((prev) => {
      const updated = [...prev];
      const msg = updated[idx];
      if (!msg?.confirmation) return prev;
      updated[idx] = {
        ...msg,
        confirmation: {
          ...msg.confirmation,
          status: allOk ? "applied" : noneOk ? "failed" : "applied",
          resultText: allOk && pendings.length === 1 ? itemResults[0].text :
            allOk ? `All ${pendings.length} actions applied.` :
            `${okCount} of ${pendings.length} applied — ${pendings.length - okCount} failed.`,
          errorMessage: noneOk ? itemResults[0]?.error : undefined,
          itemResults: pendings.length > 1 ? itemResults : undefined,
        },
      };
      return updated;
    });
  }

  function handleConfirmDiscard(idx: number) {
    setMessages((prev) => {
      const updated = [...prev];
      const msg = updated[idx];
      if (!msg?.confirmation) return prev;
      updated[idx] = {
        ...msg,
        confirmation: { ...msg.confirmation, status: "discarded" },
      };
      return updated;
    });
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  function handleClear() {
    if (isStreaming) {
      abortRef.current?.abort();
    }
    setMessages([]);
    lastSavedRef.current = "[]";
    clearServerChatHistory().catch(() => {});
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (autocompleteItems.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setAutocompleteIdx((i) => Math.min(i + 1, autocompleteItems.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setAutocompleteIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        const selected = autocompleteItems[autocompleteIdx];
        if (selected) {
          setInput(`/${selected.name} `);
          setAutocompleteItems([]);
        }
        return;
      }
      if (e.key === "Escape") {
        setAutocompleteItems([]);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setInput(val);
    const items = filterCommands(val);
    setAutocompleteItems(val.startsWith("/") && !val.includes(" ") ? items : []);
    setAutocompleteIdx(0);
  }

  return (
    <div className="flex flex-col h-full bg-background" data-testid="qa-panel">
      {/* Panel header */}
      <div className="px-3 py-2 border-b border-border shrink-0 flex items-center gap-1.5">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground shrink-0">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          AI Assistant
        </span>
        {/* Phase E.1 was a header indicator; moved inline at the
            bottom of the conversation (see ThinkingBubble below). */}
        {isSearchingContext && (
          <svg className="animate-spin h-3 w-3 text-muted-foreground shrink-0 ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
          </svg>
        )}
        {messages.length > 0 && !isStreaming && (
          <button
            onClick={handleClear}
            className={`text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer ${isSearchingContext ? "" : "ml-auto"}`}
          >
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {/* Live recording card — sticky at top */}
        {isRecording && (
          <div className="sticky top-0 z-10 w-full rounded-lg bg-card border border-border p-3 animate-fade-in">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive" />
              </span>
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground shrink-0">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              </svg>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                {RECORDING_ACTIVE_LABELS[recordingMode ?? "meeting"] ?? "Recording"}
              </span>
            </div>

            {/* Related Notes dropdown */}
            <div className="mb-1">
              <button
                onClick={() => setNotesCollapsed((v) => !v)}
                className="flex items-center gap-1.5 w-full text-left cursor-pointer group"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground shrink-0">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Related Notes
                </span>
                {hasNotes && (
                  <span className="text-[10px] text-muted-foreground">
                    {relevantNotes!.length}
                  </span>
                )}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`ml-auto text-muted-foreground transition-transform duration-200 ${notesCollapsed ? "-rotate-90" : ""}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              <div
                className="overflow-hidden transition-all duration-200 ease-in-out"
                style={{
                  maxHeight: notesCollapsed ? 0 : 1000,
                  opacity: notesCollapsed ? 0 : 1,
                }}
              >
                <div className="pt-1.5">
                  {!hasTranscript && !hasNotes ? (
                    <div className="flex items-center gap-2 py-1 animate-fade-in">
                      <span className="flex items-end gap-0.5 text-muted-foreground/40 shrink-0 h-3.5 w-3.5 justify-center">
                        <span className="bounce-dot" />
                        <span className="bounce-dot" />
                        <span className="bounce-dot" />
                      </span>
                      <p className="text-xs text-muted-foreground">Listening for conversation context...</p>
                    </div>
                  ) : hasTranscript && !hasNotes ? (
                    <div className="flex items-center gap-2 py-1 animate-fade-in">
                      <span className="flex items-end gap-0.5 text-muted-foreground/40 shrink-0 h-3.5 w-3.5 justify-center">
                        <span className="bounce-dot" />
                        <span className="bounce-dot" />
                        <span className="bounce-dot" />
                      </span>
                      <p className="text-xs text-muted-foreground">Monitoring the {RECORDING_MODE_LABELS[recordingMode ?? "meeting"] ?? "recording"} to surface related notes...</p>
                    </div>
                  ) : hasNotes ? (
                    <div className="space-y-1.5 animate-fade-in">
                      {relevantNotes!.map((note, index) => (
                        <button
                          key={note.id}
                          onClick={() => onSelectNote(note.id)}
                          className="w-full text-left rounded-md border border-border hover:border-primary/50 p-2 transition-colors cursor-pointer animate-fade-in group"
                          style={{ animationDelay: `${index * 50}ms` }}
                        >
                          <div className="flex items-center gap-1.5">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0">
                              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                              <polyline points="14 2 14 8 20 8" />
                            </svg>
                            <span className="text-xs font-medium text-foreground/70 group-hover:text-foreground flex-1 truncate transition-colors">
                              {note.title}
                            </span>
                            <span className="text-[10px] text-primary/70 shrink-0 tabular-nums">
                              {Math.round(note.score * 100)}%
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Transcription dropdown */}
            <div>
              <button
                onClick={() => setTranscriptCollapsed((v) => !v)}
                className="flex items-center gap-1.5 w-full text-left cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground shrink-0">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Transcription
                </span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`ml-auto text-muted-foreground transition-transform duration-200 ${transcriptCollapsed ? "-rotate-90" : ""}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              <div
                className="overflow-hidden transition-all duration-200 ease-in-out"
                style={{
                  maxHeight: transcriptCollapsed ? 0 : 340,
                  opacity: transcriptCollapsed ? 0 : 1,
                }}
              >
                <div className="pt-1.5">
                  {hasTranscript ? (
                    <LiveTranscript text={liveTranscript!} />
                  ) : (
                    <div className="flex items-center gap-2 py-1">
                      <span className="flex items-end gap-0.5 text-muted-foreground/40 shrink-0 h-3.5 w-3.5 justify-center">
                        <span className="bounce-dot" />
                        <span className="bounce-dot" />
                        <span className="bounce-dot" />
                      </span>
                      <p className="text-xs text-muted-foreground">Starting transcription...</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {messages.length === 0 && !isRecording && (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/40">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p className="text-sm text-muted-foreground">Your AI Assistant</p>
            <p className="text-xs text-muted-foreground/60 text-center px-4">
              Search, create, and organize notes. Summarize content, generate tags, and ask questions during meetings.
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.confirmation ? (
              <ConfirmationCard
                pendings={msg.confirmation.pendings}
                status={msg.confirmation.status}
                resultText={msg.confirmation.resultText}
                errorMessage={msg.confirmation.errorMessage}
                itemResults={msg.confirmation.itemResults}
                onApply={() => handleConfirmApply(i, msg.confirmation!.pendings)}
                onDiscard={() => handleConfirmDiscard(i)}
              />
            ) : msg.role === "meeting-summary" && msg.meetingData ? (
              <div className="w-full rounded-lg bg-card border border-border p-3 animate-fade-in">
                <div className="flex items-center gap-1.5 mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground shrink-0">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  </svg>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    {RECORDING_ENDED_LABELS[msg.meetingData.mode ?? "meeting"] ?? "Recording Ended"}
                  </span>
                </div>

                {/* Status-driven body */}
                {msg.meetingData.status === "failed" ? (
                  <div className="mb-1.5">
                    <div className="flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 p-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-destructive shrink-0 mt-0.5">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-destructive font-medium">Processing failed</p>
                        {msg.meetingData.errorMessage && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">{msg.meetingData.errorMessage}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1.5 mt-1.5">
                      {msg.meetingData.sessionId && onAudioRetry && (
                        <button
                          onClick={() => handleRetryClick(msg.meetingData!.sessionId!)}
                          className="px-2 py-1 rounded-md border border-border hover:border-primary/50 text-[11px] text-foreground hover:bg-accent transition-colors cursor-pointer"
                        >
                          Retry
                        </button>
                      )}
                      {msg.meetingData.sessionId && onAudioDiscard && (
                        <button
                          onClick={() => handleDiscardClick(msg.meetingData!.sessionId!)}
                          className="px-2 py-1 rounded-md border border-border hover:border-destructive/50 text-[11px] text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                        >
                          Discard
                        </button>
                      )}
                    </div>
                  </div>
                ) : msg.meetingData.noteId && msg.meetingData.noteTitle ? (
                  <button
                    onClick={() => onSelectNote(msg.meetingData!.noteId!)}
                    className="w-full text-left rounded-md border border-border hover:border-primary/50 p-2 transition-colors cursor-pointer mb-1.5 group"
                    title={msg.meetingData.noteTitle}
                  >
                    <div className="flex items-center gap-1.5">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0">
                        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      <span className="text-xs font-medium text-foreground/70 group-hover:text-foreground flex-1 truncate transition-colors">
                        {msg.meetingData.noteTitle}
                      </span>
                    </div>
                  </button>
                ) : !msg.meetingData.noteId ? (
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="flex items-end gap-0.5 text-muted-foreground/40 shrink-0 h-3 justify-center">
                      <span className="bounce-dot" />
                      <span className="bounce-dot" />
                      <span className="bounce-dot" />
                    </span>
                    <span className="text-xs text-muted-foreground">Generating note...</span>
                  </div>
                ) : null}

                {/* Key topics */}
                {msg.meetingData.keyTopics && msg.meetingData.keyTopics.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {msg.meetingData.keyTopics.map((topic, idx) => (
                      <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-muted-foreground">
                        {topic}
                      </span>
                    ))}
                  </div>
                )}

                {/* Surfaced notes */}
                {msg.meetingData.relevantNotes.length > 0 && (
                  <div className="mb-2">
                    <span className="text-[10px] text-muted-foreground">Related notes:</span>
                    <div className="flex flex-col gap-1 mt-1">
                      {msg.meetingData.relevantNotes.map((note) => (
                        <button
                          key={note.id}
                          onClick={() => onSelectNote(note.id)}
                          className="w-full text-left rounded-md border border-border hover:border-primary/50 p-2 transition-colors cursor-pointer group"
                        >
                          <div className="flex items-center gap-1.5">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0">
                              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                              <polyline points="14 2 14 8 20 8" />
                            </svg>
                            <span className="text-xs font-medium text-foreground/70 group-hover:text-foreground flex-1 truncate transition-colors">
                              {note.title}
                            </span>
                            <span className="text-[10px] text-primary/70 shrink-0 tabular-nums">
                              {Math.round(note.score * 100)}%
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Transcript preview */}
                {msg.meetingData.transcript.trim().length > 0 && (
                  <details className="group">
                    <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                      View transcript ({Math.round(msg.meetingData.transcript.length / 5)} words)
                    </summary>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-1.5 max-h-[200px] overflow-y-auto">
                      {msg.meetingData.transcript}
                    </p>
                  </details>
                )}
              </div>
            ) : msg.role === "user" ? (
              <div className="max-w-[85%] px-2.5 py-1.5 rounded-lg bg-subtle border border-border text-sm text-foreground">
                {msg.content.startsWith("/") ? (
                  <><code className="text-xs text-primary bg-input px-1 py-0.5 rounded font-mono">{msg.content.split(" ")[0]}</code> {msg.content.split(" ").slice(1).join(" ")}</>
                ) : msg.content}
              </div>
            ) : (
              <div className={`max-w-[95%] rounded-lg bg-card border px-2.5 py-1.5 ${msg.failed ? "border-destructive/40" : "border-border"}`}>
                {msg.content ? (
                  <>
                    <div className={`text-sm markdown-preview chat-markdown ${msg.failed ? "text-destructive" : "text-foreground"}`}>
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeHighlight]}
                        components={{
                          pre: CodeBlock,
                          // Phase E.5: render `cite:` URLs as clickable
                          // numbered superscripts that scroll to the
                          // matching pill and navigate to the note.
                          a: ({ href, children, ...rest }) => {
                            if (typeof href === "string" && href.startsWith("cite:")) {
                              const title = decodeURIComponent(href.slice(5));
                              const source = msg.sources?.find((s) => s.title === title);
                              if (!source) return <>{children}</>;
                              return (
                                <sup className="ml-0.5">
                                  <a
                                    href="#"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      onSelectNote(source.id);
                                    }}
                                    title={title}
                                    data-testid="citation-marker"
                                    className="text-primary hover:underline px-0.5 text-[10px] font-medium cursor-pointer no-underline"
                                  >
                                    {children}
                                  </a>
                                </sup>
                              );
                            }
                            return <a href={href} {...rest}>{children}</a>;
                          },
                        }}
                      >
                        {linkifyCitations(msg.content, msg.sources)}
                      </ReactMarkdown>
                    </div>
                    {/* Phase E.2: retry button for failed turns. */}
                    {msg.failed && (
                      <div className="flex gap-1.5 mt-1.5">
                        <button
                          onClick={() => handleRetry(i)}
                          disabled={isStreaming}
                          className="px-2 py-1 rounded-md border border-border hover:border-primary/50 text-[11px] text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        >
                          Retry
                        </button>
                      </div>
                    )}
                    {(() => {
                      const cited = extractCitations(msg.content);
                      const sources = msg.sources?.filter((s) => cited.includes(s.title)) ?? [];
                      if (sources.length === 0) return null;
                      return (
                        <div className="flex flex-col gap-1 mt-2 pt-2 border-t border-border">
                          <span className="text-[10px] text-muted-foreground">Related notes:</span>
                          {sources.map((source) => (
                            <button
                              key={source.id}
                              onClick={() => onSelectNote(source.id)}
                              className="w-full text-left rounded-md border border-border hover:border-primary/50 p-2 transition-colors cursor-pointer group"
                              data-testid="source-pill"
                            >
                              <div className="flex items-center gap-1.5">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0">
                                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                                  <polyline points="14 2 14 8 20 8" />
                                </svg>
                                <span className="text-xs font-medium text-foreground/70 group-hover:text-foreground flex-1 truncate transition-colors">
                                  {source.title}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  isStreaming && (
                    <div className="flex items-center gap-1.5">
                      <span className="flex items-end gap-0.5 text-muted-foreground/40 shrink-0 h-3 justify-center">
                        <span className="bounce-dot" />
                        <span className="bounce-dot" />
                        <span className="bounce-dot" />
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {toolActivity ?? "Thinking..."}
                      </span>
                    </div>
                  )
                )}
                {/* Note cards from tool results */}
                {msg.noteCards && msg.noteCards.length > 0 && (
                  <div className="flex flex-col gap-1 mt-2 pt-2 border-t border-border">
                    {msg.noteCards.map((card) => (
                      <button
                        key={card.id}
                        onClick={() => onSelectNote(card.id)}
                        className="w-full text-left rounded-md border border-border hover:border-primary/50 p-2 transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-1.5">
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0">
                            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                          <span className="text-xs font-medium text-foreground/70 group-hover:text-foreground flex-1 truncate transition-colors">
                            {card.title}
                          </span>
                          {card.folder && (
                            <span className="text-[10px] text-muted-foreground shrink-0">{card.folder}</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {/* Inline "thinking" bubble — replaces the previous header
            indicator so the live tool activity sits at the bottom of
            the conversation where the user's eyes already are. Skipped
            when the last message is an empty assistant placeholder
            (its existing bounce dots already convey the state). */}
        {(() => {
          if (!isStreaming) return null;
          const last = messages[messages.length - 1];
          if (last?.role === "assistant" && !last.content && !last.confirmation) return null;
          return (
            <div className="flex justify-start mb-2" data-testid="thinking-bubble">
              <div className="rounded-lg bg-card border border-border px-2.5 py-1.5 flex items-center gap-1.5" aria-live="polite">
                <svg className="animate-spin h-3 w-3 text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                </svg>
                <span className="text-[11px] text-muted-foreground truncate max-w-[280px]">{toolActivity ?? "Thinking…"}</span>
              </div>
            </div>
          );
        })()}
        <div ref={messagesEndRef} />
      </div>

      {/* Tips */}
      {!isRecording && !isStreaming && messages.length === 0 && <TypingTips />}

      {/* Input */}
      <div className="border-t border-border p-3 shrink-0">
        {/* Catch me up button */}
        {isRecording && hasTranscript && !isStreaming && (
          <button
            onClick={() => {
              const history = buildHistoryForClaude(messages);
              setInput("");
              setMessages((prev) => [...prev, { role: "user", content: "Catch me up on this meeting" }]);
              setIsStreaming(true);
              const controller = new AbortController();
              abortRef.current = controller;
              setMessages((prev) => [...prev, { role: "assistant", content: "", sources: [] }]);
              (async () => {
                try {
                  for await (const event of askQuestion("Give me a concise summary of everything discussed so far in this meeting.", controller.signal, liveTranscript, undefined, history, autoApprove)) {
                    if (controller.signal.aborted) break;
                    setMessages((prev) => {
                      const updated = [...prev];
                      const last = updated[updated.length - 1];
                      if (last.role !== "assistant") return prev;
                      if (event.error) {
                        updated[updated.length - 1] = { ...last, content: event.error };
                      }
                      if (event.text) {
                        updated[updated.length - 1] = { ...last, content: last.content + event.text };
                      }
                      return updated;
                    });
                  }
                } catch {
                  if (!controller.signal.aborted) {
                    setMessages((prev) => {
                      const updated = [...prev];
                      const last = updated[updated.length - 1];
                      if (last.role === "assistant" && !last.content) {
                        updated[updated.length - 1] = { ...last, content: "Something went wrong. Please try again." };
                      }
                      return updated;
                    });
                  }
                } finally {
                  setIsStreaming(false);
                  abortRef.current = null;
                }
              })();
            }}
            className="w-full mb-2 px-2.5 py-1.5 rounded-md border border-border hover:border-primary/50 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            Catch me up
          </button>
        )}
        <div className="relative" ref={inputWrapRef}>
          {/* Autocomplete dropdown */}
          {autocompleteItems.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-card border border-border rounded-md shadow-lg overflow-hidden z-50">
              {autocompleteItems.map((cmd, i) => (
                <button
                  key={cmd.name}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setInput(`/${cmd.name} `);
                    setAutocompleteItems([]);
                    inputRef.current?.focus();
                  }}
                  className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 cursor-pointer transition-colors ${
                    i === autocompleteIdx ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <span className="text-primary font-mono text-xs">/{cmd.name}</span>
                  <span className="text-xs text-muted-foreground truncate">{cmd.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={isRecording ? "Ask about the meeting or manage your notes..." : "Ask, search, create, or organize..."}
            className="flex-1 px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-muted-foreground"
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button
              onClick={handleStop}
              className="px-3 py-2 rounded-md bg-destructive text-foreground text-sm hover:bg-destructive-hover transition-colors shrink-0 cursor-pointer"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={handleAsk}
              disabled={!input.trim()}
              className="px-3 py-2 rounded-md bg-primary text-primary-contrast text-sm font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0 cursor-pointer"
            >
              Ask
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
