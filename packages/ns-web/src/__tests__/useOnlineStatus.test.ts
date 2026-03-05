import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOnlineStatus } from "../hooks/useOnlineStatus.ts";

beforeEach(() => {
  Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
});

describe("useOnlineStatus", () => {
  it("defaults to online", () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.isOnline).toBe(true);
  });

  it("updates to offline on offline event", async () => {
    const { result } = renderHook(() => useOnlineStatus());

    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(result.current.isOnline).toBe(false);
  });

  it("updates to online on online event", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true });
    const { result } = renderHook(() => useOnlineStatus());

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    expect(result.current.isOnline).toBe(true);
  });

  it("lastSyncedAt is initially null", () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.lastSyncedAt).toBeNull();
  });
});
