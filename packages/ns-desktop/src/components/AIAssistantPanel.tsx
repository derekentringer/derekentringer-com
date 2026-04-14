import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { askQuestion, type AskQuestionEvent, type NoteCard, fetchChatHistory, saveChatMessages, clearServerChatHistory, type ChatMessageData, summarizeNote as apiSummarize, suggestTags as apiSuggestTags } from "../api/ai.ts";
import { searchNotes, createNote, updateNote, softDeleteNote, fetchFolders, fetchTags, fetchFavoriteNotes, fetchRecentlyEditedNotes, fetchTrash, restoreNote as dbRestoreNote, renameFolder as dbRenameFolder, renameTag as dbRenameTag, deleteFolder as dbDeleteFolder } from "../lib/db.ts";
import type { QASource } from "@derekentringer/ns-shared";
import type { MeetingContextNote } from "../api/ai.ts";
import { parseCommand, filterCommands, type CommandContext, type CommandResult, type ChatCommand } from "../lib/chatCommands.ts";
import { CodeBlock } from "./CodeBlock.tsx";

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
    const batch = remaining > 30 ? 3 : 2;
    const speed = remaining > 60 ? 30 : 80;
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
    <div ref={scrollRef} className="overflow-y-auto h-full pb-2">
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
  verbatim: "Recording",
};

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
  const [autocompleteItems, setAutocompleteItems] = useState<ChatCommand[]>([]);
  const [autocompleteIdx, setAutocompleteIdx] = useState(0);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const [notesCollapsed, setNotesCollapsed] = useState(false);
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
          noteCards: (r.noteCards as NoteCard[] | undefined) ?? undefined,
        })));
      }
    }).catch(() => {});
  }, []);

  // Suppress refetch during our own saves
  const isSavingRef = useRef(false);

  // Refetch chat from server when another device updates (SSE chat event)
  useEffect(() => {
    if (!chatRefreshKey) return;
    if (isSavingRef.current) return;
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
      isSavingRef.current = true;
      clearServerChatHistory().then(() => {
        if (messages.length > 0) {
          return saveChatMessages(messages.map((m) => ({
            role: m.role,
            content: m.content,
            sources: m.sources,
            meetingData: m.meetingData,
            noteCards: m.noteCards,
          })));
        }
      }).catch(() => {}).finally(() => {
        setTimeout(() => { isSavingRef.current = false; }, 500);
      });
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

  // Auto-expand meeting sections when recording starts
  useEffect(() => {
    if (isRecording) {
      setNotesCollapsed(false);
      setTranscriptCollapsed(false);
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

  // ─── Command Context ──────────────────────────────────
  const commandCtx = useMemo((): CommandContext => ({
    createNote: async (title) => {
      try {
        const note = await createNote({ title, content: "" });
        return { id: note.id, title: note.title };
      } catch { return null; }
    },
    moveNote: async (noteTitle, folderName) => {
      try {
        const folders = await fetchFolders();
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
        const notes = await searchNotes(noteTitle);
        const note = notes.find((n) => n.title.toLowerCase() === noteTitle.toLowerCase()) ?? notes[0];
        if (!note) return `Note "${noteTitle}" not found.`;
        await updateNote(note.id, { folderId });
        return `Moved "${note.title}" to "${folderName}".`;
      } catch { return "Failed to move note."; }
    },
    tagNote: async (noteTitle, tags) => {
      try {
        const notes = await searchNotes(noteTitle);
        const note = notes.find((n) => n.title.toLowerCase() === noteTitle.toLowerCase()) ?? notes[0];
        if (!note) return `Note "${noteTitle}" not found.`;
        const merged = [...new Set([...note.tags, ...tags])];
        await updateNote(note.id, { tags: merged });
        return `Tagged "${note.title}" with: ${merged.join(", ")}`;
      } catch { return "Failed to tag note."; }
    },
    deleteNote: async (noteTitle) => {
      try {
        const notes = await searchNotes(noteTitle);
        const note = notes.find((n) => n.title.toLowerCase() === noteTitle.toLowerCase()) ?? notes[0];
        if (!note) return `Note "${noteTitle}" not found.`;
        await softDeleteNote(note.id);
        return `Moved "${note.title}" to trash.`;
      } catch { return "Failed to delete note."; }
    },
    deleteFolder: async (folderName) => {
      try {
        const folders = await fetchFolders();
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
        await dbDeleteFolder(folderId, "move-up");
        return `Deleted folder "${folderName}".`;
      } catch { return "Failed to delete folder."; }
    },
    summarizeNote: async (noteTitle) => {
      try {
        const notes = await searchNotes(noteTitle);
        const note = notes.find((n) => n.title.toLowerCase() === noteTitle.toLowerCase()) ?? notes[0];
        if (!note) return `Note "${noteTitle}" not found.`;
        const summary = await apiSummarize(note.id);
        return `Summary of "${note.title}":\n${summary}`;
      } catch { return "Failed to summarize note."; }
    },
    generateTags: async (noteTitle) => {
      try {
        const notes = await searchNotes(noteTitle);
        const note = notes.find((n) => n.title.toLowerCase() === noteTitle.toLowerCase()) ?? notes[0];
        if (!note) return `Note "${noteTitle}" not found.`;
        const tags = await apiSuggestTags(note.id);
        return `Suggested tags for "${note.title}": ${tags.join(", ")}`;
      } catch { return "Failed to generate tags."; }
    },
    listFavorites: async () => {
      try {
        const notes = await fetchFavoriteNotes();
        return notes.map((n) => ({ id: n.id, title: n.title }));
      } catch { return []; }
    },
    listRecent: async () => {
      try {
        const notes = await fetchRecentlyEditedNotes(10);
        return notes.map((n) => ({ id: n.id, title: n.title, updatedAt: n.updatedAt }));
      } catch { return []; }
    },
    listFolders: async () => {
      try {
        const folders = await fetchFolders();
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
        const tags = await fetchTags();
        if (tags.length === 0) return "No tags.";
        return tags.map((t) => `- ${t.name} (${t.count})`).join("\n");
      } catch { return "Failed to load tags."; }
    },
    getStats: async () => {
      try {
        const recent = await fetchRecentlyEditedNotes(10);
        const favs = await fetchFavoriteNotes();
        const tags = await fetchTags();
        const folders = await fetchFolders();
        return [
          `Recently edited: ${recent.length}`,
          `Favorites: ${favs.length}`,
          `Folders: ${folders.length}`,
          `Tags: ${tags.length}`,
        ].join("\n");
      } catch { return "Failed to load stats."; }
    },
    openNote: async (noteTitle) => {
      try {
        const notes = await searchNotes(noteTitle);
        const note = notes.find((n) => n.title.toLowerCase() === noteTitle.toLowerCase()) ?? notes[0];
        if (!note) return null;
        onSelectNote(note.id);
        return { id: note.id, title: note.title };
      } catch { return null; }
    },
    favoriteNote: async (noteTitle) => {
      try {
        const notes = await searchNotes(noteTitle);
        const note = notes.find((n) => n.title.toLowerCase() === noteTitle.toLowerCase()) ?? notes[0];
        if (!note) return `Note "${noteTitle}" not found.`;
        await updateNote(note.id, { favorite: true });
        return `Added "${note.title}" to favorites.`;
      } catch { return "Failed to favorite note."; }
    },
    unfavoriteNote: async (noteTitle) => {
      try {
        const notes = await searchNotes(noteTitle);
        const note = notes.find((n) => n.title.toLowerCase() === noteTitle.toLowerCase()) ?? notes[0];
        if (!note) return `Note "${noteTitle}" not found.`;
        await updateNote(note.id, { favorite: false });
        return `Removed "${note.title}" from favorites.`;
      } catch { return "Failed to unfavorite note."; }
    },
    listTrash: async () => {
      try {
        const notes = await fetchTrash();
        return notes.map((n) => ({ id: n.id, title: n.title }));
      } catch { return []; }
    },
    restoreNote: async (noteTitle) => {
      try {
        const notes = await fetchTrash();
        const note = notes.find((n) => n.title.toLowerCase() === noteTitle.toLowerCase())
          ?? notes.find((n) => n.title.toLowerCase().includes(noteTitle.toLowerCase()));
        if (!note) return `No trashed note found matching "${noteTitle}".`;
        await dbRestoreNote(note.id);
        return `Restored "${note.title}" from trash.`;
      } catch { return "Failed to restore note."; }
    },
    renameFolder: async (oldName, newName) => {
      try {
        const folders = await fetchFolders();
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
        await dbRenameFolder(folderId, newName);
        return `Renamed folder "${oldName}" to "${newName}".`;
      } catch { return "Failed to rename folder."; }
    },
    renameTag: async (oldName, newName) => {
      try {
        await dbRenameTag(oldName, newName);
        return `Renamed tag "${oldName}" to "${newName}".`;
      } catch { return "Failed to rename tag."; }
    },
    duplicateNote: async (noteTitle) => {
      try {
        const notes = await searchNotes(noteTitle);
        const note = notes.find((n) => n.title.toLowerCase() === noteTitle.toLowerCase()) ?? notes[0];
        if (!note) return null;
        const copy = await createNote({ title: `${note.title} (Copy)`, content: note.content, folderId: note.folderId ?? undefined, tags: note.tags });
        return { id: copy.id, title: copy.title };
      } catch { return null; }
    },
    clearChat: () => handleClear(),
  }), []);

  // ─── Slash Command Handler ───────────────────────────
  async function handleSlashCommand(cmd: ReturnType<typeof parseCommand>) {
    if (!cmd) return false;
    setInput("");
    setAutocompleteItems([]);
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

    setInput("");
    setAutocompleteItems([]);
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
          let last = updated[updated.length - 1];
          if (last.role !== "assistant") return prev;

          if (event.sources) {
            last = { ...last, sources: event.sources };
            updated[updated.length - 1] = last;
          }
          if (event.error) {
            last = { ...last, content: event.error };
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
        {isSearchingContext && (
          <svg className="animate-spin h-3 w-3 text-muted-foreground shrink-0 ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
          </svg>
        )}
        {messages.length > 0 && (
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
                    <div className="max-h-[320px] overflow-y-auto">
                      <LiveTranscript text={liveTranscript!} />
                    </div>
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

                {/* Note title — clickable card matching Related Notes style */}
                {msg.meetingData.noteId && msg.meetingData.noteTitle ? (
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
              <div className="max-w-[95%] rounded-lg bg-card border border-border px-2.5 py-1.5">
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
