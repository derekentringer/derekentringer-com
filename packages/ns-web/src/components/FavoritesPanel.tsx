import { useState, useEffect, useRef } from "react";
import type { FolderInfo, Note } from "@derekentringer/shared/ns";

interface FavoritesPanelProps {
  favoriteFolders: FolderInfo[];
  favoriteNotes: Note[];
  activeFolder: string | null;
  selectedNoteId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onSelectNote: (noteId: string) => void;
  onUnfavoriteFolder: (folderId: string) => void;
  onUnfavoriteNote: (noteId: string) => void;
}

interface ContextMenuState {
  type: "folder" | "note";
  id: string;
  x: number;
  y: number;
}

export function FavoritesPanel({
  favoriteFolders,
  favoriteNotes,
  activeFolder,
  selectedNoteId,
  onSelectFolder,
  onSelectNote,
  onUnfavoriteFolder,
  onUnfavoriteNote,
}: FavoritesPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem("ns-favorites-collapsed") === "true";
    } catch {
      return false;
    }
  });
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setContextMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [contextMenu]);

  if (favoriteFolders.length === 0 && favoriteNotes.length === 0) return null;

  return (
    <div className="px-2 py-1" data-testid="favorites-panel">
      <button
        onClick={() =>
          setIsCollapsed((v) => {
            const next = !v;
            try {
              localStorage.setItem("ns-favorites-collapsed", String(next));
            } catch {}
            return next;
          })
        }
        className="flex items-center gap-1.5 px-1 mb-1 text-sm text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors w-full text-left"
      >
        <span
          className="inline-block transition-transform"
          style={{
            transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
          }}
        >
          ▾
        </span>
        Favorites
      </button>

      {!isCollapsed && (
        <div className="max-h-[200px] overflow-y-auto">
          {/* Favorite folders */}
          {favoriteFolders.map((folder) => (
            <button
              key={`fav-folder-${folder.id}`}
              onClick={() => onSelectFolder(folder.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ type: "folder", id: folder.id, x: e.clientX, y: e.clientY });
              }}
              className={`w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors flex items-center gap-1 ${
                activeFolder === folder.id
                  ? "text-foreground bg-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              <span className="text-xs shrink-0">📁</span>
              <span className="truncate">{folder.name}</span>
            </button>
          ))}

          {/* Favorite notes */}
          {favoriteNotes.map((note) => (
            <button
              key={`fav-note-${note.id}`}
              onClick={() => onSelectNote(note.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ type: "note", id: note.id, x: e.clientX, y: e.clientY });
              }}
              className={`w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors truncate ${
                selectedNoteId === note.id
                  ? "text-foreground bg-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              {note.title || "Untitled"}
            </button>
          ))}
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 py-1 bg-card border border-border rounded-md shadow-lg min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              if (contextMenu.type === "folder") {
                onUnfavoriteFolder(contextMenu.id);
              } else {
                onUnfavoriteNote(contextMenu.id);
              }
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1 text-xs text-foreground hover:bg-accent transition-colors"
          >
            Unfavorite
          </button>
        </div>
      )}
    </div>
  );
}
