import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  getIntegrationPrisma,
  resetDb,
  disconnectIntegrationPrisma,
} from "./helpers/db.js";
import { createTestUser, authHeaderFor } from "./helpers/users.js";

/**
 * REST DELETE /notes/:id — mirror of the folder-delete suite for the
 * note case. Regression test: a file deleted on web from a
 * managed-locally subfolder needs to propagate to desktop as both the
 * hard-delete (so the local SQLite row disappears) and the tombstone
 * (so the `/sync/pull` path delivers a signal that triggers the
 * on-disk file's moveToTrash).
 *
 * The bug: `softDeleteNote` hard-deleted `isLocalFile=true` notes but
 * forgot to call `writeTombstone`. The desktop then had no way to
 * learn about the deletion — the row silently vanished from
 * `/sync/pull`'s findMany results and the local copy + on-disk file
 * lingered forever.
 */

describe("REST DELETE /notes/:id — delete matrix", () => {
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

  it("regular note: soft-deletes (deletedAt set) and does NOT write a tombstone", async () => {
    const prisma = getIntegrationPrisma();
    const user = await createTestUser();
    const note = await prisma.note.create({
      data: {
        userId: user.id,
        title: "draft",
        content: "",
        isLocalFile: false,
      },
    });

    const res = await app.inject({
      method: "DELETE",
      url: `/notes/${note.id}`,
      headers: authHeaderFor(user),
    });

    expect(res.statusCode).toBe(204);

    const after = await prisma.note.findUnique({ where: { id: note.id } });
    expect(after).not.toBeNull();
    expect(after!.deletedAt).not.toBeNull();

    // Regular-note deletes DO NOT tombstone — the trash/restore UX
    // rides on the `deletedAt`-marked row which syncs normally.
    const tombstones = await prisma.entityTombstone.findMany({
      where: { userId: user.id, entityType: "note", entityId: note.id },
    });
    expect(tombstones).toHaveLength(0);
  });

  it("managed-locally note: hard-deletes AND writes a tombstone atomically", async () => {
    const prisma = getIntegrationPrisma();
    const user = await createTestUser();
    const folder = await prisma.folder.create({
      data: { userId: user.id, name: "test1", isLocalFile: true },
    });
    const note = await prisma.note.create({
      data: {
        userId: user.id,
        title: "file-note",
        content: "",
        folderId: folder.id,
        isLocalFile: true,
      },
    });

    const res = await app.inject({
      method: "DELETE",
      url: `/notes/${note.id}`,
      headers: authHeaderFor(user),
    });

    expect(res.statusCode).toBe(204);

    // Row is gone — hard-delete.
    expect(await prisma.note.findUnique({ where: { id: note.id } })).toBeNull();

    // Tombstone written so every active sync_cursor-holder picks up the
    // deletion on its next `/sync/pull` and can trash the on-disk file.
    const tombstones = await prisma.entityTombstone.findMany({
      where: { userId: user.id, entityType: "note", entityId: note.id },
    });
    expect(tombstones).toHaveLength(1);
    expect(tombstones[0].entityType).toBe("note");
    expect(tombstones[0].entityId).toBe(note.id);
  });

  it("managed-locally note: tombstone is delivered via /sync/pull to other devices", async () => {
    const prisma = getIntegrationPrisma();
    const user = await createTestUser();
    const folder = await prisma.folder.create({
      data: { userId: user.id, name: "test1", isLocalFile: true },
    });
    const note = await prisma.note.create({
      data: {
        userId: user.id,
        title: "file-note",
        content: "",
        folderId: folder.id,
        isLocalFile: true,
      },
    });

    await app.inject({
      method: "DELETE",
      url: `/notes/${note.id}`,
      headers: authHeaderFor(user),
    });

    const pullRes = await app.inject({
      method: "POST",
      url: "/sync/pull",
      headers: {
        ...authHeaderFor(user),
        "content-type": "application/json",
      },
      payload: {
        deviceId: "desktop-a",
        since: new Date(0).toISOString(),
      },
    });
    expect(pullRes.statusCode).toBe(200);
    const body = pullRes.json();

    // The tombstone is in the `tombstones` payload with the note's id.
    expect(body.tombstones).toBeDefined();
    const noteTombstone = body.tombstones.find(
      (t: { id: string; type: string }) => t.id === note.id,
    );
    expect(noteTombstone).toBeDefined();
    expect(noteTombstone.type).toBe("note");
  });
});
