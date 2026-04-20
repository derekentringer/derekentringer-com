import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import type { FolderInfo, FolderSortField, SortOrder } from "@derekentringer/shared/ns";
import {
  sortFolderTree,
  filterFolderTree,
  folderIdsToExpandForFilter,
} from "@derekentringer/shared/ns";
import { ConfirmDialog } from "./ConfirmDialog.tsx";

const VALID_FOLDER_SORT_FIELDS: FolderSortField[] = ["name", "createdAt", "updatedAt"];
const VALID_SORT_ORDERS: SortOrder[] = ["asc", "desc"];

function validateFolderSortField(value: string | null, fallback: FolderSortField): FolderSortField {
  return value && VALID_FOLDER_SORT_FIELDS.includes(value as FolderSortField)
    ? (value as FolderSortField)
    : fallback;
}

function validateSortOrder(value: string | null, fallback: SortOrder): SortOrder {
  return value && VALID_SORT_ORDERS.includes(value as SortOrder)
    ? (value as SortOrder)
    : fallback;
}

interface FolderTreeProps {
  folders: FolderInfo[];
  activeFolder: string | null;
  totalNotes: number;
  onSelectFolder: (folderId: string | null) => void;
  onCreateFolder: (name: string, parentId?: string) => void;
  onRenameFolder: (folderId: string, newName: string) => void;
  onDeleteFolder: (folderId: string, mode: "move-up" | "recursive") => void;
  onMoveFolder: (folderId: string, parentId: string | null) => void;
  onExportFolder?: (folderId: string) => void;
  onToggleFavorite?: (folderId: string, favorite: boolean) => void;
}

interface FolderTreeNodeProps {
  folder: FolderInfo;
  depth: number;
  activeFolder: string | null;
  expandedMap: Map<string, boolean>;
  // Set of folder ids that must render expanded regardless of the
  // user-managed expandedMap — populated while the filter input has
  // text so every folder on the path to a match is visible.
  forcedExpanded: Set<string> | null;
  onToggleExpand: (folderId: string) => void;
  onSelectFolder: (folderId: string | null) => void;
  renamingFolder: string | null;
  renameValue: string;
  setRenamingFolder: (id: string | null) => void;
  setRenameValue: (value: string) => void;
  onRenameSubmit: (folderId: string) => void;
  onContextMenu: (e: React.MouseEvent, folder: FolderInfo) => void;
  creatingIn: string | null;
  newFolderName: string;
  setCreatingIn: (id: string | null) => void;
  setNewFolderName: (name: string) => void;
  onCreateSubmit: (parentId: string) => void;
}

function DraggableFolderItem({
  folderId,
  children,
}: {
  folderId: string;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: `folder:${folderId}`,
  });
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `drag-folder:${folderId}`,
  });

  return (
    <div
      ref={(node) => {
        setDropRef(node);
        setDragRef(node);
      }}
      {...attributes}
      {...listeners}
      className={`${isOver ? "ring-2 ring-primary rounded" : ""} ${isDragging ? "opacity-50" : ""}`}
    >
      {children}
    </div>
  );
}

