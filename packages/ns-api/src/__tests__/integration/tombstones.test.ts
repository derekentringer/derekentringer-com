import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  getIntegrationPrisma,
  resetDb,
  disconnectIntegrationPrisma,
} from "./helpers/db.js";
import {
  createTwoDeviceSetup,
  createSyncClient,
  noteChange,
  folderChange,
} from "./helpers/syncClient.js";
import { createTestUser, authHeaderFor } from "./helpers/users.js";

/**
 * Phase 1.5 tombstones — server-side behavior verification:
 *   - REST delete + sync-push delete both write tombstones
 *   - `/sync/pull` returns tombstones since the client's cursor
 *   - Cursor advances past returned tombstones; re-pull returns nothing
 *   - Tombstone upsert semantics (re-emitted deletes don't duplicate)
 *
 * Client-side tombstone processing (desktop/mobile) is tested separately
 * in their respective packages.
 */

describe("Phase 1.5 — sync pull delivers tombstones", () => {
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

  it("REST folder delete produces a tombstone that another device pulls", async () => {
    const prisma = getIntegrationPrisma();
    const { user, a, b } = await createTwoDeviceSetup(app);

    // Device A creates a folder; device B pulls it into its view
    const create = folderChange({ action: "create", data: { name: "Work" } });
    await a.push([create]);

    const firstPullB = await b.pull();
    expect(firstPullB.changes.some((c) => c.id === create.id)).toBe(true);
    expect(firstPullB.tombstones ?? []).toEqual([]);

    // Web (REST) deletes the folder — simulate by calling the route
    // authenticated as the user rather than via either device.
    const delRes = await app.inject({
      method: "DELETE",
      url: `/notes/folders/${create.id}`,
      headers: authHeaderFor(user),
    });
    expect(delRes.statusCode).toBe(200);

    // Server row is gone; tombstone exists
    expect(await prisma.folder.findUnique({ where: { id: create.id } })).toBeNull();
    const tombstone = await prisma.entityTombstone.findUnique({
      where: { userId_entityId: { userId: user.id, entityId: create.id } },
    });
    expect(tombstone).not.toBeNull();
    expect(tombstone?.entityType).toBe("folder");

    // Device B pulls and receives the tombstone
    const secondPullB = await b.pull(firstPullB.cursor.lastSyncedAt);
    expect(secondPullB.tombstones).toBeDefined();
    expect(secondPullB.tombstones).toHaveLength(1);
    expect(secondPullB.tombstones?.[0]).toMatchObject({
      id: create.id,
      type: "folder",
    });

    // Cursor advanced past the tombstone; subsequent pull returns nothing
    const thirdPullB = await b.pull(secondPullB.cursor.lastSyncedAt);
    expect(thirdPullB.changes).toHaveLength(0);
    expect(thirdPullB.tombstones ?? []).toEqual([]);
  });

  it("sync-push folder delete emits a tombstone for other devices", async () => {
    const { a, b } = await createTwoDeviceSetup(app);

    const create = folderChange({ action: "create", data: { name: "Personal" } });
    await a.push([create]);

    const firstPullB = await b.pull();
    expect(firstPullB.changes.some((c) => c.id === create.id)).toBe(true);

    // Device A pushes a delete (sync-push path, not REST)
    const del = folderChange({
      action: "delete",
      id: create.id,
      data: { name: "Personal" },
    });
    await a.push([del]);

    const secondPullB = await b.pull(firstPullB.cursor.lastSyncedAt);
    expect(secondPullB.tombstones).toBeDefined();
    expect(secondPullB.tombstones?.[0]?.id).toBe(create.id);
  });

  it("sync-push delete of isLocalFile note emits a tombstone", async () => {
    const prisma = getIntegrationPrisma();
    const { a, b } = await createTwoDeviceSetup(app);

    const create = noteChange({
      action: "create",
      data: { title: "managed-note", content: "", isLocalFile: true },
    });
    await a.push([create]);

    const firstPullB = await b.pull();
    expect(firstPullB.changes.some((c) => c.id === create.id)).toBe(true);

    // Delete via sync push
    const del = noteChange({ action: "delete", id: create.id });
    await a.push([del]);

    // Server row is gone (hard-delete for isLocalFile)
    expect(await prisma.note.findUnique({ where: { id: create.id } })).toBeNull();

    // B pulls → note tombstone present
    const secondPullB = await b.pull(firstPullB.cursor.lastSyncedAt);
    const noteTomb = secondPullB.tombstones?.find((t) => t.id === create.id);
    expect(noteTomb).toBeDefined();
    expect(noteTomb?.type).toBe("note");
  });

  it("sync-push delete of regular note still soft-deletes (no tombstone)", async () => {
    const { a, b } = await createTwoDeviceSetup(app);

    const create = noteChange({
      action: "create",
      data: { title: "regular-note", content: "", isLocalFile: false },
    });
    await a.push([create]);

    const firstPullB = await b.pull();

    const del = noteChange({ action: "delete", id: create.id });
    await a.push([del]);

    // Regular-note delete comes through as a SyncChange with action=delete
    // (soft-delete path), NOT as a tombstone.
    const secondPullB = await b.pull(firstPullB.cursor.lastSyncedAt);
    expect(secondPullB.tombstones ?? []).toEqual([]);
    const deleteChange = secondPullB.changes.find((c) => c.id === create.id);
    expect(deleteChange).toBeDefined();
    expect(deleteChange?.action).toBe("delete");
  });

  it("tombstone upsert: re-emitted delete updates existing row, no duplicates", async () => {
    const prisma = getIntegrationPrisma();
    const user = await createTestUser();
    const a = await createSyncClient(app, { user });

    const create = folderChange({ action: "create", data: { name: "X" } });
    await a.push([create]);

    await a.push([folderChange({ action: "delete", id: create.id, data: { name: "X" } })]);
    const firstCount = await prisma.entityTombstone.count({ where: { userId: user.id } });
    expect(firstCount).toBe(1);

    // A second push of the same delete (legitimate: client retries on
    // network drop) should not duplicate — upsert refreshes deletedAt.
    await a.push([folderChange({ action: "delete", id: create.id, data: { name: "X" } })]);
    const secondCount = await prisma.entityTombstone.count({ where: { userId: user.id } });
    expect(secondCount).toBe(1);
  });

  it("tombstones do not leak across users", async () => {
    const prisma = getIntegrationPrisma();
    const alice = await createSyncClient(app);
    const bob = await createSyncClient(app);

    const change = folderChange({ action: "create", data: { name: "alice-only" } });
    await alice.push([change]);
    await alice.push([folderChange({ action: "delete", id: change.id, data: { name: "alice-only" } })]);

    expect(
      await prisma.entityTombstone.count({ where: { userId: alice.user.id } }),
    ).toBe(1);
    expect(
      await prisma.entityTombstone.count({ where: { userId: bob.user.id } }),
    ).toBe(0);

    const bobPull = await bob.pull();
    expect(bobPull.tombstones ?? []).toEqual([]);
  });
});
