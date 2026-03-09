import { useState, useEffect, useRef } from "react";
import type { Note } from "@derekentringer/ns-shared";
import { ConfirmDialog } from "./ConfirmDialog.tsx";

interface NoteListProps {
  notes: Note[];
  selectedId: string | null;
  onSelect: (note: Note) => void;
  onDeleteNote?: (noteId: string) => void;
}

interface ContextMenuState {
  noteId: string;
  x: number;
  y: number;
}

export function NoteList({
  notes,
  selectedId,
  onSelect,
  onDeleteNote,
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
      {notes.map((note) => (
        <div key={note.id} className="flex items-center relative">
          <button
            onClick={() => onSelect(note)}
            onContextMenu={(e) => {
              if (!onDeleteNote) return;
              e.preventDefault();
              setContextMenu({ noteId: note.id, x: e.clientX, y: e.clientY });
            }}
            className={`flex-1 text-left px-2 py-2 rounded-md text-sm transition-colors ${
              note.id === selectedId
                ? "bg-accent text-foreground"
                : "text-muted hover:bg-accent hover:text-foreground"
            }`}
          >
            <span className="block truncate">
              {note.title || "Untitled"}
            </span>
          </button>
          {contextMenu?.noteId === note.id && onDeleteNote && (
            <div
              ref={contextMenuRef}
              className="fixed z-50 py-1 bg-card border border-border rounded-md shadow-lg min-w-[140px]"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              <button
                onClick={() => handleDeleteClick(note.id)}
                className="w-full text-left px-3 py-1 text-xs text-destructive hover:bg-accent transition-colors"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      ))}

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
