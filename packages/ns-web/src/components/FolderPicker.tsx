import { useState, useEffect, useRef } from "react";

export interface FolderOption {
  id: string;
  displayName: string;
  depth?: number;
}

interface FolderPickerProps {
  /** Currently selected folder ID (empty string or null = unfiled/all) */
  selectedId: string | null;
  /** Flat list of available folders */
  folders: FolderOption[];
  /** Called when user picks a folder. null = unfiled/all notes */
  onChange: (folderId: string | null) => void;
  /** Label for the "no folder" option */
  emptyLabel?: string;
  /** Icon size in pixels */
  iconSize?: number;
  /** Text size class */
  textSize?: string;
  /** Whether to show the folder name next to the icon */
  showLabel?: boolean;
  /** Dropdown opens upward instead of downward */
  dropUp?: boolean;
  /** Additional class on the trigger button */
  className?: string;
  /** aria-label */
  ariaLabel?: string;
  /** data-testid */
  testId?: string;
}

export function FolderPicker({
  selectedId,
  folders,
  onChange,
  emptyLabel = "Unfiled",
  iconSize = 14,
  textSize = "text-xs",
  showLabel = false,
  dropUp = false,
  className = "",
  ariaLabel = "Select folder",
  testId,
}: FolderPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const selectedFolder = selectedId ? folders.find((f) => f.id === selectedId) : null;
  const displayName = selectedFolder?.displayName.replace(/^[·\s]+/, "") ?? emptyLabel;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer ${className}`}
        title={displayName}
        aria-label={ariaLabel}
        data-testid={testId}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
        >
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        {showLabel && (
          <span className={`${textSize} truncate max-w-[120px]`}>{displayName}</span>
        )}
      </button>
      {open && (
        <div
          className={`absolute left-0 bg-card border border-border rounded-md shadow-lg py-1 z-50 min-w-[140px] max-w-[280px] w-max max-h-[200px] overflow-y-auto ${
            dropUp ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          <button
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className={`w-full text-left px-3 py-1.5 ${textSize} transition-colors cursor-pointer ${
              !selectedId
                ? "text-foreground bg-accent"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            {emptyLabel}
          </button>
          {folders.map((f) => {
            const depth = f.depth ?? 0;
            return (
              <button
                key={f.id}
                onClick={() => {
                  onChange(f.id);
                  setOpen(false);
                }}
                className={`w-full text-left py-1.5 pr-3 ${textSize} whitespace-nowrap truncate transition-colors cursor-pointer ${
                  selectedId === f.id
                    ? "text-foreground bg-accent"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
                style={{ paddingLeft: `${12 + depth * 12}px` }}
                title={f.displayName.replace(/^[·\s]+/, "")}
              >
                {f.displayName.replace(/^[·\s]+/, "")}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
