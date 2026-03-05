import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { askQuestion, type AskQuestionEvent } from "../api/ai.ts";
import type { QASource } from "@derekentringer/shared/ns";

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

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: QASource[];
}

interface QAPanelProps {
  onSelectNote: (noteId: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export function QAPanel({ onSelectNote, isOpen, onToggle }: QAPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  async function handleAsk() {
    const question = input.trim();
    if (!question || isStreaming) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    // Add placeholder assistant message
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", sources: [] },
    ]);

    try {
      for await (const event of askQuestion(question, controller.signal)) {
        if (controller.signal.aborted) break;

        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role !== "assistant") return prev;

          if (event.sources) {
            updated[updated.length - 1] = { ...last, sources: event.sources };
          }
          if (event.text) {
            updated[updated.length - 1] = {
              ...last,
              content: last.content + event.text,
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
      abortRef.current = null;
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
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  }

  return (
    <div className="flex flex-col h-full bg-background" data-testid="qa-panel">
      {messages.length > 0 && (
        <div className="flex justify-end px-3 py-2 shrink-0">
          <button
            onClick={handleClear}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "user" ? (
              <div className="max-w-[85%] px-3 py-2 rounded-lg bg-primary text-black text-sm">
                {msg.content}
              </div>
            ) : (
              <div className="max-w-[95%] rounded-lg bg-card border border-border p-3">
                {msg.content ? (
                  <>
                    <div className="text-sm text-foreground markdown-preview">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripCitations(msg.content)}</ReactMarkdown>
                    </div>
                    {(() => {
                      const cited = extractCitations(msg.content);
                      const sources = msg.sources?.filter((s) => cited.includes(s.title)) ?? [];
                      if (sources.length === 0) return null;
                      return (
                        <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-border">
                          {sources.map((source) => (
                            <button
                              key={source.id}
                              onClick={() => onSelectNote(source.id)}
                              className="inline-flex items-center px-2 py-0.5 rounded-md bg-accent text-xs text-foreground border border-border hover:bg-primary hover:text-black transition-colors"
                              data-testid="source-pill"
                            >
                              {source.title}
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  isStreaming && (
                    <span className="text-sm text-muted-foreground">
                      Thinking...
                    </span>
                  )
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border p-3 shrink-0 relative">
        {/* Tab button that sticks out to the left */}
        <button
          onClick={onToggle}
          className={`absolute right-full top-0 flex items-center justify-center w-8 h-full rounded-l-md shadow-md transition-colors ${
            isOpen
              ? "bg-primary text-black"
              : "bg-card text-muted-foreground border border-r-0 border-border hover:text-foreground hover:bg-accent"
          }`}
          title="AI Assistant Chat"
          data-testid="qa-tab"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your notes..."
            className="flex-1 px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button
              onClick={handleStop}
              className="px-3 py-2 rounded-md bg-destructive text-foreground text-sm hover:bg-destructive-hover transition-colors shrink-0"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={handleAsk}
              disabled={!input.trim()}
              className="px-3 py-2 rounded-md bg-primary text-black text-sm font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              Ask
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
