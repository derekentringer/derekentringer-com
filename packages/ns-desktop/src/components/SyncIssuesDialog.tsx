import { useState } from "react";
import type { SyncRejection } from "@derekentringer/ns-shared";

interface SyncIssuesDialogProps {
  rejections: SyncRejection[];
  entityNames: Map<string, string>;
  onForcePush: (ids: string[]) => Promise<void>;
  onDiscard: (ids: string[]) => Promise<void>;
  onClose: () => void;
}

/** Human-readable descriptions for rejection reasons */
function describeReason(rejection: SyncRejection): string {
  const type = rejection.changeType === "folder" ? "folder" : rejection.changeType === "image" ? "image" : "note";
  const action = rejection.changeAction;

  switch (rejection.reason) {
    case "timestamp_conflict":
      return `This ${type} was modified on another device more recently. Your local ${action} conflicts with the newer version on the server.`;
    case "unique_constraint":
      return `A ${type} with this name already exists in the same location. Rename it to resolve the conflict.`;
    case "fk_constraint":
      return `This ${type} references a folder or item that no longer exists on the server.`;
    case "not_found":
      return `This ${type} no longer exists on the server. It may have been deleted from another device.`;
    default:
      return rejection.message || `An unexpected error occurred while syncing this ${type}.`;
  }
}

/** Icon for entity type */
function TypeIcon({ type }: { type: string }) {
  if (type === "folder") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

export function SyncIssuesDialog({
  rejections,
  entityNames,
  onForcePush,
  onDiscard,
  onClose,
}: SyncIssuesDialogProps) {
  const [loading, setLoading] = useState<Set<string>>(new Set());

  async function handleAction(ids: string[], action: (ids: string[]) => Promise<void>) {
    setLoading((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
    try {
      await action(ids);
    } finally {
      setLoading((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    }
  }

  const allIds = rejections.map((r) => r.changeId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-lg shadow-lg p-5 max-w-lg w-full mx-4">
        <div className="flex items-center gap-2 mb-1">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-destructive shrink-0">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <h3 className="text-base font-medium text-foreground">Sync Conflicts</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          {rejections.length} item{rejections.length !== 1 ? "s" : ""} couldn't sync. Review each conflict and choose how to resolve it.
        </p>

        <div className="max-h-72 overflow-y-auto space-y-3 mb-4">
          {rejections.map((rejection) => {
            const name = entityNames.get(rejection.changeId) ?? "Untitled";
            const isLoading = loading.has(rejection.changeId);
            const description = describeReason(rejection);

            return (
              <div
                key={rejection.changeId}
                className="p-3 rounded-lg border border-border bg-background"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <TypeIcon type={rejection.changeType} />
                  <span className="text-sm font-medium text-foreground truncate">{name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive shrink-0">
                    {rejection.changeAction}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{description}</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleAction([rejection.changeId], onForcePush)}
                    disabled={isLoading}
                    className="px-2.5 py-1 rounded text-xs bg-foreground/10 text-foreground hover:bg-foreground/20 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isLoading ? "Pushing..." : "Use My Version"}
                  </button>
                  <button
                    onClick={() => handleAction([rejection.changeId], onDiscard)}
                    disabled={isLoading}
                    className="px-2.5 py-1 rounded text-xs border border-border text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isLoading ? "Discarding..." : "Use Server Version"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {rejections.length > 1 && (
          <div className="flex justify-center gap-2 mb-3 pt-2 border-t border-border">
            <button
              onClick={() => handleAction(allIds, onForcePush)}
              disabled={loading.size > 0}
              className="px-3 py-1.5 rounded-md bg-foreground/10 text-foreground text-xs hover:bg-foreground/20 transition-colors cursor-pointer disabled:opacity-50"
            >
              Use My Version for All
            </button>
            <button
              onClick={() => handleAction(allIds, onDiscard)}
              disabled={loading.size > 0}
              className="px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
            >
              Use Server Version for All
            </button>
          </div>
        )}

        <div className="flex justify-center pt-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
