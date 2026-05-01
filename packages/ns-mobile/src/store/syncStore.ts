import { create } from "zustand";
import type { SyncRejection } from "@derekentringer/ns-shared";
import type { SyncStatus } from "@/lib/syncEngine";

/** Active network connection class. Mirrors the values
 *  `@react-native-community/netinfo` reports. We only care about the
 *  wifi vs not-wifi distinction for image-upload gating; bluetooth /
 *  ethernet / vpn / wimax all collapse to "other". */
export type ConnectionType = "wifi" | "cellular" | "none" | "other" | "unknown";

interface SyncState {
  status: SyncStatus;
  error: string | null;
  isOnline: boolean;
  /** Phase D — connection class. Defaults to `"unknown"` until the
   *  first NetInfo event lands. Lets feature code (image upload's
   *  wifi-only setting, future bandwidth-aware syncs) decide whether
   *  to auto-flush over cellular. */
  connectionType: ConnectionType;
  rejections: SyncRejection[];
  rejectionActions: {
    forcePush: ((changeIds: string[]) => Promise<void>) | null;
    discard: ((changeIds: string[]) => Promise<void>) | null;
  };
  lastSyncedAt: string | null;
  /** Phase A.5.1 — bumped whenever the sync engine's SSE stream
   *  emits a `chat` event from the server (another device wrote to
   *  the user's chat history). AiScreen reads it as a "go refetch
   *  chat history" trigger. */
  chatRefreshKey: number;
}

interface SyncActions {
  setStatus: (status: SyncStatus, error: string | null) => void;
  setIsOnline: (isOnline: boolean) => void;
  setConnectionType: (connectionType: ConnectionType) => void;
  setRejections: (
    rejections: SyncRejection[],
    forcePush: (changeIds: string[]) => Promise<void>,
    discard: (changeIds: string[]) => Promise<void>,
  ) => void;
  clearRejections: () => void;
  setLastSyncedAt: (timestamp: string) => void;
  /** Bump the chatRefreshKey to signal a remote chat-history change. */
  bumpChatRefresh: () => void;
}

const useSyncStore = create<SyncState & SyncActions>()((set) => ({
  status: "idle",
  error: null,
  isOnline: true,
  connectionType: "unknown",
  rejections: [],
  rejectionActions: { forcePush: null, discard: null },
  lastSyncedAt: null,
  chatRefreshKey: 0,

  setStatus: (status, error) => {
    set({ status, error });
    if (status === "idle") {
      set({ lastSyncedAt: new Date().toISOString() });
    }
  },

  setIsOnline: (isOnline) => set({ isOnline }),

  setConnectionType: (connectionType) => set({ connectionType }),

  setRejections: (rejections, forcePush, discard) =>
    set({ rejections, rejectionActions: { forcePush, discard } }),

  clearRejections: () =>
    set({ rejections: [], rejectionActions: { forcePush: null, discard: null } }),

  setLastSyncedAt: (timestamp) => set({ lastSyncedAt: timestamp }),

  bumpChatRefresh: () =>
    set((state) => ({ chatRefreshKey: state.chatRefreshKey + 1 })),
}));

export default useSyncStore;
