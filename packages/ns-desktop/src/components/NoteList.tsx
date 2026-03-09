import { useState, useEffect, useRef } from "react";
import type { Note, NoteSearchResult, FolderInfo } from "@derekentringer/ns-shared";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { SearchSnippet } from "./SearchSnippet.tsx";
import { flattenFolderTree, getFolderBreadcrumb } from "./FolderTree.tsx";

interface NoteListProps {
  notes: Note[];
  selectedId: string | null;
  onSelect: (note: Note) => void;
  onDeleteNote?: (noteId: string) => void;
  searchResults?: NoteSearchResult[] | null;
  folders?: FolderInfo[];
  activeFolder?: string | null;
  onMoveToFolder?: (noteId: string, folderId: string | null) => void;
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
  searchResults,
  folders,
  activeFolder,
  onMoveToFolder,
}: NoteListProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [showFolderSubmenu, setShowFolderSubmenu] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const displayNotes = searchResults ?? notes;

  useEffect(() => {
    if (!contextMenu) return;
    function handleClickOutside(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
        setShowFolderSubmenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [contextMenu]);

  function handleDeleteClick(noteId: string) {
    setPendingDeleteId(noteId);
    setContextMenu(null);
    setShowFolderSubmenu(false);
  }

  function handleMoveToFolder(noteId: string, folderId: string | null) {
    onMoveToFolder?.(noteId, folderId);
    setContextMenu(null);
    setShowFolderSubmenu(false);
  }

  const flatFolders = folders ? flattenFolderTree(folders) : [];

  const pendingNote = pendingDeleteId ? displayNotes.find((n) => n.id === pendingDeleteId) : null;

  return (
    <>
      {displayNotes.map((note) => {
        const searchNote = note as NoteSearchResult;
        // Show folder breadcrumb when viewing "All Notes" (activeFolder is null)
        const showBreadcrumb = activeFolder === null && note.folderId && folders;
        const breadcrumb = showBreadcrumb
          ? getFolderBreadcrumb(folders!, note.folderId!)
          : null;

        return (
          <div key={note.id} className="flex items-center relative">
            <button
              onClick={() => onSelect(note)}
              onContextMenu={(e) => {
                if (!onDeleteNote && !onMoveToFolder) return;
                e.preventDefault();
                setContextMenu({ noteId: note.id, x: e.clientX, y: e.clientY });
                setShowFolderSubmenu(false);
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
              {breadcrumb && breadcrumb.length > 0 && (
                <span className="block text-[10px] text-muted-foreground truncate">
                  {breadcrumb.map((b) => b.name).join(" / ")}
                </span>
              )}
              {searchNote.headline && (
                <SearchSnippet headline={searchNote.headline} />
              )}
            </button>
            {contextMenu?.noteId === note.id && (onDeleteNote || onMoveToFolder) && (
              <div
                ref={contextMenuRef}
                className="fixed z-50 py-1 bg-card border border-border rounded-md shadow-lg min-w-[140px]"
                style={{ left: contextMenu.x, top: contextMenu.y }}
              >
                {onMoveToFolder && (
                  <div className="relative">
                    <button
                      onClick={() => setShowFolderSubmenu((v) => !v)}
                      className="w-full text-left px-3 py-1 text-xs text-foreground hover:bg-accent transition-colors flex items-center justify-between"
                    >
                      Move to folder
                      <span className="text-[10px] ml-2">▸</span>
                    </button>
                    {showFolderSubmenu && (
                      <div className="absolute left-full top-0 ml-0.5 bg-card border border-border rounded-md shadow-lg py-1 min-w-[120px] max-h-48 overflow-y-auto z-50">
                        <button
                          onClick={() => handleMoveToFolder(note.id, null)}
                          className="w-full text-left px-3 py-1 text-xs text-muted-foreground hover:bg-accent transition-colors"
                        >
                          Unfiled
                        </button>
                        {flatFolders.map((f) => (
                          <button
                            key={f.id}
                            onClick={() => handleMoveToFolder(note.id, f.id)}
                            className="w-full text-left px-3 py-1 text-xs text-foreground hover:bg-accent transition-colors"
                          >
                            {f.displayName}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {onDeleteNote && (
                  <button
                    onClick={() => handleDeleteClick(note.id)}
                    className="w-full text-left px-3 py-1 text-xs text-destructive hover:bg-accent transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

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
