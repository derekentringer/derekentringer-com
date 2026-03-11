import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PassThrough } from "node:stream";
import { createSseHub, type SseHub } from "../lib/sseHub.js";

describe("SseHub", () => {
  let hub: SseHub;

  beforeEach(() => {
    vi.useFakeTimers();
    hub = createSseHub();
  });

  afterEach(() => {
    hub.cleanup();
    vi.useRealTimers();
  });

  it("tracks connections per user", () => {
    const s1 = new PassThrough();
    const s2 = new PassThrough();
    hub.addConnection("user-1", "device-a", s1);
    hub.addConnection("user-1", "device-b", s2);

    expect(hub.connectionCount("user-1")).toBe(2);
    expect(hub.connectionCount("user-2")).toBe(0);
    expect(hub.connectionCount()).toBe(2);
  });

  it("removes a specific connection", () => {
    const s1 = new PassThrough();
    const s2 = new PassThrough();
    hub.addConnection("user-1", "device-a", s1);
    hub.addConnection("user-1", "device-b", s2);

    hub.removeConnection("user-1", s1);
    expect(hub.connectionCount("user-1")).toBe(1);
  });

  it("removes user entry when last connection is removed", () => {
    const s1 = new PassThrough();
    hub.addConnection("user-1", "device-a", s1);
    hub.removeConnection("user-1", s1);
    expect(hub.connectionCount("user-1")).toBe(0);
    expect(hub.connectionCount()).toBe(0);
  });

  it("sends sync event to all connections for a user", () => {
    const s1 = new PassThrough();
    const s2 = new PassThrough();
    hub.addConnection("user-1", "device-a", s1);
    hub.addConnection("user-1", "device-b", s2);

    hub.notify("user-1");

    expect(s1.read()?.toString()).toBe("event: sync\ndata: {}\n\n");
    expect(s2.read()?.toString()).toBe("event: sync\ndata: {}\n\n");
  });

  it("excludes the specified device from notifications", () => {
    const s1 = new PassThrough();
    const s2 = new PassThrough();
    hub.addConnection("user-1", "device-a", s1);
    hub.addConnection("user-1", "device-b", s2);

    hub.notify("user-1", "device-a");

    expect(s1.read()).toBeNull();
    expect(s2.read()?.toString()).toBe("event: sync\ndata: {}\n\n");
  });

  it("does not notify connections for other users", () => {
    const s1 = new PassThrough();
    const s2 = new PassThrough();
    hub.addConnection("user-1", "device-a", s1);
    hub.addConnection("user-2", "device-b", s2);

    hub.notify("user-1");

    expect(s1.read()?.toString()).toBe("event: sync\ndata: {}\n\n");
    expect(s2.read()).toBeNull();
  });

  it("is a no-op when notifying a user with no connections", () => {
    expect(() => hub.notify("nonexistent")).not.toThrow();
  });

  it("sends heartbeat comments on 30s interval", () => {
    const s1 = new PassThrough();
    hub.addConnection("user-1", "device-a", s1);

    // Drain any initial data
    s1.read();

    vi.advanceTimersByTime(30_000);

    const data = s1.read()?.toString();
    expect(data).toBe(":\n\n");
  });

  it("removes errored streams during heartbeat", () => {
    const s1 = new PassThrough();
    hub.addConnection("user-1", "device-a", s1);

    // Override write to throw, simulating a broken connection
    s1.write = () => {
      throw new Error("write after destroy");
    };

    vi.advanceTimersByTime(30_000);

    expect(hub.connectionCount("user-1")).toBe(0);
  });

  it("sweeps stale connections after 90s", () => {
    const s1 = new PassThrough();
    hub.addConnection("user-1", "device-a", s1);

    // Advance 60s — two heartbeats, sweepDead runs on even beats
    // But heartbeat writes keep lastWrite fresh, so connection stays
    vi.advanceTimersByTime(60_000);
    expect(hub.connectionCount("user-1")).toBe(1);
  });

  it("evicts oldest connection when exceeding limit of 5", () => {
    const streams: PassThrough[] = [];
    for (let i = 0; i < 5; i++) {
      const s = new PassThrough();
      // Stagger lastWrite times by advancing timer
      hub.addConnection("user-1", `device-${i}`, s);
      streams.push(s);
      vi.advanceTimersByTime(100);
    }

    expect(hub.connectionCount("user-1")).toBe(5);

    // Add a 6th connection — should evict the oldest (device-0)
    const s6 = new PassThrough();
    hub.addConnection("user-1", "device-5", s6);

    expect(hub.connectionCount("user-1")).toBe(5);
    // The oldest stream (device-0) should be ended
    expect(streams[0].writableEnded).toBe(true);
  });

  it("removes dead streams during notify", () => {
    const s1 = new PassThrough();
    const s2 = new PassThrough();
    hub.addConnection("user-1", "device-a", s1);
    hub.addConnection("user-1", "device-b", s2);

    // Make s1 throw on write (simulating broken connection)
    s1.write = () => {
      throw new Error("write after destroy");
    };

    hub.notify("user-1");

    // s1 should be removed, s2 should still be there
    expect(hub.connectionCount("user-1")).toBe(1);
    expect(s2.read()?.toString()).toBe("event: sync\ndata: {}\n\n");
  });

  it("cleanup closes all streams and clears state", () => {
    const s1 = new PassThrough();
    const s2 = new PassThrough();
    hub.addConnection("user-1", "device-a", s1);
    hub.addConnection("user-2", "device-b", s2);

    hub.cleanup();

    expect(hub.connectionCount()).toBe(0);
    expect(s1.destroyed || s1.writableEnded).toBe(true);
    expect(s2.destroyed || s2.writableEnded).toBe(true);
  });
});
