import { useState, useEffect, useRef, useCallback } from "react";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import type { FolderInfo } from "@derekentringer/shared/ns";
import { ConfirmDialog } from "./ConfirmDialog.tsx";

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
  const isExpanded = expandedMap.get(folder.id) ?? false;
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
              {hasChildren ? (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleExpand(folder.id);
                  }}
                  className="inline-flex items-center justify-center w-4 h-4 mr-0.5 text-[10px] cursor-pointer shrink-0 select-none"
                >
                  {isExpanded ? "\u25BC" : "\u25B6"}
                </span>
              ) : (
                <span className="w-4 mr-0.5 shrink-0" />
              )}
              <span className="truncate">{folder.name}</span>
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
    // Default root folders to expanded if not in storage
    for (const f of folders) {
      if (!stored.has(f.id)) stored.set(f.id, true);
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
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Ensure new root folders default to expanded
  useEffect(() => {
    setExpandedMap((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const f of folders) {
        if (!next.has(f.id)) {
          next.set(f.id, true);
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

  function handleMoveToRoot(folder: FolderInfo) {
    onMoveFolder(folder.id, null);
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
    <div className="px-2 py-1">
      <div className="flex items-center justify-between px-1 mb-1">
        <button
          onClick={() =>
            setIsSectionCollapsed((v) => {
              const next = !v;
              try {
                localStorage.setItem("ns-folders-collapsed", String(next));
              } catch {}
              return next;
            })
          }
          className="flex items-center gap-1.5 text-sm text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors cursor-pointer"
        >
          <span
            className="inline-block transition-transform"
            style={{
              transform: isSectionCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
            }}
          >
            ▾
          </span>
          Folders
        </button>
        {!isSectionCollapsed && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsCreating(true)}
              className="w-5 h-5 flex items-center justify-center rounded bg-subtle text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="New folder"
            >
              +
            </button>
          </div>
        )}
      </div>

      {!isSectionCollapsed && (
        <>
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
          {folders.map((folder) => (
            <FolderTreeNode
              key={folder.id}
              folder={folder}
              depth={0}
              activeFolder={activeFolder}
              expandedMap={expandedMap}
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
        </>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 py-1 bg-card border border-border rounded-md shadow-lg min-w-[140px]"
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
          {contextMenu.folder.parentId && (
            <button
              onClick={() => handleMoveToRoot(contextMenu.folder)}
              className="w-full text-left px-3 py-1 text-xs text-foreground hover:bg-accent transition-colors cursor-pointer"
            >
              Move to Root
            </button>
          )}
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

  if (!hasChildren) {
    return (
      <ConfirmDialog
        title="Delete Folder"
        message={`Delete "${folder.name}"? Notes in this folder will be unfiled.`}
        onConfirm={() => onConfirm("move-up")}
        onCancel={onCancel}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-lg shadow-lg p-5 max-w-sm w-full mx-4">
        <h3 className="text-base font-medium text-foreground mb-1">
          Delete Folder
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          "{folder.name}" has subfolders. What would you like to do?
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => onConfirm("move-up")}
            className="px-3 py-2 rounded-md border border-border text-sm text-foreground hover:bg-accent transition-colors text-left"
          >
            Move contents to parent folder
          </button>
          <button
            onClick={() => onConfirm("recursive")}
            className="px-3 py-2 rounded-md border border-destructive text-sm text-destructive hover:bg-destructive/10 transition-colors text-left"
          >
            Delete folder and all subfolders
            <span className="block text-xs opacity-70">
              Notes will be unfiled
            </span>
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
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
