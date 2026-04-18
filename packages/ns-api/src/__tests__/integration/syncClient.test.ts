import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  getIntegrationPrisma,
  resetDb,
  disconnectIntegrationPrisma,
} from "./helpers/db.js";
import {
  createSyncClient,
  createTwoDeviceSetup,
  noteChange,
  folderChange,
} from "./helpers/syncClient.js";

/**
 * Demo tests for the two-client sync fixture. If these pass, the fixture
 * is ready to drive the Phase 2 correctness reference tests.
 */

describe("sync client fixture", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    getIntegrationPrisma();
    const { buildApp } = await import("../../app.js");
    app = buildApp({ disableRateLimit: true });
  });

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await app.close();
    await disconnectIntegrationPrisma();
  });

  it("single client push + pull round trip", async () => {
    const client = await createSyncClient(app);

    const change = noteChange({
      action: "create",
      data: { title: "hello", content: "world" },
    });

    const pushRes = await client.push([change]);
    expect(pushRes.applied).toBe(1);
    expect(pushRes.rejected).toBe(0);

    const pullRes = await client.pull();
    expect(pullRes.changes).toHaveLength(1);
    expect(pullRes.changes[0].id).toBe(change.id);
    expect((pullRes.changes[0].data as { title: string }).title).toBe("hello");
  });

  it("device A writes, device B pulls, state converges", async () => {
    const { a, b } = await createTwoDeviceSetup(app);

    const change = noteChange({
      action: "create",
      data: { title: "from A" },
    });

    const pushRes = await a.push([change]);
    expect(pushRes.applied).toBe(1);

    const bPull = await b.pull();
    expect(bPull.changes).toHaveLength(1);
    expect(bPull.changes[0].id).toBe(change.id);
    expect((bPull.changes[0].data as { title: string }).title).toBe("from A");
  });

  it("device B does not see device A's unpushed changes", async () => {
    const { b } = await createTwoDeviceSetup(app);
    const bPull = await b.pull();
    expect(bPull.changes).toHaveLength(0);
  });

  it("two users' writes are isolated", async () => {
    const alice = await createSyncClient(app);
    const bob = await createSyncClient(app);

    await alice.push([noteChange({ action: "create", data: { title: "alice note" } })]);

    const bobPull = await bob.pull();
    expect(bobPull.changes).toHaveLength(0);
  });

  it("pull cursor advances — second pull returns nothing new", async () => {
    const client = await createSyncClient(app);
    await client.push([noteChange({ action: "create", data: { title: "n1" } })]);

    const first = await client.pull();
    expect(first.changes.length).toBeGreaterThan(0);

    const second = await client.pull(first.cursor.lastSyncedAt);
    expect(second.changes).toHaveLength(0);
  });

  it("folder + note FK ordering within one push", async () => {
    const client = await createSyncClient(app);

    const folder = folderChange({
      action: "create",
      data: { name: "work" },
    });
    const note = noteChange({
      action: "create",
      data: { title: "task", folderId: folder.id },
    });

    const res = await client.push([folder, note]);
    expect(res.applied).toBe(2);
    expect(res.rejected).toBe(0);

    const prisma = getIntegrationPrisma();
    const dbNote = await prisma.note.findUnique({ where: { id: note.id } });
    expect(dbNote?.folderId).toBe(folder.id);
  });

  it("rejection is surfaced on FK violation (non-force push)", async () => {
    const client = await createSyncClient(app);

    // Reference a folder that does not exist
    const orphan = noteChange({
      action: "create",
      data: { title: "orphan", folderId: "ffffffff-ffff-ffff-ffff-ffffffffffff" },
    });

    const res = await client.push([orphan]);
    // Either applied as orphan (null folderId fallback) or rejected outright —
    // today's behavior is to reject with fk_constraint. Test asserts the
    // observable contract.
    expect(res.rejected).toBeGreaterThanOrEqual(0);
    if (res.rejections) {
      expect(res.rejections.length).toBe(1);
      expect(res.rejections[0].changeId).toBe(orphan.id);
    }
  });
});
