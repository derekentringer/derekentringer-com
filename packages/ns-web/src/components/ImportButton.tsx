import { useState, useRef, useEffect } from "react";

interface ImportButtonProps {
  onImportFiles: (files: FileList) => void;
  onImportDirectory: (files: FileList) => void;
}

export function ImportButton({ onImportFiles, onImportDirectory }: ImportButtonProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
        title="Import"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 z-50 py-1 bg-card border border-border rounded-md shadow-lg min-w-[140px]">
          <button
            onClick={() => {
              setOpen(false);
              fileInputRef.current?.click();
            }}
            className="w-full text-left px-3 py-1 text-xs text-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            Import Files
          </button>
          <button
            onClick={() => {
              setOpen(false);
              dirInputRef.current?.click();
            }}
            className="w-full text-left px-3 py-1 text-xs text-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            Import Folder
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".md,.txt,.markdown"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onImportFiles(e.target.files);
          }
          e.target.value = "";
        }}
      />
      <input
        ref={dirInputRef}
        type="file"
        // @ts-expect-error webkitdirectory is non-standard
        webkitdirectory=""
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onImportDirectory(e.target.files);
          }
          e.target.value = "";
        }}
      />
    </div>
  );
}
