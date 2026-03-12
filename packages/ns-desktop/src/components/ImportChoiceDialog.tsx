interface ImportChoiceDialogProps {
  fileNames: string[];
  onImportToNoteSync: () => void;
  onKeepLocal: () => void;
  onCancel: () => void;
}

export function ImportChoiceDialog({
  fileNames,
  onImportToNoteSync,
  onKeepLocal,
  onCancel,
}: ImportChoiceDialogProps) {
  const displayNames = fileNames.slice(0, 5);
  const remaining = fileNames.length - displayNames.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-lg shadow-lg p-5 max-w-sm w-full mx-4">
        <h3 className="text-base font-medium text-foreground mb-1">
          Import Files
        </h3>
        <p className="text-sm text-muted-foreground mb-3">
          How would you like to import {fileNames.length} file(s)?
        </p>

        <ul className="mb-4 space-y-0.5">
          {displayNames.map((name) => (
            <li
              key={name}
              className="text-xs text-muted-foreground truncate pl-2 border-l-2 border-border"
            >
              {name}
            </li>
          ))}
          {remaining > 0 && (
            <li className="text-xs text-muted-foreground pl-2">
              and {remaining} more&hellip;
            </li>
          )}
        </ul>

        <div className="flex flex-col gap-2">
          <button
            onClick={onImportToNoteSync}
            className="px-3 py-2 rounded-md border border-border text-sm text-foreground hover:bg-accent transition-colors text-left cursor-pointer"
          >
            Import to NoteSync
            <span className="block text-xs text-muted-foreground">
              Copy file contents into NoteSync. The original file will not be edited or tracked.
            </span>
          </button>
          <button
            onClick={onKeepLocal}
            className="px-3 py-2 rounded-md border border-border text-sm text-foreground hover:bg-accent transition-colors text-left cursor-pointer"
          >
            Keep Local
            <span className="block text-xs text-muted-foreground">
              Open the file in NoteSync. The original file will be editable and tracked in NoteSync.
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
