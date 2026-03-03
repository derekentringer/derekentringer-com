export type ViewMode = "editor" | "split" | "preview";

interface EditorToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onBold: () => void;
  onItalic: () => void;
  showLineNumbers: boolean;
  onToggleLineNumbers: () => void;
}

const modes: { value: ViewMode; label: string }[] = [
  { value: "editor", label: "Editor" },
  { value: "split", label: "Split" },
  { value: "preview", label: "Preview" },
];

export function EditorToolbar({
  viewMode,
  onViewModeChange,
  onBold,
  onItalic,
  showLineNumbers,
  onToggleLineNumbers,
}: EditorToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border shrink-0">
      {/* View mode toggle */}
      <div className="flex rounded-md border border-border overflow-hidden">
        {modes.map((mode) => (
          <button
            key={mode.value}
            onClick={() => onViewModeChange(mode.value)}
            className={`px-2.5 py-0.5 text-xs transition-colors ${
              viewMode === mode.value
                ? "bg-primary text-black font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {/* Formatting buttons — only when editor is visible */}
      {viewMode !== "preview" && (
        <>
          <div className="w-px h-4 bg-border mx-1" />
          <button
            onClick={onBold}
            className="px-2 py-0.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
            title="Bold (Ctrl+B)"
          >
            B
          </button>
          <button
            onClick={onItalic}
            className="px-2 py-0.5 text-xs italic text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
            title="Italic (Ctrl+I)"
          >
            I
          </button>

          <div className="w-px h-4 bg-border mx-1" />
          <button
            onClick={onToggleLineNumbers}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
              showLineNumbers
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            } hover:bg-accent`}
            title="Toggle line numbers"
          >
            #
          </button>
        </>
      )}
    </div>
  );
}
