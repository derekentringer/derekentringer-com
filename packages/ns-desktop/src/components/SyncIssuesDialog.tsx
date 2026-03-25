import { useState } from "react";
import type { SyncRejection } from "@derekentringer/ns-shared";

interface SyncIssuesDialogProps {
  rejections: SyncRejection[];
  entityNames: Map<string, string>;
  onForcePush: (ids: string[]) => Promise<void>;
  onDiscard: (ids: string[]) => Promise<void>;
  onClose: () => void;
}

export function SyncIssuesDialog({
  rejections,
  entityNames,
  onForcePush,
  onDiscard,
  onClose,
}: SyncIssuesDialogProps) {
  const [loading, setLoading] = useState<Set<string>>(new Set());

  async function handleForcePush(ids: string[]) {
    setLoading((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
    try {
      await onForcePush(ids);
    } finally {
      setLoading((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    }
  }

  async function handleDiscard(ids: string[]) {
    setLoading((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
    try {
      await onDiscard(ids);
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
        <h3 className="text-base font-medium text-foreground mb-1">Sync Issues</h3>
        <p className="text-sm text-muted-foreground mb-4">
          {rejections.length} change{rejections.length !== 1 ? "s" : ""} could not be synced
        </p>

        <div className="max-h-64 overflow-y-auto space-y-2 mb-4">
          {rejections.map((rejection) => {
            const name = entityNames.get(rejection.changeId) ?? rejection.changeId;
            const isLoading = loading.has(rejection.changeId);

            return (
              <div
                key={rejection.changeId}
                className="flex items-center justify-between gap-2 p-2 rounded border border-border bg-background"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">{name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-muted-foreground uppercase shrink-0">
                      {rejection.changeType}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{rejection.message}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleForcePush([rejection.changeId])}
                    disabled={isLoading}
                    className="px-2 py-1 rounded text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Force Push
                  </button>
                  <button
                    onClick={() => handleDiscard([rejection.changeId])}
                    disabled={isLoading}
                    className="px-2 py-1 rounded text-xs border border-border text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Discard
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {rejections.length > 1 && (
          <div className="flex justify-center gap-2 mb-3">
            <button
              onClick={() => handleForcePush(allIds)}
              disabled={loading.size > 0}
              className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50"
            >
              Force Push All
            </button>
            <button
              onClick={() => handleDiscard(allIds)}
              disabled={loading.size > 0}
              className="px-3 py-1.5 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
            >
              Discard All
            </button>
          </div>
        )}

        <div className="flex justify-center">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
