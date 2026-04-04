import { useState, useEffect, useRef } from "react";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { FolderInfo, Note, NoteSortField, SortOrder } from "@derekentringer/shared/ns";

interface FavoritesPanelProps {
  favoriteFolders: FolderInfo[];
  favoriteNotes: Note[];
  activeFolder: string | null;
  selectedNoteId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onSelectNote: (noteId: string) => void;
  onDoubleClickNote?: (noteId: string) => void;
  onUnfavoriteFolder: (folderId: string) => void;
  onUnfavoriteNote: (noteId: string) => void;
  favSortBy: NoteSortField;
  favSortOrder: SortOrder;
  onFavSortByChange: (field: NoteSortField) => void;
  onFavSortOrderChange: (order: SortOrder) => void;
}

interface ContextMenuState {
  type: "folder" | "note";
  id: string;
  x: number;
  y: number;
}

function SortableFavoriteNoteItem({
  note,
  isSelected,
  onSelect,
  onDoubleClick,
  onContextMenu,
  sortByManual,
}: {
  note: Note;
  isSelected: boolean;
  onSelect: (noteId: string) => void;
  onDoubleClick?: (noteId: string) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  sortByManual: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `fav-note:${note.id}`, disabled: !sortByManual });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center">
      {sortByManual && (
        <span
          {...attributes}
          {...listeners}
          className="shrink-0 w-4 text-[10px] text-muted-foreground cursor-grab select-none"
          aria-label="Drag to reorder"
        >
          ☰
        </span>
      )}
      <button
        onClick={() => onSelect(note.id)}
        onDoubleClick={(e) => { e.preventDefault(); onDoubleClick?.(note.id); }}
        onContextMenu={onContextMenu}
        className={`flex-1 text-left px-2 py-1.5 rounded-md text-sm transition-colors truncate cursor-pointer ${
          isSelected
            ? "text-foreground bg-accent"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        }`}
      >
        {note.title || "Untitled"}
      </button>
    </div>
  );
}

export function FavoritesPanel({
  favoriteFolders,
  favoriteNotes,
  activeFolder,
  selectedNoteId,
  onSelectFolder,
  onSelectNote,
  onDoubleClickNote,
  onUnfavoriteFolder,
  onUnfavoriteNote,
  favSortBy,
  favSortOrder,
  onFavSortByChange,
  onFavSortOrderChange,
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

  const sortByManual = favSortBy === "sortOrder";

  return (
    <div className="px-2 pt-2" data-testid="favorites-panel">
      <div className="flex items-center justify-between mb-1">
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground uppercase tracking-wider">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
          Favorites
        </span>
        <div className="flex items-center gap-1">
          <select
            value={favSortBy}
            onChange={(e) => onFavSortByChange(e.target.value as NoteSortField)}
            className="appearance-none h-5 pr-4 pl-1.5 py-0 rounded bg-subtle bg-[length:8px_8px] bg-[right_4px_center] bg-no-repeat border-none text-[10px] text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer"
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")" }}
            aria-label="Sort favorites by"
            data-testid="fav-sort-by"
          >
            <option value="sortOrder">Manual</option>
            <option value="updatedAt">Modified</option>
            <option value="createdAt">Created</option>
            <option value="title">Title</option>
          </select>
          <button
            onClick={() => onFavSortOrderChange(favSortOrder === "asc" ? "desc" : "asc")}
            className="w-5 h-5 flex items-center justify-center rounded bg-subtle text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title={favSortOrder === "asc" ? "Ascending" : "Descending"}
            aria-label={`Sort favorites ${favSortOrder === "asc" ? "ascending" : "descending"}`}
            data-testid="fav-sort-order"
          >
            {favSortOrder === "asc" ? "\u2191" : "\u2193"}
          </button>
        </div>
      </div>

      <div className="overflow-y-auto">
            {/* Favorite folders */}
            {favoriteFolders.map((folder) => (
              <button
                key={`fav-folder-${folder.id}`}
                onClick={() => onSelectFolder(folder.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ type: "folder", id: folder.id, x: e.clientX, y: e.clientY });
                }}
                className={`w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors flex items-center gap-1 cursor-pointer ${
                  activeFolder === folder.id
                    ? "text-foreground bg-accent"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <span className="text-xs shrink-0">📁</span>
                <span className="truncate">{folder.name}</span>
              </button>
            ))}

            {/* Favorite notes (sortable) */}
            <SortableContext
              items={favoriteNotes.map((n) => `fav-note:${n.id}`)}
              strategy={verticalListSortingStrategy}
            >
              {favoriteNotes.map((note) => (
                <SortableFavoriteNoteItem
                  key={`fav-note-${note.id}`}
                  note={note}
                  isSelected={selectedNoteId === note.id}
                  onSelect={onSelectNote}
                  onDoubleClick={onDoubleClickNote}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ type: "note", id: note.id, x: e.clientX, y: e.clientY });
                  }}
                  sortByManual={sortByManual}
                />
              ))}
            </SortableContext>
      </div>

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
            className="w-full text-left px-3 py-1 text-xs text-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            Unfavorite
          </button>
        </div>
      )}
    </div>
  );
}
