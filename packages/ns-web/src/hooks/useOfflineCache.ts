import { useState, useEffect, useCallback, useRef } from "react";
import { useOnlineStatus } from "./useOnlineStatus.ts";
import { getQueueCount, dequeue, requeue } from "../lib/offlineQueue.ts";
import { cacheNote, deleteCachedNote, setMeta, getCachedNote } from "../lib/db.ts";
import * as api from "../api/notes.ts";

export function useOfflineCache() {
  const { isOnline, lastSyncedAt } = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [reconciledIds, setReconciledIds] = useState<Map<string, string>>(
    new Map(),
  );
  const wasOffline = useRef(!isOnline);

  // Poll pending count
  useEffect(() => {
    let active = true;

    async function poll() {
      if (!active) return;
      const count = await getQueueCount();
      if (active) setPendingCount(count);
    }

    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const flushQueue = useCallback(async () => {
    setIsSyncing(true);
    const idMap = new Map<string, string>();

    try {
      let entry = await dequeue();
      while (entry) {
        try {
          if (entry.action === "create") {
            const payload = entry.payload as {
              title: string;
              content?: string;
              folder?: string;
              folderId?: string;
              tags?: string[];
            };
            const realNote = await api.createNote(payload);
            await deleteCachedNote(entry.noteId);
            await cacheNote(realNote);
            idMap.set(entry.noteId, realNote.id);
          } else if (entry.action === "update") {
            const noteId = idMap.get(entry.noteId) ?? entry.noteId;
            const payload = entry.payload as {
              title?: string;
              content?: string;
              folder?: string | null;
              folderId?: string | null;
              tags?: string[];
              summary?: string | null;
            };
            const updated = await api.updateNote(noteId, payload);
            await cacheNote(updated);
          } else if (entry.action === "delete") {
            if (!entry.noteId.startsWith("temp-")) {
              const noteId = idMap.get(entry.noteId) ?? entry.noteId;
              await api.deleteNote(noteId);
            }
            await deleteCachedNote(entry.noteId);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "";
          const isTransient = /\b(5\d{2})\b/.test(msg) || !msg.includes(":");
          const retryCount = entry.retryCount ?? 0;

          if (isTransient && retryCount < 3) {
            const { id: _id, ...rest } = entry;
            await requeue({ ...rest, retryCount: retryCount + 1 });
            break; // stop processing — server may be down
          } else {
            console.warn("Offline queue: skipping failed entry", entry.action, entry.noteId, msg);
          }
        }

        const count = await getQueueCount();
        setPendingCount(count);
        entry = await dequeue();
      }

      if (idMap.size > 0) {
        setReconciledIds(new Map(idMap));
      }
      await setMeta("lastSyncedAt", Date.now());
    } finally {
      setIsSyncing(false);
      const finalCount = await getQueueCount();
      setPendingCount(finalCount);
    }
  }, []);

  // Flush on reconnect
  useEffect(() => {
    if (isOnline && wasOffline.current) {
      getQueueCount().then((count) => {
        if (count > 0) {
          flushQueue();
        }
      });
    }
    wasOffline.current = !isOnline;
  }, [isOnline, flushQueue]);

  return { isOnline, lastSyncedAt, pendingCount, isSyncing, reconciledIds };
}
