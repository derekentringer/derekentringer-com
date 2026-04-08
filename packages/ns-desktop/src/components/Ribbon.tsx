import type { SyncStatus } from "../lib/syncEngine.ts";
import { SyncStatusButton } from "./SyncStatusButton.tsx";
import { ImportButton } from "./ImportButton.tsx";
import type { AudioMode } from "../hooks/useAiSettings.ts";
import type { RecorderState } from "./AudioRecorder.tsx";

interface RibbonProps {
  // Top actions
  onNewNote: () => void;
  showAudio?: boolean;
  onRecord?: (mode: AudioMode) => void;
  recorderState?: RecorderState;
  // Sync
  syncStatus: SyncStatus;
  syncError: string | null;
  onSync: () => void;
  pendingCount?: number;
  hasRejections?: boolean;
  onViewIssues?: () => void;
  // Game
  onGame?: () => void;
  // Trash
  onTrash: () => void;
  trashCount: number;
  showTrash: boolean;
  // Import
  onImportFiles: (files: FileList) => void;
  onImportDirectory: (files: FileList) => void;
  showImport: boolean;
  // Settings
  onSettings: () => void;
  // Admin
  onAdmin?: () => void;
  showAdmin: boolean;
  // Sign out
  onSignOut: () => void;
}

export function Ribbon({
  onNewNote,
  showAudio,
  onRecord,
  recorderState = "idle",
  syncStatus,
  syncError,
  onSync,
  pendingCount,
  hasRejections,
  onViewIssues,
  onGame,
  onTrash,
  trashCount,
  showTrash,
  onImportFiles,
  onImportDirectory,
  showImport,
  onSettings,
  onAdmin,
  showAdmin,
  onSignOut,
}: RibbonProps) {
  return (
    <nav className="w-10 bg-sidebar border-r border-border flex flex-col items-center py-2 shrink-0" aria-label="Ribbon actions">
      {/* Top actions */}
      <div className="flex flex-col items-center gap-1">
        <button
          onClick={onNewNote}
          className="w-6 h-6 flex items-center justify-center rounded bg-primary text-primary-contrast hover:bg-primary-hover transition-colors text-sm leading-none cursor-pointer"
          title="New note"
          aria-label="New note"
        >
          +
        </button>
        {showAudio && onRecord && recorderState === "idle" && (
          <>
            <button
              onClick={() => onRecord("meeting")}
              className="flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
              title="Record & Transcribe Meeting (System)"
              aria-label="Record & Transcribe Meeting (System)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </button>
            <button
              onClick={() => onRecord("lecture")}
              className="flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
              title="Record & Transcribe Lecture (System)"
              aria-label="Record & Transcribe Lecture (System)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                <path d="M6 12v5c3 3 6 3 6 3s3 0 6-3v-5" />
              </svg>
            </button>
            <button
              onClick={() => onRecord("memo")}
              className="flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
              title="Capture & Transcribe Memo"
              aria-label="Capture & Transcribe Memo"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </button>
            <button
              onClick={() => onRecord("verbatim")}
              className="flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
              title="Record & Transcribe Verbatim"
              aria-label="Record & Transcribe Verbatim"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom actions */}
      <div className="flex flex-col items-center gap-1">
        {showTrash && (
          <button
            onClick={onTrash}
            className="relative flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
            title="Trash"
            aria-label={`Trash${trashCount > 0 ? ` (${trashCount})` : ""}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            {trashCount > 0 && (
              <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[1rem] h-4 px-0.5 rounded-full bg-border text-[10px] text-muted-foreground">
                {trashCount}
              </span>
            )}
          </button>
        )}
        {showImport && (
          <ImportButton
            onImportFiles={onImportFiles}
            onImportDirectory={onImportDirectory}
          />
        )}
        {showAdmin && onAdmin && (
          <button
            onClick={onAdmin}
            className="flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
            title="Admin"
            aria-label="Admin"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </button>
        )}
        <button
          onClick={onSettings}
          className="flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
          title="Settings"
          aria-label="Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
        {onGame && (
          <button
            onClick={onGame}
            className="flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
            title="Take a break"
            aria-label="Take a break"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
              <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
              <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
              <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
            </svg>
          </button>
        )}
        <button
          onClick={onSignOut}
          className="flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
          title="Sign out"
          aria-label="Sign out"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        </button>
        <SyncStatusButton
          status={syncStatus}
          error={syncError}
          onSync={onSync}
          hasRejections={hasRejections}
          onViewIssues={onViewIssues}
        />
      </div>
    </nav>
  );
}
