import { useState, useMemo } from "react";
import type { Note } from "@derekentringer/shared/ns";

type TrashSortField = "deletedAt" | "updatedAt" | "title";

interface TrashPanelProps {
  notes: Note[];
  selectedId: string | null;
  onSelect: (note: Note) => void;
  onRestore: (noteIds: string[]) => void;
  onDelete: (noteIds: string[]) => void;
  onBack: () => void;
}

function relativeDate(date: Date): string {
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function stripMarkdown(text: string, maxLen: number): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~`>|[\]()!]/g, "")
    .replace(/\n+/g, " ")
    .trim()
    .slice(0, maxLen);
}

export function TrashPanel({
  notes,
  selectedId,
  onSelect,
  onRestore,
  onDelete,
  onBack,
}: TrashPanelProps) {
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState<TrashSortField>("deletedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmAction, setConfirmAction] = useState<"delete-selected" | "delete-all" | null>(null);

  // Filter and sort
  const filteredNotes = useMemo(() => {
    let result = notes;
    if (filter) {
      const lower = filter.toLowerCase();
      result = result.filter((n) => (n.title || "").toLowerCase().includes(lower));
    }
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "deletedAt") {
        cmp = new Date(a.deletedAt ?? 0).getTime() - new Date(b.deletedAt ?? 0).getTime();
      } else if (sortBy === "updatedAt") {
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      } else {
        cmp = (a.title || "").localeCompare(b.title || "");
      }
      return sortOrder === "desc" ? -cmp : cmp;
    });
    return result;
  }, [notes, filter, sortBy, sortOrder]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filteredNotes.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredNotes.map((n) => n.id)));
    }
  }

  function handleBatchRestore() {
    if (selectedIds.size === 0) return;
    onRestore(Array.from(selectedIds));
    setSelectedIds(new Set());
  }

  function handleConfirmDelete() {
    if (confirmAction === "delete-selected") {
      onDelete(Array.from(selectedIds));
      setSelectedIds(new Set());
    } else if (confirmAction === "delete-all") {
      onDelete(notes.map((n) => n.id));
    }
    setConfirmAction(null);
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-2 pt-2 pb-1 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <span>&larr;</span> Back
          </button>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{notes.length} item{notes.length !== 1 ? "s" : ""}</span>
          </div>
        </div>

        {/* Sort + Filter + Select toggle */}
        <div className="flex items-center gap-1.5 mb-1">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as TrashSortField)}
            className="appearance-none h-5 pr-4 pl-1.5 py-0 rounded bg-subtle bg-[length:8px_8px] bg-[right_4px_center] bg-no-repeat border-none text-[10px] text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer"
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")" }}
            aria-label="Sort by"
          >
            <option value="deletedAt">Deleted</option>
            <option value="updatedAt">Modified</option>
            <option value="title">Title</option>
          </select>
          <button
            onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
            className="w-5 h-5 flex items-center justify-center rounded bg-subtle text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title={sortOrder === "asc" ? "Ascending" : "Descending"}
            aria-label={`Sort ${sortOrder === "asc" ? "ascending" : "descending"}`}
          >
            {sortOrder === "asc" ? "\u2191" : "\u2193"}
          </button>
          <div className="flex-1" />
          <button
            onClick={selectMode ? exitSelectMode : () => setSelectMode(true)}
            className={`px-1.5 py-0.5 rounded text-[10px] transition-colors cursor-pointer ${
              selectMode
                ? "bg-foreground/10 text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title={selectMode ? "Exit select mode" : "Select notes"}
          >
            {selectMode ? "Done" : "Select"}
          </button>
        </div>

        {/* Filter input */}
        <div className="relative flex items-center rounded-md bg-input border border-border focus-within:ring-1 focus-within:ring-ring mb-1">
          <input
            type="text"
            placeholder="Filter trash..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full bg-transparent pl-2 pr-7 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {filter && (
            <button
              onClick={() => setFilter("")}
              className="absolute right-1.5 text-muted-foreground hover:text-foreground text-xs cursor-pointer"
              aria-label="Clear filter"
            >
              ✕
            </button>
          )}
        </div>

        {/* Select mode toolbar */}
        {selectMode && filteredNotes.length > 0 && (
          <div className="flex items-center gap-2 py-1 animate-fade-in">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={selectedIds.size === filteredNotes.length && filteredNotes.length > 0}
                onChange={toggleSelectAll}
                className="mr-1.5 accent-primary cursor-pointer"
                aria-label="Select all"
              />
              <span className="text-[10px] text-muted-foreground">
                {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select all"}
              </span>
            </label>
            <div className="flex-1" />
            {selectedIds.size > 0 && (
              <>
                <button
                  onClick={handleBatchRestore}
                  className="text-[10px] text-primary hover:text-primary-hover transition-colors cursor-pointer"
                >
                  Restore ({selectedIds.size})
                </button>
                <button
                  onClick={() => setConfirmAction("delete-selected")}
                  className="text-[10px] text-destructive hover:text-destructive-hover transition-colors cursor-pointer"
                >
                  Delete ({selectedIds.size})
                </button>
              </>
            )}
            {selectedIds.size === 0 && notes.length > 0 && (
              <button
                onClick={() => setConfirmAction("delete-all")}
                className="text-[10px] text-destructive hover:text-destructive-hover transition-colors cursor-pointer"
              >
                Empty Trash
              </button>
            )}
          </div>
        )}
      </div>

      {/* Confirmation bar */}
      {confirmAction && (
        <div className="px-2 py-2 bg-destructive/10 border-y border-destructive/20 flex items-center gap-2 shrink-0 animate-fade-in">
          <span className="text-xs text-destructive flex-1">
            {confirmAction === "delete-all"
              ? `Permanently delete all ${notes.length} note${notes.length !== 1 ? "s" : ""}?`
              : `Permanently delete ${selectedIds.size} note${selectedIds.size !== 1 ? "s" : ""}?`}
          </span>
          <button
            onClick={handleConfirmDelete}
            className="px-2 py-0.5 rounded text-xs bg-destructive text-foreground hover:bg-destructive-hover transition-colors cursor-pointer"
          >
            Delete
          </button>
          <button
            onClick={() => setConfirmAction(null)}
            className="px-2 py-0.5 rounded text-xs border border-border text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Note list */}
      <nav className="flex-1 overflow-y-auto px-2 pb-2 animate-fade-in">
        {filteredNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/40">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            <p className="text-sm text-muted-foreground">
              {filter ? "No matching notes" : "Trash is empty"}
            </p>
            {!filter && (
              <p className="text-xs text-muted-foreground/60">
                Notes you delete will appear here
              </p>
            )}
          </div>
        ) : (
          filteredNotes.map((note) => {
            const isSelected = note.id === selectedId;
            const isChecked = selectedIds.has(note.id);
            const deletedDate = note.deletedAt ? relativeDate(new Date(note.deletedAt)) : "";
            const snippet = note.content ? stripMarkdown(note.content, 80) : "";

            return (
              <div
                key={note.id}
                className={`flex items-start gap-1.5 rounded-md px-2 py-1.5 transition-colors cursor-pointer ${
                  isSelected ? "bg-accent" : "hover:bg-accent"
                }`}
                onClick={() => !selectMode && onSelect(note)}
              >
                {selectMode && (
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleSelect(note.id)}
                    className="mt-1 shrink-0 accent-primary cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select ${note.title || "Untitled"}`}
                  />
                )}
                <div className="flex-1 min-w-0 overflow-hidden" onClick={() => selectMode && toggleSelect(note.id)}>
                  <span className={`text-sm font-medium truncate block ${isSelected ? "text-foreground" : "text-foreground/70"}`}>
                    {note.title || "Untitled"}
                  </span>
                  {snippet && (
                    <p className="text-xs text-foreground/45 truncate mt-0.5">{snippet}</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-destructive/60 shrink-0">Deleted {deletedDate}</span>
                    {note.tags && note.tags.length > 0 && (
                      <>
                        <span className="text-[10px] text-muted-foreground">·</span>
                        {note.tags.slice(0, 2).map((tag) => (
                          <span key={tag} className="text-[10px] text-muted-foreground truncate max-w-[80px]">{tag}</span>
                        ))}
                        {note.tags.length > 2 && (
                          <span className="text-[10px] text-muted-foreground">+{note.tags.length - 2}</span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </nav>
    </div>
  );
}
