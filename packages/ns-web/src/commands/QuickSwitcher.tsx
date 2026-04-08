import { useState, useCallback, useEffect, useRef } from "react";
import { fuzzyFilter } from "./fuzzyMatch.ts";

interface NoteEntry {
  id: string;
  title: string;
  folderName?: string;
}

interface QuickSwitcherProps {
  open: boolean;
  onClose: () => void;
  notes: NoteEntry[];
  onSelect: (noteId: string) => void;
}

export function QuickSwitcher({ open, onClose, notes, onSelect }: QuickSwitcherProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = fuzzyFilter(notes, query, (n) => n.title);

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

  const handleSelect = useCallback((noteId: string) => {
    onClose();
    onSelect(noteId);
  }, [onClose, onSelect]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) handleSelect(filtered[selectedIndex].id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }, [filtered, selectedIndex, handleSelect, onClose]);

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
            placeholder="Switch to note..."
            className="w-full bg-transparent text-foreground text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Note list */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No matching notes
            </div>
          ) : (
            filtered.map((note, i) => (
              <button
                key={note.id}
                onClick={() => handleSelect(note.id)}
                className={`w-full flex items-center justify-between px-4 py-2 text-sm cursor-pointer ${
                  i === selectedIndex
                    ? "bg-foreground/10 text-foreground"
                    : "text-foreground/80 hover:bg-foreground/5"
                }`}
              >
                <span className="truncate">{note.title || "Untitled"}</span>
                {note.folderName && (
                  <span className="ml-2 text-xs text-muted-foreground shrink-0 truncate max-w-[150px]">
                    {note.folderName}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
