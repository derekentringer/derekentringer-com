// Phase C (docs/ns/ai-assist-arch/phase-c-action-safety.md): inline
// confirmation UI for destructive tool calls Claude wants to make.
// The card shows a preview (title, affected count, or a content diff
// for rewrites), plus Apply / Discard buttons. Apply re-invokes the
// same tool via POST /ai/tools/confirm (server-side: autoApprove=true).

import type { ConfirmationPreview, PendingConfirmation } from "../api/ai.ts";

export interface ConfirmationCardProps {
  pending: PendingConfirmation;
  status: "pending" | "applying" | "applied" | "discarded" | "failed";
  resultText?: string;
  errorMessage?: string;
  onApply: () => void;
  onDiscard: () => void;
}

function DestructiveIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500 shrink-0 mt-0.5">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function HeadlineForPreview(preview: ConfirmationPreview): string {
  switch (preview.type) {
    case "delete_note":
      return "Move note to trash?";
    case "delete_folder":
      return "Delete folder?";
    case "update_note_content":
      return "Rewrite note content?";
    case "rename_folder":
      return "Rename folder?";
    case "rename_tag":
      return "Rename tag?";
  }
}

/** Tiny body-text diff for `update_note_content`. We don't need a
 *  full side-by-side — a summary line + old/new previews is enough
 *  context for the user to decide. */
function UpdateDiffPreview({ preview }: { preview: Extract<ConfirmationPreview, { type: "update_note_content" }> }) {
  const delta = preview.newLen - preview.oldLen;
  const pctChange = preview.oldLen > 0
    ? Math.round(((preview.newLen - preview.oldLen) / preview.oldLen) * 100)
    : 100;
  const sign = delta >= 0 ? "+" : "";
  const oldSnippet = preview.oldContent.slice(0, 200);
  const newSnippet = preview.newContent.slice(0, 200);

  return (
    <div className="mt-1.5 space-y-1.5">
      <div className="text-[11px] text-muted-foreground">
        <span className="font-mono">{preview.oldLen}</span> → <span className="font-mono">{preview.newLen}</span> chars (<span className={delta === 0 ? "" : delta > 0 ? "text-emerald-600" : "text-destructive"}>{sign}{delta}, {pctChange >= 0 ? "+" : ""}{pctChange}%</span>)
      </div>
      {preview.oldLen > 0 && (
        <div className="rounded border border-destructive/30 bg-destructive/5 p-1.5">
          <p className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wider">Before</p>
          <p className="text-[11px] font-mono whitespace-pre-wrap break-words text-foreground/80">
            {oldSnippet}{preview.oldContent.length > 200 ? "…" : ""}
          </p>
        </div>
      )}
      <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-1.5">
        <p className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wider">After</p>
        <p className="text-[11px] font-mono whitespace-pre-wrap break-words text-foreground/80">
          {newSnippet}{preview.newContent.length > 200 ? "…" : ""}
        </p>
      </div>
    </div>
  );
}

function PreviewBody({ preview }: { preview: ConfirmationPreview }) {
  switch (preview.type) {
    case "delete_note":
      return (
        <p className="text-xs text-foreground/80">
          <span className="font-medium">&quot;{preview.title}&quot;</span>
          {preview.folder && <span className="text-muted-foreground"> in {preview.folder}</span>}
          {" "}will be moved to Trash. You can restore it from Trash within 30 days.
        </p>
      );
    case "delete_folder":
      return (
        <p className="text-xs text-foreground/80">
          Folder <span className="font-medium">&quot;{preview.folderName}&quot;</span> will be deleted.
          {preview.affectedCount > 0 && (
            <> {preview.affectedCount} note{preview.affectedCount === 1 ? "" : "s"} inside will become unfiled (not deleted).</>
          )}
        </p>
      );
    case "update_note_content":
      return (
        <>
          <p className="text-xs text-foreground/80">
            Content of <span className="font-medium">&quot;{preview.title}&quot;</span> will be replaced. The previous version is saved in version history.
          </p>
          <UpdateDiffPreview preview={preview} />
        </>
      );
    case "rename_folder":
      return (
        <p className="text-xs text-foreground/80">
          Rename <span className="font-medium">&quot;{preview.oldName}&quot;</span> → <span className="font-medium">&quot;{preview.newName}&quot;</span>.
        </p>
      );
    case "rename_tag":
      return (
        <p className="text-xs text-foreground/80">
          Rename tag <span className="font-medium">#{preview.oldName}</span> → <span className="font-medium">#{preview.newName}</span> across {preview.affectedCount} note{preview.affectedCount === 1 ? "" : "s"}.
        </p>
      );
  }
}

export function ConfirmationCard({ pending, status, resultText, errorMessage, onApply, onDiscard }: ConfirmationCardProps) {
  if (status === "applied") {
    return (
      <div className="w-full rounded-lg bg-card border border-emerald-500/30 p-3 animate-fade-in">
        <p className="text-xs text-emerald-600">✓ {resultText ?? "Applied."}</p>
      </div>
    );
  }

  if (status === "discarded") {
    return (
      <div className="w-full rounded-lg bg-card border border-border p-3 animate-fade-in opacity-70">
        <p className="text-xs text-muted-foreground">Discarded — no changes made.</p>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="w-full rounded-lg bg-card border border-destructive/40 p-3 animate-fade-in">
        <p className="text-xs text-destructive font-medium">Couldn&apos;t apply the change</p>
        {errorMessage && <p className="text-[11px] text-muted-foreground mt-0.5">{errorMessage}</p>}
        <div className="flex gap-1.5 mt-1.5">
          <button
            onClick={onApply}
            className="px-2 py-1 rounded-md border border-border hover:border-primary/50 text-[11px] text-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            Retry
          </button>
          <button
            onClick={onDiscard}
            className="px-2 py-1 rounded-md border border-border hover:border-destructive/50 text-[11px] text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
          >
            Discard
          </button>
        </div>
      </div>
    );
  }

  const applying = status === "applying";

  return (
    <div className="w-full rounded-lg bg-card border border-amber-500/40 p-3 animate-fade-in">
      <div className="flex items-start gap-1.5 mb-2">
        <DestructiveIcon />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground">{HeadlineForPreview(pending.preview)}</p>
          <div className="mt-1">
            <PreviewBody preview={pending.preview} />
          </div>
        </div>
      </div>
      <div className="flex gap-1.5 mt-2">
        <button
          onClick={onApply}
          disabled={applying}
          className="px-2.5 py-1 rounded-md bg-primary text-primary-contrast text-[11px] font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {applying ? "Applying…" : "Apply"}
        </button>
        <button
          onClick={onDiscard}
          disabled={applying}
          className="px-2.5 py-1 rounded-md border border-border hover:border-destructive/50 text-[11px] text-muted-foreground hover:text-destructive disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
