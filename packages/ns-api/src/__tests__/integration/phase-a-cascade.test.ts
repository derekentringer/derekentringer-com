import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  getIntegrationPrisma,
  resetDb,
  disconnectIntegrationPrisma,
} from "./helpers/db.js";
import {
  createSyncClient,
  folderChange,
} from "./helpers/syncClient.js";

/**
 * Phase A — strict `isLocalFile` cascade invariant.
 *
 * Covers A.1 (server-side enforcement at folder-write sites). A.2's
 * cross-boundary 409 + confirmCrossBoundary is exercised in a separate
 * test file once that item lands.
 */

describe("Phase A.1 — server coerces folder.isLocalFile to root ancestor's flag", () => {
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

  it("sync-push create under a managed root is coerced to isLocalFile=true even if client sends false", async () => {
    const client = await createSyncClient(app);
    const prisma = getIntegrationPrisma();
    const root = await prisma.folder.create({
      data: { userId: client.user.id, name: "Managed", isLocalFile: true },
    });

    const res = await client.push([
      folderChange({
        action: "create",
        data: {
          name: "child",
          parentId: root.id,
          isLocalFile: false, // <- wrong; root is managed
        },
      }),
    ]);

    expect(res.applied).toBe(1);
    const created = await prisma.folder.findFirst({
      where: { userId: client.user.id, name: "child" },
    });
    expect(created).not.toBeNull();
    expect(created!.isLocalFile).toBe(true);
  });

  it("sync-push create under an unmanaged root is coerced to isLocalFile=false even if client sends true", async () => {
    const client = await createSyncClient(app);
    const prisma = getIntegrationPrisma();
    const root = await prisma.folder.create({
      data: { userId: client.user.id, name: "Regular", isLocalFile: false },
    });

    const res = await client.push([
      folderChange({
        action: "create",
        data: {
          name: "child",
          parentId: root.id,
          isLocalFile: true, // <- wrong; root is unmanaged
        },
      }),
    ]);

    expect(res.applied).toBe(1);
    const created = await prisma.folder.findFirst({
      where: { userId: client.user.id, name: "child" },
    });
    expect(created!.isLocalFile).toBe(false);
  });

  it("sync-push update cannot flip isLocalFile in isolation — target root wins", async () => {
    const client = await createSyncClient(app);
    const prisma = getIntegrationPrisma();
    const root = await prisma.folder.create({
      data: { userId: client.user.id, name: "Managed", isLocalFile: true },
    });
    const child = await prisma.folder.create({
      data: {
        userId: client.user.id,
        name: "child",
        parentId: root.id,
        isLocalFile: true,
      },
    });

    // Client attempts to flip the flag to false while leaving parentId
    // pointing at the managed root. Should be coerced back to true.
    const res = await client.push([
      folderChange({
        action: "update",
        id: child.id,
        data: {
          name: "child",
          parentId: root.id,
          isLocalFile: false,
        },
      }),
    ]);

    expect(res.applied).toBe(1);
    const after = await prisma.folder.findUnique({ where: { id: child.id } });
    expect(after!.isLocalFile).toBe(true);
  });

  it("REST createFolder under a managed parent inherits via root walk", async () => {
    const client = await createSyncClient(app);
    const prisma = getIntegrationPrisma();
    const root = await prisma.folder.create({
      data: { userId: client.user.id, name: "Managed", isLocalFile: true },
    });
    const middle = await prisma.folder.create({
      data: {
        userId: client.user.id,
        name: "middle",
        parentId: root.id,
        isLocalFile: true,
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/notes/folders",
      headers: { ...client.authHeader, "content-type": "application/json" },
      payload: { name: "leaf", parentId: middle.id },
    });
    expect(res.statusCode).toBe(201);

    const leaf = await prisma.folder.findFirst({
      where: { userId: client.user.id, name: "leaf" },
    });
    expect(leaf).not.toBeNull();
    // Cascaded through middle → root. Root is managed → leaf is managed.
    expect(leaf!.isLocalFile).toBe(true);
  });

  it("REST createFolder at root level defaults to isLocalFile=false", async () => {
    const client = await createSyncClient(app);
    const res = await app.inject({
      method: "POST",
      url: "/notes/folders",
      headers: { ...client.authHeader, "content-type": "application/json" },
      payload: { name: "standalone" },
    });
    expect(res.statusCode).toBe(201);

    const prisma = getIntegrationPrisma();
    const created = await prisma.folder.findFirst({
      where: { userId: client.user.id, name: "standalone" },
    });
    expect(created!.isLocalFile).toBe(false);
  });
});
