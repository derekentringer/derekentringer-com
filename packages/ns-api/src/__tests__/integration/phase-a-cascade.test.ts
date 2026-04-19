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

describe("Phase A.2 — moveFolder cross-boundary detection", () => {
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

  async function seedBoundaryTrees(userId: string) {
    const prisma = getIntegrationPrisma();
    const managed = await prisma.folder.create({
      data: { userId, name: "Managed", isLocalFile: true },
    });
    const unmanaged = await prisma.folder.create({
      data: { userId, name: "Unmanaged", isLocalFile: false },
    });
    const child = await prisma.folder.create({
      data: {
        userId,
        name: "child",
        parentId: unmanaged.id,
        isLocalFile: false,
      },
    });
    const note = await prisma.note.create({
      data: {
        userId,
        title: "note-in-child",
        content: "",
        folderId: child.id,
      },
    });
    return { managed, unmanaged, child, note };
  }

  it("same-boundary move succeeds without confirmation", async () => {
    const client = await createSyncClient(app);
    const prisma = getIntegrationPrisma();
    const a = await prisma.folder.create({
      data: { userId: client.user.id, name: "A", isLocalFile: false },
    });
    const b = await prisma.folder.create({
      data: { userId: client.user.id, name: "B", isLocalFile: false },
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/notes/folders/${a.id}/move`,
      headers: { ...client.authHeader, "content-type": "application/json" },
      payload: { parentId: b.id },
    });
    expect(res.statusCode).toBe(200);

    const after = await prisma.folder.findUnique({ where: { id: a.id } });
    expect(after!.parentId).toBe(b.id);
    expect(after!.isLocalFile).toBe(false);
  });

  it("cross-boundary move to managed rejects with 409 and structured body", async () => {
    const client = await createSyncClient(app);
    const { managed, child } = await seedBoundaryTrees(client.user.id);

    const res = await app.inject({
      method: "PATCH",
      url: `/notes/folders/${child.id}/move`,
      headers: { ...client.authHeader, "content-type": "application/json" },
      payload: { parentId: managed.id },
    });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.code).toBe("cross_boundary_move");
    expect(body.direction).toBe("toManaged");
    expect(body.affectedFolderCount).toBe(1);
    expect(body.affectedNoteCount).toBe(1);
  });

  it("cross-boundary move to unmanaged rejects with 409 and the opposite direction", async () => {
    const client = await createSyncClient(app);
    const prisma = getIntegrationPrisma();
    const managed = await prisma.folder.create({
      data: { userId: client.user.id, name: "Managed", isLocalFile: true },
    });
    const unmanaged = await prisma.folder.create({
      data: { userId: client.user.id, name: "Unmanaged", isLocalFile: false },
    });
    const child = await prisma.folder.create({
      data: {
        userId: client.user.id,
        name: "child",
        parentId: managed.id,
        isLocalFile: true,
      },
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/notes/folders/${child.id}/move`,
      headers: { ...client.authHeader, "content-type": "application/json" },
      payload: { parentId: unmanaged.id },
    });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.direction).toBe("toUnmanaged");
    expect(body.affectedFolderCount).toBe(1);
  });

  it("confirmCrossBoundary=1 applies the move AND flips isLocalFile on the whole subtree", async () => {
    const client = await createSyncClient(app);
    const prisma = getIntegrationPrisma();
    const { managed, child } = await seedBoundaryTrees(client.user.id);

    // Add a nested grandchild so we can assert cascade depth
    const grandchild = await prisma.folder.create({
      data: {
        userId: client.user.id,
        name: "grand",
        parentId: child.id,
        isLocalFile: false,
      },
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/notes/folders/${child.id}/move?confirmCrossBoundary=1`,
      headers: { ...client.authHeader, "content-type": "application/json" },
      payload: { parentId: managed.id },
    });
    expect(res.statusCode).toBe(200);

    const movedChild = await prisma.folder.findUnique({ where: { id: child.id } });
    expect(movedChild!.parentId).toBe(managed.id);
    expect(movedChild!.isLocalFile).toBe(true);

    const movedGrandchild = await prisma.folder.findUnique({ where: { id: grandchild.id } });
    expect(movedGrandchild!.isLocalFile).toBe(true);
  });

  it("move to root preserves the flag and is not a cross-boundary move", async () => {
    const client = await createSyncClient(app);
    const prisma = getIntegrationPrisma();
    const parent = await prisma.folder.create({
      data: { userId: client.user.id, name: "Parent", isLocalFile: false },
    });
    const child = await prisma.folder.create({
      data: {
        userId: client.user.id,
        name: "child",
        parentId: parent.id,
        isLocalFile: false,
      },
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/notes/folders/${child.id}/move`,
      headers: { ...client.authHeader, "content-type": "application/json" },
      payload: { parentId: null },
    });
    expect(res.statusCode).toBe(200);

    const after = await prisma.folder.findUnique({ where: { id: child.id } });
    expect(after!.parentId).toBeNull();
    expect(after!.isLocalFile).toBe(false);
  });
});

