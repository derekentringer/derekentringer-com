import { useState, useEffect, useRef, useMemo } from "react";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { NoteSearchResult } from "@derekentringer/shared/ns";
import type { ExportFormat } from "../lib/importExport.ts";
import { stripMarkdown } from "../lib/stripMarkdown.ts";
import { SearchSnippet } from "./SearchSnippet.tsx";
import { ConfirmDialog } from "./ConfirmDialog.tsx";

interface NoteListProps {
  notes: NoteSearchResult[];
  selectedId: string | null;
  onSelect: (note: NoteSearchResult) => void;
  onDoubleClick?: (note: NoteSearchResult) => void;
  onDeleteNote?: (noteId: string) => void;
  onExportNote?: (noteId: string, format: ExportFormat) => void;
  onToggleFavorite?: (noteId: string, favorite: boolean) => void;
  sortByManual: boolean;
}

interface ContextMenuState {
  noteId: string;
  x: number;
  y: number;
}

interface SortableNoteItemProps {
  note: NoteSearchResult;
  isSelected: boolean;
  onSelect: (note: NoteSearchResult) => void;
  onDoubleClick?: (note: NoteSearchResult) => void;
  onDeleteNote?: (noteId: string) => void;
  onExportNote?: (noteId: string, format: ExportFormat) => void;
  onToggleFavorite?: (noteId: string, favorite: boolean) => void;
  sortByManual: boolean;
  contextMenu: ContextMenuState | null;
  onContextMenuOpen: (noteId: string, x: number, y: number) => void;
  onContextMenuClose: () => void;
  onDeleteClick: (noteId: string) => void;
  contextMenuRef: React.RefObject<HTMLDivElement | null>;
}

