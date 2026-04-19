import { useEffect } from "react";

/**
 * Phase A.5 — confirmation dialog for a folder move that crosses the
 * managed/unmanaged boundary on desktop. Mirror of the web
 * CrossBoundaryMoveDialog (same copy, same behavior) so cross-client
 * UX stays consistent. Desktop detects the boundary locally via
 * `detectCrossBoundaryLocalMove` rather than relying on a server 409,
 * so this dialog can render without a round-trip.
 */
interface CrossBoundaryMoveDialogProps {
  direction: "toManaged" | "toUnmanaged";
  folderName: string;
  affectedFolderCount: number;
  affectedNoteCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function CrossBoundaryMoveDialog({
  direction,
  folderName,
  affectedFolderCount,
  affectedNoteCount,
  onConfirm,
  onCancel,
}: CrossBoundaryMoveDialogProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onCancel(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const title =
    direction === "toManaged"
      ? "Move into managed notebook?"
      : "Move out of managed notebook?";

  const scope = `${affectedFolderCount} folder${affectedFolderCount === 1 ? "" : "s"} and ${affectedNoteCount} note${affectedNoteCount === 1 ? "" : "s"}`;

  const body =
    direction === "toManaged"
      ? `Moving "${folderName}" into a managed notebook converts this subtree (${scope}) to be disk-backed. Files will be written to disk on the next sync.`
      : `Moving "${folderName}" out of a managed notebook converts this subtree (${scope}) to cloud-only. On-disk files will be moved to the OS trash on the next sync.`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-lg shadow-lg p-5 max-w-sm w-full mx-4">
        <h3 className="text-base font-medium text-foreground mb-1">{title}</h3>
        <div className="mb-3 p-2 rounded border border-destructive/40 bg-destructive/10 text-xs text-destructive">
          {direction === "toManaged" ? (
            <>
              <strong>Managed notebook.</strong> Files will be written to disk
              on the next sync.
            </>
          ) : (
            <>
              <strong>Unmanaged notebook.</strong> On-disk files will be moved
              to the OS trash on the next sync.
            </>
          )}
        </div>
        <p className="text-sm text-muted-foreground mb-4">{body}</p>
        <div className="flex justify-center gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-md bg-destructive text-foreground text-sm hover:bg-destructive-hover transition-colors cursor-pointer"
          >
            Move
          </button>
        </div>
      </div>
    </div>
  );
}
