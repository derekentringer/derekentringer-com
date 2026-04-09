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
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: note.id, disabled: !sortByManual });

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

  return (
    <div ref={setNodeRef} style={style} className="flex items-start relative mb-px">
      {sortByManual && (
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab px-1 pt-2.5 text-muted-foreground hover:text-foreground text-xs select-none shrink-0"
          title="Drag to reorder"
        >
          &#x2630;
        </span>
      )}
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
            ? "bg-accent text-foreground"
            : "text-muted hover:bg-accent hover:text-foreground"
        }`}
      >
        {/* Title row */}
        <span className="flex items-center gap-1 overflow-hidden">
          {note.favorite && <span className="text-[10px] text-primary shrink-0">★</span>}
          <span className="text-sm font-medium truncate">{note.title || "Untitled"}</span>
          {note.isLocalFile && (
            <span
              className="inline-block w-1.5 h-1.5 rounded-full shrink-0 bg-muted-foreground/50"
              title="This note is linked to a local file"
            />
          )}
        </span>
        {/* Content preview */}
        {note.headline ? (
          <SearchSnippet headline={note.headline} />
        ) : snippet ? (
          <p className="text-xs text-foreground/50 truncate mt-0.5">{snippet}</p>
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
