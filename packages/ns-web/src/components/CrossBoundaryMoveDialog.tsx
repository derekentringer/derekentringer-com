import { useEffect } from "react";

/**
 * Phase A.3 — confirmation dialog for a folder move that crosses the
 * managed/unmanaged boundary. Copy changes per direction:
 *
 * - `toManaged`: the moved subtree + its notes will be written to disk
 *   on the managing desktop's next sync.
 * - `toUnmanaged`: the moved subtree's on-disk files will be trashed
 *   on the managing desktop's next sync.
 *
 * Server returns a 409 with the direction + affected counts; the UI
 * surfaces them verbatim so the user can see the scope before
 * confirming.
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
      ? `Moving "${folderName}" into a managed notebook converts this subtree (${scope}) to be disk-backed. The managing desktop will write the files to disk on its next sync.`
      : `Moving "${folderName}" out of a managed notebook converts this subtree (${scope}) to cloud-only. The managing desktop will move the on-disk files to the OS trash on its next sync.`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-lg shadow-lg p-5 max-w-sm w-full mx-4">
        <h3 className="text-base font-medium text-foreground mb-1">{title}</h3>
        <div className="mb-3 p-2 rounded border border-destructive/40 bg-destructive/10 text-xs text-destructive">
          {direction === "toManaged" ? (
            <>
              <strong>Managed notebook.</strong> Files will be written to the
              managing desktop on its next sync.
            </>
          ) : (
            <>
              <strong>Unmanaged notebook.</strong> On-disk files will be moved
              to the OS trash on the managing desktop&apos;s next sync.
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
