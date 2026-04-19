import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import {
  getIntegrationPrisma,
  resetDb,
  disconnectIntegrationPrisma,
} from "./helpers/db.js";
import { createTestUser } from "./helpers/users.js";
import { sweepTombstones, cleanupStaleCursors } from "../../store/syncStore.js";

/**
 * Phase 4.5 — tombstone sweep. A tombstone is safe to drop once every
 * active sync_cursor for the user has advanced past `deletedAt`.
 */

describe("sweepTombstones", () => {
  beforeAll(() => {
    getIntegrationPrisma();
  });

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await disconnectIntegrationPrisma();
  });

  it("does not delete tombstones while any cursor is still behind the deletion", async () => {
    const prisma = getIntegrationPrisma();
    const user = await createTestUser();

    const deletedAt = new Date("2026-04-01T00:00:00Z");
    await prisma.entityTombstone.create({
      data: {
        userId: user.id,
        entityType: "folder",
        entityId: "folder-1",
        deletedAt,
      },
    });

    // Two devices. Device A past the deletion; device B still behind.
    await prisma.syncCursor.create({
      data: {
        userId: user.id,
        deviceId: "device-a",
        lastSyncedAt: new Date("2026-04-02T00:00:00Z"),
      },
    });
    await prisma.syncCursor.create({
      data: {
        userId: user.id,
        deviceId: "device-b",
        lastSyncedAt: new Date("2026-03-31T00:00:00Z"),
      },
    });

    const removed = await sweepTombstones();
    expect(removed).toBe(0);

    const tombstones = await prisma.entityTombstone.findMany({
      where: { userId: user.id },
    });
    expect(tombstones).toHaveLength(1);
  });

  it("deletes tombstones once every cursor has advanced past deletedAt", async () => {
    const prisma = getIntegrationPrisma();
    const user = await createTestUser();

    const deletedAt = new Date("2026-04-01T00:00:00Z");
    await prisma.entityTombstone.create({
      data: {
        userId: user.id,
        entityType: "folder",
        entityId: "folder-1",
        deletedAt,
      },
    });
    await prisma.entityTombstone.create({
      data: {
        userId: user.id,
        entityType: "note",
        entityId: "note-1",
        deletedAt,
      },
    });

    // Both cursors past the deletion.
    await prisma.syncCursor.create({
      data: {
        userId: user.id,
        deviceId: "device-a",
        lastSyncedAt: new Date("2026-04-02T00:00:00Z"),
      },
    });
    await prisma.syncCursor.create({
      data: {
        userId: user.id,
        deviceId: "device-b",
        lastSyncedAt: new Date("2026-04-03T00:00:00Z"),
      },
    });

    const removed = await sweepTombstones();
    expect(removed).toBe(2);

    const tombstones = await prisma.entityTombstone.findMany({
      where: { userId: user.id },
    });
    expect(tombstones).toHaveLength(0);
  });

  it("deletes tombstones when the user has no active cursors (all uninstalled)", async () => {
    const prisma = getIntegrationPrisma();
    const user = await createTestUser();

    await prisma.entityTombstone.create({
      data: {
        userId: user.id,
        entityType: "folder",
        entityId: "folder-orphan",
        deletedAt: new Date("2026-04-01T00:00:00Z"),
      },
    });

    const removed = await sweepTombstones();
    expect(removed).toBe(1);
  });

  it("cleanupStaleCursors unblocks tombstones pinned by abandoned cursors", async () => {
    const prisma = getIntegrationPrisma();
    const user = await createTestUser();

    const deletedAt = new Date("2026-04-01T00:00:00Z");
    await prisma.entityTombstone.create({
      data: {
        userId: user.id,
        entityType: "folder",
        entityId: "folder-1",
        deletedAt,
      },
    });

    // Abandoned cursor from 200 days ago — user uninstalled desktop
    // long ago but the cursor row persists.
    const stale = new Date();
    stale.setDate(stale.getDate() - 200);
    await prisma.syncCursor.create({
      data: { userId: user.id, deviceId: "old-desktop", lastSyncedAt: stale },
    });

    // Active cursor past the deletion.
    await prisma.syncCursor.create({
      data: {
        userId: user.id,
        deviceId: "current-desktop",
        lastSyncedAt: new Date("2026-04-05T00:00:00Z"),
      },
    });

    // Sweep alone doesn't remove the tombstone because the stale
    // cursor is behind.
    expect(await sweepTombstones()).toBe(0);

    // After cleanupStaleCursors drops the 200-day-old row, the sweep
    // can progress.
    const cursorsRemoved = await cleanupStaleCursors(90);
    expect(cursorsRemoved).toBe(1);

    expect(await sweepTombstones()).toBe(1);
  });

  it("scopes per-user — cursors for user A don't block user B's tombstones", async () => {
    const prisma = getIntegrationPrisma();
    const userA = await createTestUser();
    const userB = await createTestUser();

    const deletedAt = new Date("2026-04-01T00:00:00Z");
    await prisma.entityTombstone.create({
      data: {
        userId: userA.id,
        entityType: "folder",
        entityId: "a-folder",
        deletedAt,
      },
    });
    await prisma.entityTombstone.create({
      data: {
        userId: userB.id,
        entityType: "folder",
        entityId: "b-folder",
        deletedAt,
      },
    });

    // User A has a cursor behind the deletion.
    await prisma.syncCursor.create({
      data: {
        userId: userA.id,
        deviceId: "a-device",
        lastSyncedAt: new Date("2026-03-30T00:00:00Z"),
      },
    });
    // User B has a cursor past.
    await prisma.syncCursor.create({
      data: {
        userId: userB.id,
        deviceId: "b-device",
        lastSyncedAt: new Date("2026-04-05T00:00:00Z"),
      },
    });

    const removed = await sweepTombstones();
    expect(removed).toBe(1);

    const remaining = await prisma.entityTombstone.findMany();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].userId).toBe(userA.id);
  });
});