function SortableNoteItem({
  note,
  isSelected,
  onSelect,
  onDoubleClick,
  onDeleteNote,
  onExportNote,
  onToggleFavorite,
  sortByManual,
  contextMenu,
  onContextMenuOpen,
  onContextMenuClose,
  onDeleteClick,
  contextMenuRef,
}: SortableNoteItemProps) {
  // Always draggable — reorder within the list is still gated on
  // `sortByManual` at the handler level, but dragging a note onto a
  // folder (to move it) works regardless of sort mode. Unified UX
  // with folders.
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: note.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const snippet = useMemo(() => {
    if (note.headline) return null; // search results use headline instead
    if (!note.content) return null;
    return stripMarkdown(note.content, 80);
  }, [note.content, note.headline]);

  const relativeDate = useMemo(() => {
    const date = new Date(note.updatedAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }, [note.updatedAt]);

  // `isOver && !isDragging` → another item is being dragged onto this
  // one; match folder drop-target feedback.
  const dropRing = isOver && !isDragging ? "ring-2 ring-primary rounded" : "";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`flex items-start relative mb-px ${dropRing}`}
    >
      <button
        onClick={() => onSelect(note)}
        onDoubleClick={(e) => { e.preventDefault(); onDoubleClick?.(note); }}
        onContextMenu={(e) => {
          if (!onDeleteNote && !onExportNote && !onToggleFavorite) return;
          e.preventDefault();
          onContextMenuOpen(note.id, e.clientX, e.clientY);
        }}
        className={`flex-1 text-left px-2 py-1.5 rounded-md overflow-hidden transition-colors cursor-pointer ${
          isSelected
            ? "bg-accent"
            : "hover:bg-accent"
        }`}
      >
        {/* Title row */}
        <span className="flex items-center gap-1 overflow-hidden">
          {note.favorite && <span className="text-[10px] text-primary shrink-0">★</span>}
          {note.isLocalFile && (
            <span className="shrink-0 mr-1 text-muted-foreground/50" title="Managed locally on desktop">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </span>
          )}
          <span className={`text-sm font-medium truncate ${isSelected ? "text-foreground" : "text-foreground/70"}`}>{note.title || "Untitled"}</span>
        </span>
        {/* Content preview */}
        {note.headline ? (
          <SearchSnippet headline={note.headline} />
        ) : snippet ? (
          <p className="text-xs text-foreground/45 truncate mt-0.5">{snippet}</p>
        ) : null}
        {/* Metadata row */}
        <div className="flex items-center gap-1.5 mt-0.5 overflow-hidden">
          <span className="text-[10px] text-muted-foreground shrink-0">{relativeDate}</span>
          {note.tags && note.tags.length > 0 && (
            <>
              <span className="text-[10px] text-muted-foreground">·</span>
              {note.tags.slice(0, 2).map((tag) => (
                <span key={tag} className="text-[10px] px-1 py-0 rounded bg-primary/15 text-primary/70 truncate max-w-[60px]">{tag}</span>
              ))}
              {note.tags.length > 2 && (
                <span className="text-[10px] text-muted-foreground">+{note.tags.length - 2}</span>
              )}
            </>
          )}
        </div>
      </button>
      {contextMenu?.noteId === note.id && (onDeleteNote || onExportNote || onToggleFavorite) && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 py-1 bg-card border border-border rounded-md shadow-lg inline-flex flex-col"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {onExportNote && (
            <>
              <button
                onClick={() => {
                  onExportNote(note.id, "md");
                  onContextMenuClose();
                }}
                className="block w-full text-left px-3 py-1 text-xs text-foreground hover:bg-accent transition-colors whitespace-nowrap cursor-pointer"
              >
                Export as .md
              </button>
              <button
                onClick={() => {
                  onExportNote(note.id, "txt");
                  onContextMenuClose();
                }}
                className="block w-full text-left px-3 py-1 text-xs text-foreground hover:bg-accent transition-colors whitespace-nowrap cursor-pointer"
              >
                Export as .txt
              </button>
              <button
                onClick={() => {
                  onExportNote(note.id, "pdf");
                  onContextMenuClose();
                }}
                className="block w-full text-left px-3 py-1 text-xs text-foreground hover:bg-accent transition-colors whitespace-nowrap cursor-pointer"
              >
                Export as .pdf
              </button>
            </>
          )}
          {onToggleFavorite && (
            <button
              onClick={() => {
                onToggleFavorite(note.id, !note.favorite);
                onContextMenuClose();
              }}
              className="block w-full text-left px-3 py-1 text-xs text-foreground hover:bg-accent transition-colors whitespace-nowrap cursor-pointer"
            >
              {note.favorite ? "Unfavorite" : "Favorite"}
            </button>
          )}
          {onDeleteNote && (
            <button
              onClick={() => onDeleteClick(note.id)}
              className="w-full text-left px-3 py-1 text-xs text-destructive hover:bg-accent transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function NoteList({
  notes,
  selectedId,
  onSelect,
  onDoubleClick,
  onDeleteNote,
  onExportNote,
  onToggleFavorite,
  sortByManual,
}: NoteListProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return;
    function handleClickOutside(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [contextMenu]);

  function handleDeleteClick(noteId: string) {
    setPendingDeleteId(noteId);
    setContextMenu(null);
  }

  const pendingNote = pendingDeleteId ? notes.find((n) => n.id === pendingDeleteId) : null;

  return (
    <>
      <SortableContext
        items={notes.map((n) => n.id)}
        strategy={verticalListSortingStrategy}
      >
        {notes.map((note) => (
          <SortableNoteItem
            key={note.id}
            note={note}
            isSelected={note.id === selectedId}
            onSelect={onSelect}
            onDoubleClick={onDoubleClick}
            onDeleteNote={onDeleteNote}
            onExportNote={onExportNote}
            onToggleFavorite={onToggleFavorite}
            sortByManual={sortByManual}
            contextMenu={contextMenu}
            onContextMenuOpen={(noteId, x, y) => setContextMenu({ noteId, x, y })}
            onContextMenuClose={() => setContextMenu(null)}
            onDeleteClick={handleDeleteClick}
            contextMenuRef={contextMenuRef}
          />
        ))}
      </SortableContext>

      {/* Delete confirmation dialog */}
      {pendingDeleteId && (
        <ConfirmDialog
          title="Delete Note"
          message={pendingNote?.title || "Untitled"}
          onConfirm={() => {
            onDeleteNote?.(pendingDeleteId);
            setPendingDeleteId(null);
          }}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </>
  );
}
