import type { SyncStatus } from "../lib/syncEngine.ts";

interface SyncStatusButtonProps {
  status: SyncStatus;
  error: string | null;
  onSync: () => void;
  hasRejections?: boolean;
  onViewIssues?: () => void;
}

export function SyncStatusButton({ status, error, onSync, hasRejections, onViewIssues }: SyncStatusButtonProps) {
  const isDisabled = status === "offline";

  const title =
    status === "idle"
      ? "Synced"
      : status === "syncing"
        ? "Syncing..."
        : status === "offline"
          ? "Offline"
          : hasRejections
            ? "Sync issues — click to view"
            : error ?? "Sync error";

  function handleClick() {
    if (status === "error" && hasRejections && onViewIssues) {
      onViewIssues();
    } else {
      onSync();
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={isDisabled}
      className={`flex items-center justify-center w-7 h-7 rounded transition-colors cursor-pointer ${
        status === "error"
          ? "text-destructive hover:bg-accent"
          : status === "offline"
            ? "text-muted-foreground opacity-50 cursor-not-allowed"
            : status === "idle"
              ? "text-green-600/50 hover:text-green-500 hover:bg-accent"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
      }`}
      title={title}
      aria-label={title}
    >
      {status === "idle" && (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10" />
          <path d="m8 12 3 3 6-6" />
        </svg>
      )}
      {status === "syncing" && (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
      )}
      {status === "offline" && (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 2l20 20" />
          <path d="M8.5 16.5a5 5 0 0 1 7 0" />
          <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
          <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
          <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
          <path d="M5 13a10 10 0 0 1 5.24-2.76" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
      )}
      {status === "error" && (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      )}
    </button>
  );
}
