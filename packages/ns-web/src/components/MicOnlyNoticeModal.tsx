import { useEffect, useState } from "react";

interface MicOnlyNoticeModalProps {
  onConfirm: (dontShowAgain: boolean) => void;
}

export function MicOnlyNoticeModal({ onConfirm }: MicOnlyNoticeModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Enter") { e.preventDefault(); onConfirm(dontShowAgain); }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onConfirm, dontShowAgain]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-lg shadow-lg p-5 max-w-md w-full mx-4">
        <h3 className="text-base font-medium text-foreground mb-2">
          Web recordings use your microphone only
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Web records your microphone only. Audio from other tabs playing
          through your speakers <strong className="text-foreground">will not</strong> be
          captured. Use the desktop app for full system audio recording.
        </p>
        <label className="flex items-center gap-2 mb-4 text-sm text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            className="cursor-pointer"
          />
          Don't show this again
        </label>
        <div className="flex justify-end">
          <button
            onClick={() => onConfirm(dontShowAgain)}
            className="px-3 py-1.5 rounded-md bg-primary text-primary-contrast text-sm font-medium hover:bg-primary-hover transition-colors cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
