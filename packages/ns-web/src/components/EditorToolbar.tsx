export type ViewMode = "editor" | "live" | "split" | "preview";

interface EditorToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onBold: () => void;
  onItalic: () => void;
  onStrikethrough: () => void;
  onInlineCode: () => void;
  onHeading: () => void;
  onLink: () => void;
  onImage: () => void;
  onWikiLink: () => void;
  onBulletList: () => void;
  onNumberedList: () => void;
  onCheckbox: () => void;
  onBlockquote: () => void;
  showLineNumbers: boolean;
  onToggleLineNumbers: () => void;
}

const modes: { value: ViewMode; label: string }[] = [
  { value: "editor", label: "Editor" },
  { value: "live", label: "Live" },
  { value: "split", label: "Split" },
  { value: "preview", label: "Preview" },
];

export function EditorToolbar({
  viewMode,
  onViewModeChange,
  onBold,
  onItalic,
  onStrikethrough,
  onInlineCode,
  onHeading,
  onLink,
  onImage,
  onWikiLink,
  onBulletList,
  onNumberedList,
  onCheckbox,
  onBlockquote,
  showLineNumbers,
  onToggleLineNumbers,
}: EditorToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border shrink-0">
      {/* Line numbers toggle — positioned over the gutter */}
      {viewMode !== "preview" && (
        <button
          onClick={onToggleLineNumbers}
          className={`px-2 py-0.5 text-xs rounded transition-colors cursor-pointer ${
            showLineNumbers
              ? "bg-primary/20 text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
          title="Toggle line numbers"
        >
          #
        </button>
      )}

      {/* View mode toggle */}
      <div className="flex rounded-md border border-border overflow-hidden">
        {modes.map((mode) => (
          <button
            key={mode.value}
            onClick={() => onViewModeChange(mode.value)}
            className={`px-2.5 py-0.5 text-xs transition-colors cursor-pointer ${
              viewMode === mode.value
                ? "bg-primary/20 text-primary font-medium"
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
            className="px-2 py-0.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors cursor-pointer"
            title="Bold (Ctrl+B)"
          >
            B
          </button>
          <button
            onClick={onItalic}
            className="px-2 py-0.5 text-xs italic text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors cursor-pointer"
            title="Italic (Ctrl+I)"
          >
            I
          </button>
          <button
            onClick={onStrikethrough}
            className="px-2 py-0.5 text-xs line-through text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors cursor-pointer"
            title="Strikethrough"
          >
            S
          </button>
          <button
            onClick={onInlineCode}
            className="px-2 py-0.5 text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors cursor-pointer"
            title="Inline code"
          >
            {"<>"}
          </button>
          <button
            onClick={onHeading}
            className="px-2 py-0.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors cursor-pointer"
            title="Cycle heading level"
          >
            H
          </button>

          <div className="w-px h-4 bg-border mx-1" />
          <button
            onClick={onLink}
            className="px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors cursor-pointer"
            title="Insert link"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </button>
          <button
            onClick={onImage}
            className="px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors cursor-pointer"
            title="Insert image"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </button>
          <button
            onClick={onWikiLink}
            className="px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors cursor-pointer"
            title="Insert wiki-link"
          >
            [[
          </button>

          <div className="w-px h-4 bg-border mx-1" />
          <button
            onClick={onBulletList}
            className="px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors cursor-pointer"
            title="Bullet list"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </button>
          <button
            onClick={onNumberedList}
            className="px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors cursor-pointer"
            title="Numbered list"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" />
              <path d="M4 6h1v4" /><path d="M4 10h2" /><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
            </svg>
          </button>
          <button
            onClick={onCheckbox}
            className="px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors cursor-pointer"
            title="Checkbox"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" /><path d="m9 12 2 2 4-4" />
            </svg>
          </button>
          <button
            onClick={onBlockquote}
            className="px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors cursor-pointer"
            title="Blockquote"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
              <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
