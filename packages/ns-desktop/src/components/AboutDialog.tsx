import { useEffect } from "react";
import { NsLogo } from "./NsLogo";

interface AboutDialogProps {
  onClose: () => void;
}

export function AboutDialog({ onClose }: AboutDialogProps) {
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
        <p className="text-sm text-muted-foreground mt-1">Version {__APP_VERSION__}</p>
        <p className="text-xs text-muted-foreground mt-3">A note-taking app with AI assistant, meeting transcription, and cross-device sync.</p>
        <p className="text-xs text-muted-foreground mt-3">&copy; {new Date().getFullYear()} Derek Entringer</p>
        <button
          onClick={onClose}
          className="mt-4 px-4 py-1.5 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          Close
        </button>
      </div>
    </div>
  );
}

declare const __APP_VERSION__: string;
