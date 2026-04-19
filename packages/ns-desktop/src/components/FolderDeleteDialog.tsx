import type { FolderInfo } from "@derekentringer/ns-shared";
import { ConfirmDialog } from "./ConfirmDialog.tsx";

interface FolderDeleteDialogProps {
  folder: FolderInfo;
  onConfirm: (mode: "move-up" | "recursive") => void;
  onCancel: () => void;
}

export function FolderDeleteDialog({
  folder,
  onConfirm,
  onCancel,
}: FolderDeleteDialogProps) {
  const hasChildren = folder.children.length > 0;
  const isManaged = folder.isLocalFile === true;

  // Managed-locally: the folder is backed by an on-disk directory.
  // Reparenting notes to the parent ("move-up") has no on-disk analog —
  // the directory + every file inside goes to the OS trash and any
  // notes pointing at those files would be dangling. Only recursive
  // delete is coherent here.
  if (isManaged) {
    const detail = hasChildren
      ? "All subfolders, notes, and their on-disk files will be trashed."
      : "Any notes inside and their on-disk files will be trashed.";
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-card border border-border rounded-lg shadow-lg p-5 max-w-sm w-full mx-4">
          <h3 className="text-base font-medium text-foreground mb-1">
            Delete Folder
          </h3>
          <div className="mb-3 p-2 rounded border border-destructive/40 bg-destructive/10 text-xs text-destructive">
            <strong>Managed locally.</strong> This folder is backed by an
            on-disk directory. Deleting it will move the folder and every
            file inside to the OS trash.
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Delete &ldquo;{folder.name}&rdquo; and everything inside it? {detail}
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
          &ldquo;{folder.name}&rdquo; has subfolders. What would you like to do?
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
