import { describe, it, expect, beforeEach } from "vitest";
import { resetDB } from "../lib/db.ts";
import {
  enqueue,
  dequeue,
  peekAll,
  getQueueCount,
  clearQueue,
  removeEntriesForNote,
} from "../lib/offlineQueue.ts";

beforeEach(async () => {
  resetDB();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase("notesync-cache");
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
});

describe("offlineQueue", () => {
  it("enqueues an entry and returns an auto-increment ID", async () => {
    const id = await enqueue({
      noteId: "n1",
      action: "create",
      payload: { title: "test" },
      timestamp: Date.now(),
    });
    expect(id).toBeGreaterThan(0);
  });

  it("dequeues in FIFO order", async () => {
    await enqueue({
      noteId: "n1",
      action: "create",
      payload: {},
      timestamp: 1,
    });
    await enqueue({
      noteId: "n2",
      action: "update",
      payload: {},
      timestamp: 2,
    });

    const first = await dequeue();
    expect(first?.noteId).toBe("n1");
    const second = await dequeue();
    expect(second?.noteId).toBe("n2");
  });

  it("returns undefined when dequeuing empty queue", async () => {
    const result = await dequeue();
    expect(result).toBeUndefined();
  });

  it("peekAll returns all entries without removing", async () => {
    await enqueue({ noteId: "n1", action: "create", payload: {}, timestamp: 1 });
    await enqueue({ noteId: "n2", action: "update", payload: {}, timestamp: 2 });

    const all = await peekAll();
    expect(all).toHaveLength(2);
    // Still there
    const count = await getQueueCount();
    expect(count).toBe(2);
  });

  it("getQueueCount returns correct count", async () => {
    expect(await getQueueCount()).toBe(0);
    await enqueue({ noteId: "n1", action: "create", payload: {}, timestamp: 1 });
    expect(await getQueueCount()).toBe(1);
  });

  it("clearQueue removes all entries", async () => {
    await enqueue({ noteId: "n1", action: "create", payload: {}, timestamp: 1 });
    await enqueue({ noteId: "n2", action: "create", payload: {}, timestamp: 2 });
    await clearQueue();
    expect(await getQueueCount()).toBe(0);
  });

  it("removeEntriesForNote removes only matching entries", async () => {
    await enqueue({ noteId: "n1", action: "create", payload: {}, timestamp: 1 });
    await enqueue({ noteId: "n2", action: "update", payload: {}, timestamp: 2 });
    await enqueue({ noteId: "n1", action: "update", payload: {}, timestamp: 3 });

    await removeEntriesForNote("n1");
    const remaining = await peekAll();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].noteId).toBe("n2");
  });
});
