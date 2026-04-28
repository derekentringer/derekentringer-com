import useSyncStore from "@/store/syncStore";

describe("syncStore", () => {
  beforeEach(() => {
    // Reset store state. chatRefreshKey doesn't have a "reset" action
    // (it monotonically increases in production); set it via Zustand
    // directly so tests are order-independent.
    const { setStatus, clearRejections, setIsOnline } = useSyncStore.getState();
    setStatus("idle", null);
    setIsOnline(true);
    clearRejections();
    useSyncStore.setState({ chatRefreshKey: 0 });
  });

  describe("status transitions", () => {
    it("starts with idle status", () => {
      const { status, error } = useSyncStore.getState();
      expect(status).toBe("idle");
      expect(error).toBeNull();
    });

    it("transitions to syncing", () => {
      useSyncStore.getState().setStatus("syncing", null);
      expect(useSyncStore.getState().status).toBe("syncing");
    });

    it("transitions to error with message", () => {
      useSyncStore.getState().setStatus("error", "Network failed");
      const { status, error } = useSyncStore.getState();
      expect(status).toBe("error");
      expect(error).toBe("Network failed");
    });

    it("transitions to offline", () => {
      useSyncStore.getState().setStatus("offline", null);
      expect(useSyncStore.getState().status).toBe("offline");
    });

    it("updates lastSyncedAt when going to idle", () => {
      // Set to syncing first to clear lastSyncedAt value from beforeEach
      useSyncStore.getState().setStatus("syncing", null);
      const before = useSyncStore.getState().lastSyncedAt;

      // Transition to idle — should set lastSyncedAt
      useSyncStore.getState().setStatus("idle", null);
      const after = useSyncStore.getState().lastSyncedAt;
      expect(after).not.toBeNull();
      expect(typeof after).toBe("string");
    });
  });

  describe("online status", () => {
    it("starts online", () => {
      expect(useSyncStore.getState().isOnline).toBe(true);
    });

    it("can be set to offline", () => {
      useSyncStore.getState().setIsOnline(false);
      expect(useSyncStore.getState().isOnline).toBe(false);
    });

    it("can be set back to online", () => {
      useSyncStore.getState().setIsOnline(false);
      useSyncStore.getState().setIsOnline(true);
      expect(useSyncStore.getState().isOnline).toBe(true);
    });
  });

  describe("rejections", () => {
    it("starts with empty rejections", () => {
      expect(useSyncStore.getState().rejections).toEqual([]);
    });

    it("stores rejections with action functions", () => {
      const mockForcePush = jest.fn();
      const mockDiscard = jest.fn();
      const rejections = [
        {
          changeId: "note-1",
          changeType: "note" as const,
          changeAction: "update" as const,
          reason: "timestamp_conflict" as const,
          message: "Conflict detected",
        },
      ];

      useSyncStore.getState().setRejections(rejections, mockForcePush, mockDiscard);

      const state = useSyncStore.getState();
      expect(state.rejections).toHaveLength(1);
      expect(state.rejections[0].changeId).toBe("note-1");
      expect(state.rejectionActions.forcePush).toBe(mockForcePush);
      expect(state.rejectionActions.discard).toBe(mockDiscard);
    });

    it("starts with chatRefreshKey 0 and increments on bump", () => {
      // Phase A.5.1 — used by the AiScreen to detect remote chat-
      // history changes from other devices.
      expect(useSyncStore.getState().chatRefreshKey).toBe(0);
      useSyncStore.getState().bumpChatRefresh();
      expect(useSyncStore.getState().chatRefreshKey).toBe(1);
      useSyncStore.getState().bumpChatRefresh();
      useSyncStore.getState().bumpChatRefresh();
      expect(useSyncStore.getState().chatRefreshKey).toBe(3);
    });

    it("clears rejections", () => {
      const mockForcePush = jest.fn();
      const mockDiscard = jest.fn();
      useSyncStore.getState().setRejections(
        [{ changeId: "note-1", changeType: "note", changeAction: "update", reason: "timestamp_conflict", message: "" }],
        mockForcePush,
        mockDiscard,
      );

      useSyncStore.getState().clearRejections();

      const state = useSyncStore.getState();
      expect(state.rejections).toEqual([]);
      expect(state.rejectionActions.forcePush).toBeNull();
      expect(state.rejectionActions.discard).toBeNull();
    });
  });
});
