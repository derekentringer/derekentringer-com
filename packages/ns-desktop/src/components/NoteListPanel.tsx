import { useState, useMemo } from "react";
import type { Note, NoteSearchResult, NoteSortField, SortOrder } from "@derekentringer/ns-shared";
import type { ExportFormat } from "../lib/importExport.ts";
import type { LocalFileStatus } from "../lib/localFileService.ts";
import { NoteList } from "./NoteList.tsx";

interface NoteListPanelProps {
  notes: Note[];
  selectedId: string | null;
  isLoading: boolean;
  isSearchResults: boolean;
  sortBy: NoteSortField;
  sortOrder: SortOrder;
  onSortByChange: (field: NoteSortField) => void;
  onSortOrderChange: (order: SortOrder) => void;
  onSelect: (note: Note) => void;
  onDoubleClick: (note: Note) => void;
  onDeleteNote: (noteId: string) => void;
  onExportNote: (noteId: string, format?: ExportFormat) => void;
  onToggleFavorite: (noteId: string, favorite: boolean) => void;
  onCreate: () => void;
  searchResults?: NoteSearchResult[] | null;
  localFileStatuses?: Map<string, LocalFileStatus>;
  onUnlinkLocalFile?: (noteId: string) => void;
  onSaveAsLocalFile?: (noteId: string) => void;
  onSaveToFile?: (noteId: string) => void;
  onUseLocalVersion?: (noteId: string) => void;
  onViewDiff?: (noteId: string) => void;
}

export function NoteListPanel({
  notes,
  selectedId,
  isLoading,
  isSearchResults,
  sortBy,
  sortOrder,
  onSortByChange,
  onSortOrderChange,
  onSelect,
  onDoubleClick,
  onDeleteNote,
  onExportNote,
  onToggleFavorite,
  onCreate,
  searchResults,
  localFileStatuses,
  onUnlinkLocalFile,
  onSaveAsLocalFile,
  onSaveToFile,
  onUseLocalVersion,
  onViewDiff,
}: NoteListPanelProps) {
  const [filter, setFilter] = useState("");

  const filteredNotes = useMemo(() => {
    if (!filter) return notes;
    const lower = filter.toLowerCase();
    return notes.filter((n) => n.title.toLowerCase().includes(lower));
  }, [notes, filter]);

  return (
    <div className="h-full flex flex-col bg-sidebar">
      {/* Header */}
      <div className="px-2 pt-2 shrink-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" /></svg>
            {isSearchResults ? "Search Results" : "Notes"}
          </span>
          {!isSearchResults && (
            <div className="flex items-center gap-1">
              <select
                value={sortBy}
                onChange={(e) => onSortByChange(e.target.value as NoteSortField)}
                className="appearance-none h-5 pr-4 pl-1.5 py-0 rounded bg-subtle bg-[length:8px_8px] bg-[right_4px_center] bg-no-repeat border-none text-[10px] text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer"
                style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")" }}
                aria-label="Sort by"
              >
                <option value="sortOrder">Manual</option>
                <option value="updatedAt">Modified</option>
                <option value="createdAt">Created</option>
                <option value="title">Title</option>
              </select>
              <button
                onClick={() => onSortOrderChange(sortOrder === "asc" ? "desc" : "asc")}
                className="w-5 h-5 flex items-center justify-center rounded bg-subtle text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title={sortOrder === "asc" ? "Ascending" : "Descending"}
                aria-label={`Sort ${sortOrder === "asc" ? "ascending" : "descending"}`}
              >
                {sortOrder === "asc" ? "\u2191" : "\u2193"}
              </button>
              <button
                onClick={onCreate}
                className="w-5 h-5 flex items-center justify-center rounded bg-subtle text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title="New note"
              >
                +
              </button>
            </div>
          )}
        </div>

        {/* Filter input */}
        {!isSearchResults && (
          <div className="relative mb-1">
            <input
              type="text"
              placeholder="Filter notes..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full py-1 px-2 text-xs bg-input border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {filter && (
              <button
                type="button"
                onClick={() => setFilter("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors text-[10px] cursor-pointer"
                aria-label="Clear filter"
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>

      {/* Note list */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2" data-testid="note-list">
        {isLoading ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            Loading...
          </div>
        ) : filteredNotes.length === 0 ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            {isSearchResults ? "No notes found" : filter ? "No matching notes" : "No notes yet"}
          </div>
        ) : (
          <NoteList
            notes={filteredNotes}
            selectedId={selectedId}
            onSelect={onSelect}
            onDoubleClick={onDoubleClick}
            onDeleteNote={onDeleteNote}
            onExportNote={onExportNote}
            onToggleFavorite={onToggleFavorite}
            sortByManual={sortBy === "sortOrder"}
            localFileStatuses={localFileStatuses}
            onUnlinkLocalFile={onUnlinkLocalFile}
            onSaveAsLocalFile={onSaveAsLocalFile}
            onSaveToFile={onSaveToFile}
            onUseLocalVersion={onUseLocalVersion}
            onViewDiff={onViewDiff}
          />
        )}
      </nav>
    </div>
  );
}
