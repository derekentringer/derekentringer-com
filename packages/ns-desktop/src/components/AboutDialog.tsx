declare const __APP_VERSION__: string | undefined;

import { useEffect } from "react";
import { NsLogo } from "./NsLogo";

interface AboutDialogProps {
  onClose: () => void;
  onWhatsNew?: () => void;
  onFeedback?: () => void;
}

export function AboutDialog({ onClose, onWhatsNew, onFeedback }: AboutDialogProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-lg shadow-lg p-6 max-w-xs w-full mx-4 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center mb-3">
          <NsLogo className="w-16 h-16" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">NoteSync</h3>
        <p className="text-sm text-muted-foreground mt-1">Version {typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0"}</p>
        <p className="text-xs text-muted-foreground mt-3">&copy; {new Date().getFullYear()} PixelPerfect Studios LLC</p>
        <div className="flex justify-center gap-3 mt-4">
          {onWhatsNew && (
            <button
              onClick={onWhatsNew}
              className="px-3 py-1 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors cursor-pointer"
            >
              What's New
            </button>
          )}
          {onFeedback && (
            <button
              onClick={onFeedback}
              className="px-3 py-1 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors cursor-pointer"
            >
              Feedback
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          className="mt-3 px-4 py-1.5 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          Close
        </button>
      </div>
    </div>
  );
}