describe("Phase A — end-to-end cross-boundary round trip (A.8)", () => {
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

  it("unmanaged subtree → managed → /sync/pull surfaces the flag flip for every descendant + notes unchanged", async () => {
    const client = await createSyncClient(app);
    const prisma = getIntegrationPrisma();

    // Seed: managed notebook + unmanaged notebook with a 3-folder subtree
    // (top + one level of children) containing 3 notes total.
    const managed = await prisma.folder.create({
      data: { userId: client.user.id, name: "Managed", isLocalFile: true },
    });
    const unmanaged = await prisma.folder.create({
      data: { userId: client.user.id, name: "Unmanaged", isLocalFile: false },
    });
    const movingTop = await prisma.folder.create({
      data: {
        userId: client.user.id,
        name: "moving",
        parentId: unmanaged.id,
        isLocalFile: false,
      },
    });
    const childA = await prisma.folder.create({
      data: {
        userId: client.user.id,
        name: "a",
        parentId: movingTop.id,
        isLocalFile: false,
      },
    });
    const childB = await prisma.folder.create({
      data: {
        userId: client.user.id,
        name: "b",
        parentId: movingTop.id,
        isLocalFile: false,
      },
    });
    const n1 = await prisma.note.create({
      data: {
        userId: client.user.id,
        title: "n1",
        content: "one",
        folderId: movingTop.id,
      },
    });
    const n2 = await prisma.note.create({
      data: {
        userId: client.user.id,
        title: "n2",
        content: "two",
        folderId: childA.id,
      },
    });
    const n3 = await prisma.note.create({
      data: {
        userId: client.user.id,
        title: "n3",
        content: "three",
        folderId: childB.id,
      },
    });

    // Initial pull so the deviceId cursor is set at the pre-move snapshot.
    const initialPull = await client.pull(new Date(0));
    expect(initialPull.changes.length).toBeGreaterThanOrEqual(3); // at minimum the 3 notes

    const cursorBeforeMove = initialPull.cursor.lastSyncedAt;

    // Attempt the move WITHOUT confirmation — expect 409.
    let res = await app.inject({
      method: "PATCH",
      url: `/notes/folders/${movingTop.id}/move`,
      headers: { ...client.authHeader, "content-type": "application/json" },
      payload: { parentId: managed.id },
    });
    expect(res.statusCode).toBe(409);
    const body409 = res.json();
    expect(body409.direction).toBe("toManaged");
    expect(body409.affectedFolderCount).toBe(3); // moving + childA + childB
    expect(body409.affectedNoteCount).toBe(3);

    // Confirm and re-submit.
    res = await app.inject({
      method: "PATCH",
      url: `/notes/folders/${movingTop.id}/move?confirmCrossBoundary=1`,
      headers: { ...client.authHeader, "content-type": "application/json" },
      payload: { parentId: managed.id },
    });
    expect(res.statusCode).toBe(200);

    // Server state: every folder in the moved subtree is now
    // isLocalFile=true; notes are unchanged.
    const [movedTop, movedA, movedB] = await Promise.all([
      prisma.folder.findUnique({ where: { id: movingTop.id } }),
      prisma.folder.findUnique({ where: { id: childA.id } }),
      prisma.folder.findUnique({ where: { id: childB.id } }),
    ]);
    expect(movedTop!.parentId).toBe(managed.id);
    expect(movedTop!.isLocalFile).toBe(true);
    expect(movedA!.isLocalFile).toBe(true);
    expect(movedB!.isLocalFile).toBe(true);

    // Notes unchanged at this point — Phase A.4 on the desktop handles
    // the disk-side work; the server doesn't mutate note rows during a
    // cross-boundary move.
    const [note1, note2, note3] = await Promise.all([
      prisma.note.findUnique({ where: { id: n1.id } }),
      prisma.note.findUnique({ where: { id: n2.id } }),
      prisma.note.findUnique({ where: { id: n3.id } }),
    ]);
    expect(note1!.folderId).toBe(movingTop.id);
    expect(note2!.folderId).toBe(childA.id);
    expect(note3!.folderId).toBe(childB.id);

    // /sync/pull after the move carries the flag flip for every
    // descendant — this is what the desktop's A.4 reconciler
    // observes to decide which notes need disk materialization.
    const pullAfterMove = await client.pull(cursorBeforeMove);
    const folderChanges = pullAfterMove.changes.filter((c) => c.type === "folder");
    const flippedIds = new Set(
      folderChanges
        .filter((c) => {
          const d = c.data as { isLocalFile?: boolean } | null;
          return d?.isLocalFile === true;
        })
        .map((c) => c.id),
    );
    expect(flippedIds.has(movingTop.id)).toBe(true);
    expect(flippedIds.has(childA.id)).toBe(true);
    expect(flippedIds.has(childB.id)).toBe(true);
  });

  it("reverse: managed subtree → unmanaged flips every descendant back", async () => {
    const client = await createSyncClient(app);
    const prisma = getIntegrationPrisma();

    const managed = await prisma.folder.create({
      data: { userId: client.user.id, name: "Managed", isLocalFile: true },
    });
    const unmanaged = await prisma.folder.create({
      data: { userId: client.user.id, name: "Unmanaged", isLocalFile: false },
    });
    const movingTop = await prisma.folder.create({
      data: {
        userId: client.user.id,
        name: "moving",
        parentId: managed.id,
        isLocalFile: true,
      },
    });
    const child = await prisma.folder.create({
      data: {
        userId: client.user.id,
        name: "child",
        parentId: movingTop.id,
        isLocalFile: true,
      },
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/notes/folders/${movingTop.id}/move?confirmCrossBoundary=1`,
      headers: { ...client.authHeader, "content-type": "application/json" },
      payload: { parentId: unmanaged.id },
    });
    expect(res.statusCode).toBe(200);

    const [movedTop, movedChild] = await Promise.all([
      prisma.folder.findUnique({ where: { id: movingTop.id } }),
      prisma.folder.findUnique({ where: { id: child.id } }),
    ]);
    expect(movedTop!.isLocalFile).toBe(false);
    expect(movedChild!.isLocalFile).toBe(false);
  });
});
