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
  folderChange,
} from "./helpers/syncClient.js";

/**
 * Phase 1.1 verification: the `isLocalFile` flag on Folder round-trips
 * through push → DB → pull, defaults to false for clients that omit it,
 * and is delivered to every device that syncs the folder.
 *
 * Subsequent phases add the semantics that act on the flag:
 *   1.2 — desktop stamps it when registering managed dirs
 *   1.4 — REST delete branches on it
 *   1.5 — desktop pull-side cleans up on-disk
 */

describe("Phase 1.1 — Folder.isLocalFile round-trip", () => {
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

  it("push with isLocalFile=true persists the flag", async () => {
    const client = await createSyncClient(app);

    const change = folderChange({
      action: "create",
      data: { name: "managed-root", isLocalFile: true },
    });

    const res = await client.push([change]);
    expect(res.applied).toBe(1);

    const prisma = getIntegrationPrisma();
    const row = await prisma.folder.findUnique({ where: { id: change.id } });
    expect(row?.isLocalFile).toBe(true);
  });

  it("push with isLocalFile omitted defaults to false", async () => {
    const client = await createSyncClient(app);

    // Construct a FolderSyncData manually without the field (simulates
    // an old client that predates Phase 1)
    const id = "00000000-0000-0000-0000-000000000001";
    const now = new Date().toISOString();
    const change = {
      id,
      type: "folder" as const,
      action: "create" as const,
      data: {
        id,
        name: "regular-folder",
        parentId: null,
        sortOrder: 0,
        favorite: false,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      timestamp: now,
    };

    const res = await client.push([change]);
    expect(res.applied).toBe(1);

    const prisma = getIntegrationPrisma();
    const row = await prisma.folder.findUnique({ where: { id } });
    expect(row?.isLocalFile).toBe(false);
  });

  it("pull delivers the flag to a second device", async () => {
    const { a, b } = await createTwoDeviceSetup(app);

    const change = folderChange({
      action: "create",
      data: { name: "from-A-managed", isLocalFile: true },
    });
    await a.push([change]);

    const bPull = await b.pull();
    const folder = bPull.changes.find((c) => c.type === "folder" && c.id === change.id);
    expect(folder).toBeDefined();
    expect(
      (folder?.data as { isLocalFile?: boolean }).isLocalFile,
    ).toBe(true);
  });

  it("update can flip the flag (managed → unmanaged)", async () => {
    const client = await createSyncClient(app);

    const created = folderChange({
      action: "create",
      data: { name: "folder", isLocalFile: true },
    });
    await client.push([created]);

    const updated = folderChange({
      action: "update",
      id: created.id,
      data: {
        name: "folder",
        isLocalFile: false,
        updatedAt: new Date(Date.now() + 1000).toISOString(),
      },
      timestamp: new Date(Date.now() + 1000).toISOString(),
    });
    const res = await client.push([updated]);
    expect(res.applied).toBe(1);

    const prisma = getIntegrationPrisma();
    const row = await prisma.folder.findUnique({ where: { id: created.id } });
    expect(row?.isLocalFile).toBe(false);
  });

  // NOTE: A test asserting the force-push FK-retry path preserves the flag
  // belongs here in spirit, but it would fail today for an unrelated
  // reason — the retry happens inside the same $transaction that the FK
  // violation poisoned (Phase 2.1's tx-abort cascade). Phase 1.1 added
  // isLocalFile to the retry code path in sync.ts:507-520; Phase 2.1 will
  // fix the surrounding transaction scoping so the retry can actually run,
  // at which point this test can be added back.
});
