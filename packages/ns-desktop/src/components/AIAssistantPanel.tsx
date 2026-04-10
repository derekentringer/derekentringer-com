import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { askQuestion, type AskQuestionEvent, type NoteCard, fetchChatHistory, saveChatMessages, clearServerChatHistory, type ChatMessageData } from "../api/ai.ts";
import type { QASource } from "@derekentringer/ns-shared";
import type { MeetingContextNote } from "../api/ai.ts";
import { CodeBlock } from "./CodeBlock.tsx";

const ASSISTANT_TIPS = [
  "List my favorite notes",
  "What notes are tagged #meeting?",
  "Show my folder structure",
  "What did I edit recently?",
  "How many notes do I have?",
  "What notes link to my Weekly Summary?",
  "Summarize my Project Plan note",
  "What are my most used tags?",
  "Find notes about React",
  "Which notes are in my Work folder?",
  "Show my audio recordings",
  "Create a new meeting agenda note",
  "Move my Draft note to the Work folder",
  "Tag my latest note with #important",
  "Generate tags for my Project Plan",
  "Delete my old scratch note",
];

/** Typing animation that cycles through tips */
function TypingTips() {
  const [tipIndex, setTipIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const orderRef = useRef<number[]>([]);

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

/** Displays transcript text with a typing animation for new characters, auto-scrolling to bottom */
function LiveTranscript({ text }: { text: string }) {
  const [displayLen, setDisplayLen] = useState(text.length);
  const targetLen = text.length;
  const prevTextRef = useRef(text);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (text.length > prevTextRef.current.length) {
      setDisplayLen(prevTextRef.current.length);
    }
    prevTextRef.current = text;
  }, [text]);

  useEffect(() => {
    if (displayLen >= targetLen) return;
    const remaining = targetLen - displayLen;
    // Slightly slower typing: 2 chars at 40ms normally, batch faster for large gaps
    const batch = remaining > 30 ? 3 : 2;
    const speed = remaining > 60 ? 15 : 40;
    const timer = setTimeout(() => {
      setDisplayLen((prev) => Math.min(prev + batch, targetLen));
    }, speed);
    return () => clearTimeout(timer);
  }, [displayLen, targetLen]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayLen]);

  const displayed = text.slice(0, displayLen);

  return (
    <div ref={scrollRef} className="overflow-y-auto h-full px-3 pb-2">
      <p className="text-sm text-muted-foreground leading-relaxed">
        {displayed}
      </p>
    </div>
  );
}

const TRANSCRIPT_MIN_HEIGHT = 60;
const TRANSCRIPT_MAX_HEIGHT = 400;
const TRANSCRIPT_DEFAULT_HEIGHT = 140;

interface MeetingSummaryData {
  relevantNotes: MeetingContextNote[];
  transcript: string;
  mode?: string;
  noteId?: string;
  noteTitle?: string;
  keyTopics?: string[];
}

