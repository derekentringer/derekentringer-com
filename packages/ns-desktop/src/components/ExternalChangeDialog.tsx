interface ExternalChangeDialogProps {
  noteTitle: string;
  onReload: () => void;
  onKeepMine: () => void;
  onViewDiff: () => void;
  onCancel: () => void;
}

export function ExternalChangeDialog({
  noteTitle,
  onReload,
  onKeepMine,
  onViewDiff,
  onCancel,
}: ExternalChangeDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-lg shadow-lg p-5 max-w-sm w-full mx-4">
        <h3 className="text-base font-medium text-foreground mb-1">
          File Changed Externally
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          The local file for &ldquo;{noteTitle}&rdquo; has been modified outside
          NoteSync.
        </p>

        <div className="flex flex-col gap-2">
          <button
            onClick={onReload}
            className="px-3 py-1.5 rounded-md bg-primary text-primary-contrast text-sm font-medium hover:bg-primary-hover transition-colors cursor-pointer"
          >
            Reload from File
          </button>
          <button
            onClick={onKeepMine}
            className="px-3 py-1.5 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Keep My Version
          </button>
          <button
            onClick={onViewDiff}
            className="px-3 py-1.5 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            View Diff
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