function FolderTreeNode({
  folder,
  depth,
  activeFolder,
  expandedMap,
  forcedExpanded,
  onToggleExpand,
  onSelectFolder,
  renamingFolder,
  renameValue,
  setRenamingFolder,
  setRenameValue,
  onRenameSubmit,
  onContextMenu,
  creatingIn,
  newFolderName,
  setCreatingIn,
  setNewFolderName,
  onCreateSubmit,
}: FolderTreeNodeProps) {
  // Forced expansion wins over user state so filter matches are
  // visible in-tree; otherwise fall back to the user-managed map.
  const isExpanded =
    (forcedExpanded?.has(folder.id) ?? false) ||
    (expandedMap.get(folder.id) ?? false);
  const hasChildren = folder.children.length > 0;
  const paddingLeft = depth * 16 + 8;

  return (
    <div>
      <DraggableFolderItem folderId={folder.id}>
        <div className="relative">
          {renamingFolder === folder.id ? (
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => onRenameSubmit(folder.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onRenameSubmit(folder.id);
                if (e.key === "Escape") {
                  setRenamingFolder(null);
                  setRenameValue("");
                }
              }}
              autoFocus
              style={{ paddingLeft }}
              className="w-full pr-2 py-1 rounded text-sm bg-input border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          ) : (
            <button
              onClick={() => onSelectFolder(folder.id)}
              onContextMenu={(e) => onContextMenu(e, folder)}
              className={`w-full text-left pr-2 py-1 rounded text-sm transition-colors flex items-center cursor-pointer ${
                activeFolder === folder.id
                  ? "text-foreground bg-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
              style={{ paddingLeft }}
            >
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand(folder.id);
                }}
                className="inline-flex items-center justify-center w-4 h-4 mr-0.5 text-[10px] cursor-pointer shrink-0 select-none"
              >
                {isExpanded ? "\u25BC" : "\u25B6"}
              </span>
              <span className="truncate">{folder.name}</span>
              {folder.isLocalFile === true && (
                <span className="shrink-0 ml-1 text-muted-foreground/50" title="Managed locally on desktop">
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </span>
              )}
              {folder.favorite && <span className="text-[10px] text-primary shrink-0 ml-0.5">★</span>}
              <span className="ml-1 text-xs opacity-60 shrink-0">
                {folder.totalCount}
              </span>
            </button>
          )}
        </div>
      </DraggableFolderItem>

      {/* Inline create inside this folder */}
      {creatingIn === folder.id && (
        <input
          type="text"
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          onBlur={() => onCreateSubmit(folder.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCreateSubmit(folder.id);
            if (e.key === "Escape") {
              setCreatingIn(null);
              setNewFolderName("");
            }
          }}
          autoFocus
          placeholder="Subfolder name"
          style={{ paddingLeft: paddingLeft + 16 }}
          className="w-full pr-2 py-1 rounded text-sm bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      )}

      {/* Children */}
      {isExpanded &&
        folder.children.map((child) => (
          <FolderTreeNode
            key={child.id}
            folder={child}
            depth={depth + 1}
            activeFolder={activeFolder}
            expandedMap={expandedMap}
            forcedExpanded={forcedExpanded}
            onToggleExpand={onToggleExpand}
            onSelectFolder={onSelectFolder}
            renamingFolder={renamingFolder}
            renameValue={renameValue}
            setRenamingFolder={setRenamingFolder}
            setRenameValue={setRenameValue}
            onRenameSubmit={onRenameSubmit}
            onContextMenu={onContextMenu}
            creatingIn={creatingIn}
            newFolderName={newFolderName}
            setCreatingIn={setCreatingIn}
            setNewFolderName={setNewFolderName}
            onCreateSubmit={onCreateSubmit}
          />
        ))}
    </div>
  );
}

const EXPANDED_KEY = "ns-folder-expanded";

function loadExpandedState(): Map<string, boolean> {
  try {
    const stored = localStorage.getItem(EXPANDED_KEY);
    if (stored) {
      const obj = JSON.parse(stored);
      return new Map(Object.entries(obj));
    }
  } catch {
    // ignore
  }
  return new Map();
}

function saveExpandedState(map: Map<string, boolean>) {
  const obj = Object.fromEntries(map);
  localStorage.setItem(EXPANDED_KEY, JSON.stringify(obj));
}

export function FolderTree({
  folders,
  activeFolder,
  totalNotes,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveFolder,
  onExportFolder,
  onToggleFavorite,
}: FolderTreeProps) {
  const [expandedMap, setExpandedMap] = useState<Map<string, boolean>>(() => {
    const stored = loadExpandedState();
    // Default root folders with children to expanded if not in storage
    for (const f of folders) {
      if (!stored.has(f.id)) stored.set(f.id, f.children.length > 0);
    }
    return stored;
  });

  const [isCreating, setIsCreating] = useState(false);
  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [contextMenu, setContextMenu] = useState<{
    folder: FolderInfo;
    x: number;
    y: number;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FolderInfo | null>(null);
  const [isSectionCollapsed, setIsSectionCollapsed] = useState(() => {
    try {
      return localStorage.getItem("ns-folders-collapsed") === "true";
    } catch {
      return false;
    }
  });

  // Sort + filter state — mirrors NoteListPanel for UX parity.
  const [sortBy, setSortBy] = useState<FolderSortField>(() => {
    try {
      return validateFolderSortField(localStorage.getItem("ns-folder-sort-by"), "name");
    } catch { return "name"; }
  });
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => {
    try {
      return validateSortOrder(localStorage.getItem("ns-folder-sort-order"), "asc");
    } catch { return "asc"; }
  });
  const [filter, setFilter] = useState("");

  useEffect(() => { try { localStorage.setItem("ns-folder-sort-by", sortBy); } catch {} }, [sortBy]);
  useEffect(() => { try { localStorage.setItem("ns-folder-sort-order", sortOrder); } catch {} }, [sortOrder]);

  // Apply filter first (keeps ancestors of matches), then sort the
  // pruned tree. Doing it in this order means sorted-by-Modified works
  // on the subset the user is currently looking at.
  const displayFolders = useMemo(() => {
    const filtered = filter ? filterFolderTree(folders, filter) : folders;
    return sortFolderTree(filtered, sortBy, sortOrder);
  }, [folders, filter, sortBy, sortOrder]);

  // Auto-expand every folder on the path to a filter match so the
  // match is visible without the user having to click down into the
  // tree. When the filter is cleared, expandedMap reverts to its
  // user-managed state.
  const forcedExpanded = useMemo(
    () => (filter ? folderIdsToExpandForFilter(folders, filter) : null),
    [folders, filter],
  );

  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Ensure new root folders default to expanded (only if they have children)
  useEffect(() => {
    setExpandedMap((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const f of folders) {
        if (!next.has(f.id)) {
          next.set(f.id, f.children.length > 0);
          changed = true;
        }
      }
      if (changed) saveExpandedState(next);
      return changed ? next : prev;
    });
  }, [folders]);

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

  const unfiledCount = (() => {
    function sumCounts(items: FolderInfo[]): number {
      let total = 0;
      for (const f of items) {
        total += f.count;
        total += sumCounts(f.children);
      }
      return total;
    }
    return totalNotes - sumCounts(folders);
  })();

  function handleToggleExpand(folderId: string) {
    setExpandedMap((prev) => {
      const next = new Map(prev);
      next.set(folderId, !prev.get(folderId));
      saveExpandedState(next);
      return next;
    });
  }

  function handleCreateSubmit() {
    const trimmed = newFolderName.trim();
    if (trimmed) {
      onCreateFolder(trimmed);
      setNewFolderName("");
    }
    setIsCreating(false);
  }

  function handleCreateInSubmit(parentId: string) {
    const trimmed = newFolderName.trim();
    if (trimmed) {
      onCreateFolder(trimmed, parentId);
      setNewFolderName("");
      // Expand parent
      setExpandedMap((prev) => {
        const next = new Map(prev);
        next.set(parentId, true);
        saveExpandedState(next);
        return next;
      });
    }
    setCreatingIn(null);
  }

  function handleRenameSubmit(folderId: string) {
    const trimmed = renameValue.trim();
    const folder = findFolder(folders, folderId);
    if (trimmed && folder && trimmed !== folder.name) {
      onRenameFolder(folderId, trimmed);
    }
    setRenamingFolder(null);
    setRenameValue("");
  }

  function startRename(folder: FolderInfo) {
    setRenamingFolder(folder.id);
    setRenameValue(folder.name);
    setContextMenu(null);
  }

  function startCreateSubfolder(folder: FolderInfo) {
    setCreatingIn(folder.id);
    setNewFolderName("");
    setContextMenu(null);
  }

  function handleDeleteClick(folder: FolderInfo) {
    setPendingDelete(folder);
    setContextMenu(null);
  }


  function handleContextMenu(e: React.MouseEvent, folder: FolderInfo) {
    e.preventDefault();
    setContextMenu(
      contextMenu?.folder.id === folder.id
        ? null
        : { folder, x: e.clientX, y: e.clientY },
    );
  }

  return (
    <div>
      {/* Sticky header — pins the title + sort controls + filter to
          the top of the scrolling ancestor (the sidebar `overflow-y-auto`
          wrapper in NotesPage, whether the sidebar is side-by-side or
          stacked above the notes list). Matches the NOTES panel UX. */}
      <div className="sticky top-0 z-10 bg-sidebar px-2 pt-2">
      <div className="flex items-center justify-between mb-1">
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground uppercase tracking-wider">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></svg>
          Folders
        </span>
        <div className="flex items-center gap-1">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as FolderSortField)}
            className="appearance-none h-5 pr-4 pl-1.5 py-0 rounded bg-subtle bg-[length:8px_8px] bg-[right_4px_center] bg-no-repeat border-none text-[10px] text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer"
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")" }}
            aria-label="Sort folders by"
          >
            <option value="name">Name</option>
            <option value="createdAt">Created</option>
            <option value="updatedAt">Modified</option>
          </select>
          <button
            onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
            className="w-5 h-5 flex items-center justify-center rounded bg-subtle text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title={sortOrder === "asc" ? "Ascending" : "Descending"}
            aria-label={`Sort folders ${sortOrder === "asc" ? "ascending" : "descending"}`}
          >
            {sortOrder === "asc" ? "\u2191" : "\u2193"}
          </button>
          <button
            onClick={() => setIsCreating(true)}
            className="w-5 h-5 flex items-center justify-center rounded bg-subtle text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="New folder"
          >
            +
          </button>
        </div>
      </div>

      {/* Filter input */}
      <div className="relative mb-1">
        <input
          type="text"
          placeholder="Filter folders..."
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
      </div>

      {/* Tree content (scrolls under the sticky header) */}
      <div className="px-2">

      {/* All Notes */}
          <button
            onClick={() => onSelectFolder(null)}
            className={`w-full text-left px-2 py-1 rounded text-sm transition-colors truncate cursor-pointer ${
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
            <DroppableZone droppableId="folder:__unfiled__">
              <button
                onClick={() => onSelectFolder("__unfiled__")}
                className={`w-full text-left px-2 py-1 rounded text-sm transition-colors truncate cursor-pointer ${
                  activeFolder === "__unfiled__"
                    ? "text-foreground bg-accent"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                Unfiled
                <span className="ml-1 text-xs opacity-60">{unfiledCount}</span>
              </button>
            </DroppableZone>
          )}

          {/* Folder tree */}
          {displayFolders.map((folder) => (
            <FolderTreeNode
              key={folder.id}
              folder={folder}
              depth={0}
              activeFolder={activeFolder}
              expandedMap={expandedMap}
              forcedExpanded={forcedExpanded}
              onToggleExpand={handleToggleExpand}
              onSelectFolder={onSelectFolder}
              renamingFolder={renamingFolder}
              renameValue={renameValue}
              setRenamingFolder={setRenamingFolder}
              setRenameValue={setRenameValue}
              onRenameSubmit={handleRenameSubmit}
              onContextMenu={handleContextMenu}
              creatingIn={creatingIn}
              newFolderName={newFolderName}
              setCreatingIn={setCreatingIn}
              setNewFolderName={setNewFolderName}
              onCreateSubmit={handleCreateInSubmit}
              />
          ))}

          {/* Root drop zone */}
          <DroppableZone droppableId="folder:__root__">
            <div className="h-4 w-full" />
          </DroppableZone>

          {/* Inline create at root */}
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

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 py-1 bg-card border border-border rounded-md shadow-lg inline-flex flex-col"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => startCreateSubfolder(contextMenu.folder)}
            className="w-full text-left px-3 py-1 text-xs text-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            New Subfolder
          </button>
          <button
            onClick={() => startRename(contextMenu.folder)}
            className="w-full text-left px-3 py-1 text-xs text-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            Rename
          </button>
          {onExportFolder && (
            <button
              onClick={() => {
                onExportFolder(contextMenu.folder.id);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1 text-xs text-foreground hover:bg-accent transition-colors cursor-pointer"
            >
              Export as .zip
            </button>
          )}
          {onToggleFavorite && (
            <button
              onClick={() => {
                onToggleFavorite(contextMenu.folder.id, !contextMenu.folder.favorite);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1 text-xs text-foreground hover:bg-accent transition-colors cursor-pointer"
            >
              {contextMenu.folder.favorite ? "Unfavorite" : "Favorite"}
            </button>
          )}
          <button
            onClick={() => handleDeleteClick(contextMenu.folder)}
            className="w-full text-left px-3 py-1 text-xs text-destructive hover:bg-accent transition-colors cursor-pointer"
          >
            Delete
          </button>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {pendingDelete && (
        <FolderDeleteDialog
          folder={pendingDelete}
          onConfirm={(mode) => {
            onDeleteFolder(pendingDelete.id, mode);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

function DroppableZone({
  droppableId,
  children,
}: {
  droppableId: string;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: droppableId });
  return (
    <div
      ref={setNodeRef}
      className={isOver ? "ring-2 ring-primary rounded" : ""}
    >
      {children}
    </div>
  );
}

function FolderDeleteDialog({
  folder,
  onConfirm,
  onCancel,
}: {
  folder: FolderInfo;
  onConfirm: (mode: "move-up" | "recursive") => void;
  onCancel: () => void;
}) {
  const hasChildren = folder.children.length > 0;
  const isManaged = folder.isLocalFile === true;

  // Managed-locally warning banner (Phase 1.6).
  const managedWarning = isManaged ? (
    <div className="mb-3 p-2 rounded border border-destructive/40 bg-destructive/10 text-xs text-destructive">
      <strong>Managed on a desktop.</strong> This folder is backed by an
      on-disk directory. Deleting it will move the folder and every file
      inside to the OS trash on the managing desktop.
    </div>
  ) : null;

  // Managed-locally: the "move contents to parent" mode has no on-disk
  // analog — files stay inside the about-to-be-trashed directory on
  // disk, but their note rows get reparented to a folder the files
  // don't actually live in. The only coherent behavior is recursive
  // delete, so that's the only option we offer.
  if (isManaged) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-card border border-border rounded-lg shadow-lg p-5 max-w-sm w-full mx-4">
          <h3 className="text-base font-medium text-foreground mb-1">
            Delete Folder
          </h3>
          {managedWarning}
          <p className="text-sm text-muted-foreground mb-4">
            Delete &quot;{folder.name}&quot; and everything inside it?
            {hasChildren
              ? " All subfolders, notes, and their on-disk files will be trashed."
              : " Any notes inside and their on-disk files will be trashed."}
          </p>
          <div className="flex justify-center gap-2">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm("recursive")}
              className="px-3 py-1.5 rounded-md bg-destructive text-foreground text-sm hover:bg-destructive-hover transition-colors cursor-pointer"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!hasChildren) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-card border border-border rounded-lg shadow-lg p-5 max-w-sm w-full mx-4">
          <h3 className="text-base font-medium text-foreground mb-1">
            Delete Folder
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Delete &quot;{folder.name}&quot;? Any notes inside will be moved to the
            parent folder.
          </p>
          <div className="flex justify-center gap-2">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm("move-up")}
              className="px-3 py-1.5 rounded-md bg-destructive text-foreground text-sm hover:bg-destructive-hover transition-colors cursor-pointer"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-lg shadow-lg p-5 max-w-sm w-full mx-4">
        <h3 className="text-base font-medium text-foreground mb-1">
          Delete Folder
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          &quot;{folder.name}&quot; has subfolders. What would you like to do?
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => onConfirm("move-up")}
            className="px-3 py-2 rounded-md border border-border text-sm text-foreground hover:bg-accent transition-colors text-left cursor-pointer"
          >
            Move contents to parent folder
            <span className="block text-xs opacity-70">
              This folder is deleted; subfolders and notes move up
            </span>
          </button>
          <button
            onClick={() => onConfirm("recursive")}
            className="px-3 py-2 rounded-md border border-destructive text-sm text-destructive hover:bg-destructive/10 transition-colors text-left cursor-pointer"
          >
            Delete folder and everything in it
            <span className="block text-xs opacity-70">
              All subfolders and notes are permanently deleted
            </span>
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function findFolder(
  folders: FolderInfo[],
  id: string,
): FolderInfo | undefined {
  for (const f of folders) {
    if (f.id === id) return f;
    const found = findFolder(f.children, id);
    if (found) return found;
  }
  return undefined;
}

/** Build a flat list with indentation for dropdown display */
export function flattenFolderTree(
  folders: FolderInfo[],
  depth = 0,
): { id: string; name: string; depth: number; displayName: string }[] {
  const result: {
    id: string;
    name: string;
    depth: number;
    displayName: string;
  }[] = [];
  for (const f of folders) {
    result.push({
      id: f.id,
      name: f.name,
      depth,
      displayName: "\u00B7\u00B7".repeat(depth) + (depth > 0 ? " " : "") + f.name,
    });
    result.push(...flattenFolderTree(f.children, depth + 1));
  }
  return result;
}

/** Find the folder path as an array of {id, name} from root to the given folder */
export function getFolderBreadcrumb(
  folders: FolderInfo[],
  folderId: string,
): { id: string; name: string }[] {
  function search(
    items: FolderInfo[],
    path: { id: string; name: string }[],
  ): { id: string; name: string }[] | null {
    for (const f of items) {
      const currentPath = [...path, { id: f.id, name: f.name }];
      if (f.id === folderId) return currentPath;
      const found = search(f.children, currentPath);
      if (found) return found;
    }
    return null;
  }
  return search(folders, []) ?? [];
}
