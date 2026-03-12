interface LocalFileDeleteDialogProps {
  noteTitle: string;
  onDeleteFromNoteSync: () => void;
  onDeleteCompletely: () => void;
  onCancel: () => void;
}

export function LocalFileDeleteDialog({
  noteTitle,
  onDeleteFromNoteSync,
  onDeleteCompletely,
  onCancel,
}: LocalFileDeleteDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-lg shadow-lg p-5 max-w-sm w-full mx-4">
        <h3 className="text-base font-medium text-foreground mb-1">
          Delete Local File Note
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          &ldquo;{noteTitle}&rdquo;
        </p>

        <div className="flex flex-col gap-2">
          <button
            onClick={onDeleteFromNoteSync}
            className="px-3 py-2 rounded-md border border-border text-sm text-foreground hover:bg-accent transition-colors text-left cursor-pointer"
          >
            Delete from NoteSync
            <span className="block text-xs text-muted-foreground">
              Remove from NoteSync but keep the local file on disk.
            </span>
          </button>
          <button
            onClick={onDeleteCompletely}
            className="px-3 py-2 rounded-md border border-destructive text-sm text-destructive hover:bg-destructive/10 transition-colors text-left cursor-pointer"
          >
            Delete Completely
            <span className="block text-xs opacity-70">
              Remove from NoteSync and delete the local file from disk.
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
