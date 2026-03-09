import { useState, useEffect, useRef } from "react";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Note, NoteSearchResult } from "@derekentringer/ns-shared";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { SearchSnippet } from "./SearchSnippet.tsx";

interface NoteListProps {
  notes: Note[];
  selectedId: string | null;
  onSelect: (note: Note) => void;
  onDeleteNote?: (noteId: string) => void;
  searchResults?: NoteSearchResult[] | null;
  sortByManual: boolean;
}

interface ContextMenuState {
  noteId: string;
  x: number;
  y: number;
}

interface SortableNoteItemProps {
  note: Note;
  isSelected: boolean;
  onSelect: (note: Note) => void;
  onDeleteNote?: (noteId: string) => void;
  sortByManual: boolean;
  contextMenu: ContextMenuState | null;
  onContextMenuOpen: (noteId: string, x: number, y: number) => void;
  onDeleteClick: (noteId: string) => void;
  contextMenuRef: React.RefObject<HTMLDivElement | null>;
}

function SortableNoteItem({
  note,
  isSelected,
  onSelect,
  onDeleteNote,
  sortByManual,
  contextMenu,
  onContextMenuOpen,
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

  const searchNote = note as NoteSearchResult;

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
        onContextMenu={(e) => {
          if (!onDeleteNote) return;
          e.preventDefault();
          onContextMenuOpen(note.id, e.clientX, e.clientY);
        }}
        className={`flex-1 text-left px-2 py-2 rounded-md text-sm transition-colors cursor-pointer ${
          isSelected
            ? "bg-accent text-foreground"
            : "text-muted hover:bg-accent hover:text-foreground"
        }`}
      >
        <span className="block truncate">
          {note.title || "Untitled"}
        </span>
        {searchNote.headline && (
          <SearchSnippet headline={searchNote.headline} />
        )}
      </button>
      {contextMenu?.noteId === note.id && onDeleteNote && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 py-1 bg-card border border-border rounded-md shadow-lg min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => onDeleteClick(note.id)}
            className="w-full text-left px-3 py-1 text-xs text-destructive hover:bg-accent transition-colors cursor-pointer"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

export function NoteList({
  notes,
  selectedId,
  onSelect,
  onDeleteNote,
  searchResults,
  sortByManual,
}: NoteListProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const displayNotes = searchResults ?? notes;

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

  const pendingNote = pendingDeleteId ? displayNotes.find((n) => n.id === pendingDeleteId) : null;

  return (
    <>
      <SortableContext
        items={displayNotes.map((n) => n.id)}
        strategy={verticalListSortingStrategy}
      >
        {displayNotes.map((note) => (
          <SortableNoteItem
            key={note.id}
            note={note}
            isSelected={note.id === selectedId}
            onSelect={onSelect}
            onDeleteNote={onDeleteNote}
            sortByManual={sortByManual}
            contextMenu={contextMenu}
            onContextMenuOpen={(noteId, x, y) => setContextMenu({ noteId, x, y })}
            onDeleteClick={handleDeleteClick}
            contextMenuRef={contextMenuRef}
          />
        ))}
      </SortableContext>

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
