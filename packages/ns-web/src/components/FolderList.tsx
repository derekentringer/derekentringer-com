import { useState } from "react";
import type { FolderInfo, FolderSortField, SortOrder } from "@derekentringer/shared/ns";

interface FolderListProps {
  folders: FolderInfo[];
  activeFolder: string | null;
  totalNotes: number;
  folderSortBy: FolderSortField;
  folderSortOrder: SortOrder;
  onFolderSortByChange: (field: FolderSortField) => void;
  onFolderSortOrderChange: (order: SortOrder) => void;
  onSelectFolder: (folder: string | null) => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (oldName: string, newName: string) => void;
  onDeleteFolder: (name: string) => void;
}

const folderSortFields: { value: FolderSortField; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "createdAt", label: "Created" },
];

export function FolderList({
  folders,
  activeFolder,
  totalNotes,
  folderSortBy,
  folderSortOrder,
  onFolderSortByChange,
  onFolderSortOrderChange,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
}: FolderListProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [contextMenu, setContextMenu] = useState<string | null>(null);

  const unfiledCount =
    totalNotes - folders.reduce((sum, f) => sum + f.count, 0);

  function handleCreateSubmit() {
    const trimmed = newFolderName.trim();
    if (trimmed) {
      onCreateFolder(trimmed);
      setNewFolderName("");
    }
    setIsCreating(false);
  }

  function handleRenameSubmit(oldName: string) {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== oldName) {
      onRenameFolder(oldName, trimmed);
    }
    setRenamingFolder(null);
    setRenameValue("");
  }

  function startRename(name: string) {
    setRenamingFolder(name);
    setRenameValue(name);
    setContextMenu(null);
  }

  function handleDelete(name: string) {
    onDeleteFolder(name);
    setContextMenu(null);
  }

  return (
    <div className="px-2 py-1">
      <div className="flex items-center justify-between px-1 mb-1">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">
          Folders
        </span>
        <div className="flex items-center gap-1">
          <select
            value={folderSortBy}
            onChange={(e) => onFolderSortByChange(e.target.value as FolderSortField)}
            className="px-1 py-0 rounded bg-transparent border-none text-[10px] text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer"
            aria-label="Sort folders by"
          >
            {folderSortFields.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => onFolderSortOrderChange(folderSortOrder === "asc" ? "desc" : "asc")}
            className="w-5 h-5 flex items-center justify-center rounded bg-subtle text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            title={folderSortOrder === "asc" ? "Ascending" : "Descending"}
            aria-label={`Sort folders ${folderSortOrder === "asc" ? "ascending" : "descending"}`}
          >
            {folderSortOrder === "asc" ? "\u2191" : "\u2193"}
          </button>
          <button
            onClick={() => setIsCreating(true)}
            className="w-5 h-5 flex items-center justify-center rounded bg-subtle text-xs text-muted-foreground hover:text-foreground transition-colors"
            title="New folder"
          >
            +
          </button>
        </div>
      </div>

      {/* All Notes */}
      <button
        onClick={() => onSelectFolder(null)}
        className={`w-full text-left px-2 py-1 rounded text-sm transition-colors truncate ${
          activeFolder === null
            ? "text-foreground bg-accent"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        }`}
      >
        All Notes
        <span className="ml-1 text-xs opacity-60">{totalNotes}</span>
      </button>

      {/* Unfiled */}
      {unfiledCount > 0 && (
        <button
          onClick={() => onSelectFolder("__unfiled__")}
          className={`w-full text-left px-2 py-1 rounded text-sm transition-colors truncate ${
            activeFolder === "__unfiled__"
              ? "text-foreground bg-accent"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          Unfiled
          <span className="ml-1 text-xs opacity-60">{unfiledCount}</span>
        </button>
      )}

      {/* Folders */}
      {folders.map((folder) => (
        <div key={folder.name} className="relative">
          {renamingFolder === folder.name ? (
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => handleRenameSubmit(folder.name)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameSubmit(folder.name);
                if (e.key === "Escape") {
                  setRenamingFolder(null);
                  setRenameValue("");
                }
              }}
              autoFocus
              className="w-full px-2 py-1 rounded text-sm bg-input border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          ) : (
            <button
              onClick={() => onSelectFolder(folder.name)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu(
                  contextMenu === folder.name ? null : folder.name,
                );
              }}
              className={`w-full text-left px-2 py-1 rounded text-sm transition-colors truncate ${
                activeFolder === folder.name
                  ? "text-foreground bg-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              {folder.name}
              <span className="ml-1 text-xs opacity-60">{folder.count}</span>
            </button>
          )}

          {/* Context menu */}
          {contextMenu === folder.name && (
            <div className="absolute right-0 top-full z-10 mt-0.5 py-1 bg-card border border-border rounded-md shadow-lg min-w-[100px]">
              <button
                onClick={() => startRename(folder.name)}
                className="w-full text-left px-3 py-1 text-xs text-foreground hover:bg-accent transition-colors"
              >
                Rename
              </button>
              <button
                onClick={() => handleDelete(folder.name)}
                className="w-full text-left px-3 py-1 text-xs text-destructive hover:bg-accent transition-colors"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      ))}

      {/* Inline create */}
      {isCreating && (
        <input
          type="text"
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          onBlur={handleCreateSubmit}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreateSubmit();
            if (e.key === "Escape") {
              setIsCreating(false);
              setNewFolderName("");
            }
          }}
          autoFocus
          placeholder="Folder name"
          className="w-full px-2 py-1 rounded text-sm bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      )}
    </div>
  );
}