interface Message {
  role: "user" | "assistant" | "meeting-summary";
  content: string;
  sources?: QASource[];
  meetingData?: MeetingSummaryData;
  noteCards?: NoteCard[];
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
  verbatim: "Recording Ended",
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
  const lines = content.split("\n");
  let inSection = false;
  const items: string[] = [];
  for (const line of lines) {
    if (/^#{1,3}\s+/i.test(line)) {
      if (inSection) break;
      if (line.replace(/^#{1,3}\s+/, "").trim().toLowerCase() === heading) {
        inSection = true;
      }
      continue;
    }
    if (inSection) {
      const match = line.match(/^[-*]\s+\*?\*?(.+?)\*?\*?\s*$/);
      if (match) {
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
  completedNote?: { id: string; title: string; content: string; mode: string } | null;
  chatRefreshKey?: number;
}

export function AIAssistantPanel({ onSelectNote, isOpen, isRecording, isSearchingContext, liveTranscript, relevantNotes, recordingMode, completedNote, chatRefreshKey }: AIAssistantPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [toolActivity, setToolActivity] = useState<string | null>(null);
  const [meetingCollapsed, setMeetingCollapsed] = useState(false);
  const [transcriptHeight, setTranscriptHeight] = useState(TRANSCRIPT_DEFAULT_HEIGHT);
  const [transcriptDragging, setTranscriptDragging] = useState(false);
  const transcriptResizing = useRef(false);
  const transcriptStartY = useRef(0);
  const transcriptStartH = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasMeetingContext = isRecording || (relevantNotes && relevantNotes.length > 0);
  const hasTranscript = (liveTranscript?.length ?? 0) > 0;
  const hasNotes = (relevantNotes?.length ?? 0) > 0;
  const historyLoadedRef = useRef(false);

  // Load chat history from server on mount
  useEffect(() => {
    if (historyLoadedRef.current) return;
    historyLoadedRef.current = true;
    fetchChatHistory().then((rows) => {
      if (rows.length > 0) {
        setMessages(rows.map((r: ChatMessageData) => ({
          role: r.role as Message["role"],
          content: r.content,
          sources: (r.sources as QASource[] | undefined) ?? undefined,
          meetingData: (r.meetingData as MeetingSummaryData | undefined) ?? undefined,
        })));
      }
    }).catch(() => {});
  }, []);

  // Refetch chat from server when another device updates (SSE chat event)
  useEffect(() => {
    if (!chatRefreshKey) return;
    fetchChatHistory().then((rows) => {
      if (rows.length > 0) {
        const loaded = rows.map((r: ChatMessageData) => ({
          role: r.role as Message["role"],
          content: r.content,
          sources: (r.sources as QASource[] | undefined) ?? undefined,
          meetingData: (r.meetingData as MeetingSummaryData | undefined) ?? undefined,
        }));
        setMessages(loaded);
        lastSavedRef.current = JSON.stringify(loaded);
      } else {
        setMessages([]);
        lastSavedRef.current = "[]";
      }
    }).catch(() => {});
  }, [chatRefreshKey]);

  // Persist chat to server when messages change (debounced full replace)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>("");
  useEffect(() => {
    if (!historyLoadedRef.current) return;
    if (isStreaming) return;
    const json = JSON.stringify(messages);
    if (json === lastSavedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      lastSavedRef.current = json;
      clearServerChatHistory().then(() => {
        if (messages.length > 0) {
          saveChatMessages(messages.map((m) => ({
            role: m.role,
            content: m.content,
            sources: m.sources,
            meetingData: m.meetingData,
          })));
        }
      }).catch(() => {});
    }, 1000);
  }, [messages, isStreaming]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auto-expand meeting section when recording starts
  useEffect(() => {
    if (isRecording) {
      setMeetingCollapsed(false);
    }
  }, [isRecording]);

  // Insert meeting summary into chat when recording stops
  const prevRecordingRef = useRef(isRecording);
  const prevRecordingModeRef = useRef(recordingMode);
  useEffect(() => {
    if (isRecording) {
      prevRecordingModeRef.current = recordingMode;
    }
    if (prevRecordingRef.current && !isRecording) {
      // Recording just stopped — capture the meeting context
      const notes = relevantNotes ?? [];
      const transcript = liveTranscript ?? "";
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
            },
          },
        ]);
      }
    }
    prevRecordingRef.current = isRecording;
  }, [isRecording, relevantNotes, liveTranscript, recordingMode]);

  // Enrich meeting-ended card when completed note arrives
  useEffect(() => {
    if (!completedNote) return;
    setMessages((prev) => {
      let idx = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].role === "meeting-summary" && prev[i].meetingData && !prev[i].meetingData!.noteId) {
          idx = i;
          break;
        }
      }
      if (idx === -1) return prev;
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        meetingData: {
          ...updated[idx].meetingData!,
          noteId: completedNote.id,
          noteTitle: completedNote.title,
          keyTopics: extractKeyTopics(completedNote.content, completedNote.mode),
        },
      };
      return updated;
    });
  }, [completedNote]);

  // Transcript area resize via drag (handle at bottom)
  const handleTranscriptResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    transcriptResizing.current = true;
    transcriptStartY.current = e.clientY;
    transcriptStartH.current = transcriptHeight;
    setTranscriptDragging(true);

    function onMove(ev: PointerEvent) {
      if (!transcriptResizing.current) return;
      const delta = ev.clientY - transcriptStartY.current;
      setTranscriptHeight(Math.min(TRANSCRIPT_MAX_HEIGHT, Math.max(TRANSCRIPT_MIN_HEIGHT, transcriptStartH.current + delta)));
    }
    function onUp() {
      transcriptResizing.current = false;
      setTranscriptDragging(false);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }, [transcriptHeight]);

  async function handleAsk() {
    const question = input.trim();
    if (!question || isStreaming) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setIsStreaming(true);
    setToolActivity(null);

    const controller = new AbortController();
    abortRef.current = controller;

    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", sources: [] },
    ]);

    try {
      for await (const event of askQuestion(question, controller.signal, isRecording ? liveTranscript : undefined)) {
        if (controller.signal.aborted) break;

        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role !== "assistant") return prev;

          if (event.sources) {
            updated[updated.length - 1] = { ...last, sources: event.sources };
          }
          if (event.error) {
            updated[updated.length - 1] = {
              ...last,
              content: event.error,
            };
          }
          if (event.text) {
            setToolActivity(null);
            updated[updated.length - 1] = {
              ...last,
              content: last.content + event.text,
            };
          }
          if (event.tool) {
            setToolActivity(event.tool.description);
          }
          if (event.noteCards) {
            updated[updated.length - 1] = {
              ...last,
              noteCards: [...(last.noteCards ?? []), ...event.noteCards],
            };
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
            };
          }
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
      setToolActivity(null);
      abortRef.current = null;
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant" && !last.content) {
          updated[updated.length - 1] = {
            ...last,
            content: "Something went wrong. Please try again.",
          };
        }
        return updated;
      });
    }
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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
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
        {isSearchingContext && (
          <svg className="animate-spin h-3 w-3 text-muted-foreground shrink-0 ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
          </svg>
        )}
      </div>

      {/* Meeting context section */}
      {hasMeetingContext && !meetingCollapsed && (
        <div className="shrink-0">
          {/* Related Notes section */}
          <div className="px-3 pt-2 pb-1">
            <div className="flex items-center gap-1.5 mb-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground shrink-0">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                Related Notes
              </span>
              {hasNotes && (
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {relevantNotes!.length}
                </span>
              )}
            </div>

            {isRecording && !hasTranscript && !hasNotes ? (
              <div className="flex items-center gap-2 py-2 animate-fade-in">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/40 shrink-0">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                </svg>
                <p className="text-xs text-muted-foreground">Listening for conversation context...</p>
              </div>
            ) : isRecording && hasTranscript && !hasNotes ? (
              <div className="flex items-center gap-2 py-2 animate-fade-in">
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

          {/* Transcription section */}
          {isRecording && hasTranscript && (
            <div className="flex flex-col">
              {/* Transcription header */}
              <div className="px-3 pt-2 pb-1 flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground shrink-0">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Transcription
                </span>
              </div>

              {/* Scrollable transcript area */}
              <div style={{ height: transcriptHeight }}>
                <LiveTranscript text={liveTranscript!} />
              </div>

              {/* Resize divider — matches app ResizeDivider style */}
              <div
                onPointerDown={handleTranscriptResizeStart}
                className="shrink-0 flex items-center justify-center h-1.5 cursor-row-resize group"
                style={{ touchAction: "none" }}
              >
                <div className={`h-px w-full ${transcriptDragging ? "bg-ring" : "bg-border group-hover:bg-muted-foreground"} transition-colors`} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Collapse/expand toggle for meeting section */}
      {hasMeetingContext && (
        <button
          onClick={() => setMeetingCollapsed((v) => !v)}
          className="flex items-center justify-center py-1 hover:bg-accent/50 transition-colors cursor-pointer shrink-0 border-b border-border"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`text-muted-foreground transition-transform ${meetingCollapsed ? "rotate-180" : ""}`}
          >
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
      )}

      {messages.length > 0 && (
        <div className="flex justify-end px-3 py-2 shrink-0">
          <button
            onClick={handleClear}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Clear
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {messages.length === 0 && !hasMeetingContext && (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/40">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p className="text-sm text-muted-foreground">Ask about your notes</p>
            <p className="text-xs text-muted-foreground/60 text-center">
              Ask questions and get answers based on your note content.
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "meeting-summary" && msg.meetingData ? (
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

                {/* Note title — clickable link to generated note */}
                {msg.meetingData.noteId && msg.meetingData.noteTitle ? (
                  <button
                    onClick={() => onSelectNote(msg.meetingData!.noteId!)}
                    className="text-xs font-medium text-foreground hover:text-primary transition-colors cursor-pointer mb-1.5 text-left truncate block w-full"
                    title={msg.meetingData.noteTitle}
                  >
                    {msg.meetingData.noteTitle}
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
              <div className="max-w-[85%] px-2.5 py-1.5 rounded-lg bg-primary text-primary-contrast text-sm">
                {msg.content}
              </div>
            ) : (
              <div className="max-w-[95%] rounded-lg bg-card border border-border px-2.5 py-2">
                {msg.content ? (
                  <>
                    <div className="text-sm text-foreground markdown-preview chat-markdown">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={{ pre: CodeBlock }}>{stripCitations(msg.content)}</ReactMarkdown>
                    </div>
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
              setInput("");
              setMessages((prev) => [...prev, { role: "user", content: "Catch me up on this meeting" }]);
              setIsStreaming(true);
              const controller = new AbortController();
              abortRef.current = controller;
              setMessages((prev) => [...prev, { role: "assistant", content: "", sources: [] }]);
              (async () => {
                try {
                  for await (const event of askQuestion("Give me a concise summary of everything discussed so far in this meeting.", controller.signal, liveTranscript)) {
                    if (controller.signal.aborted) break;
                    setMessages((prev) => {
                      const updated = [...prev];
                      const last = updated[updated.length - 1];
                      if (last.role !== "assistant") return prev;
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
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isRecording ? "Ask about this meeting..." : "Ask anything about your notes..."}
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
