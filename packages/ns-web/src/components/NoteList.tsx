import { useState, useEffect, useRef } from "react";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { NoteSearchResult } from "@derekentringer/shared/ns";
import type { ExportFormat } from "../lib/importExport.ts";
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

  return (
    <div ref={setNodeRef} style={style} className="flex items-center relative">
      {sortByManual && (
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab px-1 text-muted-foreground hover:text-foreground text-xs select-none shrink-0"
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
        className={`flex-1 text-left px-2 py-2 rounded-md text-sm transition-colors ${
          isSelected
            ? "bg-accent text-foreground"
            : "text-muted hover:bg-accent hover:text-foreground"
        }`}
      >
        <span className="block truncate">
          {note.favorite && <span className="text-[10px] text-primary mr-1">★</span>}
          {note.title || "Untitled"}
        </span>
        {note.headline && <SearchSnippet headline={note.headline} />}
      </button>
      {contextMenu?.noteId === note.id && (onDeleteNote || onExportNote || onToggleFavorite) && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 py-1 bg-card border border-border rounded-md shadow-lg min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {onExportNote && (
            <>
              <button
                onClick={() => {
                  onExportNote(note.id, "md");
                  onContextMenuClose();
                }}
                className="w-full text-left px-3 py-1 text-xs text-foreground hover:bg-accent transition-colors"
              >
                Export as .md
              </button>
              <button
                onClick={() => {
                  onExportNote(note.id, "txt");
                  onContextMenuClose();
                }}
                className="w-full text-left px-3 py-1 text-xs text-foreground hover:bg-accent transition-colors"
              >
                Export as .txt
              </button>
              <button
                onClick={() => {
                  onExportNote(note.id, "pdf");
                  onContextMenuClose();
                }}
                className="w-full text-left px-3 py-1 text-xs text-foreground hover:bg-accent transition-colors"
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
              className="w-full text-left px-3 py-1 text-xs text-foreground hover:bg-accent transition-colors"
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
