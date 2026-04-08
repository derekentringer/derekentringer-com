import { useState, useCallback, useEffect, useRef } from "react";
import type { CommandDefinition } from "@derekentringer/ns-shared";
import { useRegistry } from "./CommandContext.tsx";
import { fuzzyFilter } from "./fuzzyMatch.ts";
import { formatShortcut } from "./formatShortcut.ts";

const RECENT_KEY = "ns-palette-recent";
const MAX_RECENT = 5;

function getRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch { return []; }
}

function addRecent(id: string) {
  try {
    const recent = getRecent().filter((r) => r !== id);
    recent.unshift(id);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
  } catch {}
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const registry = useRegistry();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const allCommands = registry.getAllCommands().filter((c) => !c.desktopOnly);

  const filtered = query
    ? fuzzyFilter(allCommands, query, (c) => `${c.label} ${c.category}`)
    : sortByRecent(allCommands);

  // Reset state on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Keep selected index in bounds
  useEffect(() => {
    if (selectedIndex >= filtered.length) {
      setSelectedIndex(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const executeCommand = useCallback((cmd: CommandDefinition) => {
    addRecent(cmd.id);
    onClose();
    // Defer execution so the palette closes first
    requestAnimationFrame(() => registry.execute(cmd.id));
  }, [registry, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) executeCommand(filtered[selectedIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }, [filtered, selectedIndex, executeCommand, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-card border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="px-4 py-3 border-b border-border">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            placeholder="Type a command..."
            className="w-full bg-transparent text-foreground text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Command list */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No matching commands
            </div>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.id}
                onClick={() => executeCommand(cmd)}
                className={`w-full flex items-center justify-between px-4 py-2 text-sm cursor-pointer ${
                  i === selectedIndex
                    ? "bg-foreground/10 text-foreground"
                    : "text-foreground/80 hover:bg-foreground/5"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate">{cmd.label}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{cmd.category}</span>
                </div>
                {cmd.defaultBinding && (
                  <kbd className="ml-3 px-1.5 py-0.5 rounded bg-background border border-border text-[11px] text-muted-foreground font-mono whitespace-nowrap shrink-0">
                    {formatShortcut(cmd.defaultBinding)}
                  </kbd>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/** Sort commands with recently-used ones first, then by category. */
function sortByRecent(commands: CommandDefinition[]): CommandDefinition[] {
  const recent = new Set(getRecent());
  const recentCmds = commands.filter((c) => recent.has(c.id));
  const rest = commands.filter((c) => !recent.has(c.id));
  return [...recentCmds, ...rest];
}
