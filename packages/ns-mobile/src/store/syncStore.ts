import { create } from "zustand";
import type { SyncRejection } from "@derekentringer/ns-shared";
import type { SyncStatus } from "@/lib/syncEngine";

interface SyncState {
  status: SyncStatus;
  error: string | null;
  isOnline: boolean;
  rejections: SyncRejection[];
  rejectionActions: {
    forcePush: ((changeIds: string[]) => Promise<void>) | null;
    discard: ((changeIds: string[]) => Promise<void>) | null;
  };
  lastSyncedAt: string | null;
}

interface SyncActions {
  setStatus: (status: SyncStatus, error: string | null) => void;
  setIsOnline: (isOnline: boolean) => void;
  setRejections: (
    rejections: SyncRejection[],
    forcePush: (changeIds: string[]) => Promise<void>,
    discard: (changeIds: string[]) => Promise<void>,
  ) => void;
  clearRejections: () => void;
  setLastSyncedAt: (timestamp: string) => void;
}

const useSyncStore = create<SyncState & SyncActions>()((set) => ({
  status: "idle",
  error: null,
  isOnline: true,
  rejections: [],
  rejectionActions: { forcePush: null, discard: null },
  lastSyncedAt: null,

  setStatus: (status, error) => {
    set({ status, error });
    if (status === "idle") {
      set({ lastSyncedAt: new Date().toISOString() });
    }
  },

  setIsOnline: (isOnline) => set({ isOnline }),

  setRejections: (rejections, forcePush, discard) =>
    set({ rejections, rejectionActions: { forcePush, discard } }),

  clearRejections: () =>
    set({ rejections: [], rejectionActions: { forcePush: null, discard: null } }),

  setLastSyncedAt: (timestamp) => set({ lastSyncedAt: timestamp }),
}));

export default useSyncStore;
