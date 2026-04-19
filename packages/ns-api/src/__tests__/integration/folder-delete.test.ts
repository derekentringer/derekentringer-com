import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  getIntegrationPrisma,
  resetDb,
  disconnectIntegrationPrisma,
} from "./helpers/db.js";
import { createTestUser, authHeaderFor } from "./helpers/users.js";

/**
 * Phase 1.4/1.5 — REST DELETE /notes/folders/:id always hard-deletes and
 * writes tombstones so clients learn about the deletion via `/sync/pull`.
 *
 * Folders have no trash/restore UI, so soft-deleting was only ever a
 * zombie-row generator. All folder deletes (managed or not) now hard-
 * delete and tombstone. For `recursive` deletes, every note in the
 * subtree is also hard-deleted and tombstoned.
 *
 * Both modes (`move-up` and `recursive`) are verified end-to-end.
 */

describe("Phase 1.4/1.5 — REST folder delete hard-deletes + tombstones", () => {
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

  describe("unmanaged folder (isLocalFile=false)", () => {
    it("move-up mode hard-deletes the folder, re-files notes, writes folder tombstone", async () => {
      const prisma = getIntegrationPrisma();
      const user = await createTestUser();
      const folder = await prisma.folder.create({
        data: { userId: user.id, name: "Work", isLocalFile: false },
      });
      const note = await prisma.note.create({
        data: { userId: user.id, title: "task", content: "", folderId: folder.id },
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/notes/folders/${folder.id}`,
        headers: authHeaderFor(user),
      });

      expect(res.statusCode).toBe(200);

      // Folder is HARD-deleted (not soft), note unfiled but still alive
      expect(await prisma.folder.findUnique({ where: { id: folder.id } })).toBeNull();

      const n = await prisma.note.findUnique({ where: { id: note.id } });
      expect(n).not.toBeNull();
      expect(n?.folderId).toBeNull();
      expect(n?.deletedAt).toBeNull();

      // Tombstone written for the folder, none for the note
      const tombstones = await prisma.entityTombstone.findMany({ where: { userId: user.id } });
      expect(tombstones).toHaveLength(1);
      expect(tombstones[0].entityType).toBe("folder");
      expect(tombstones[0].entityId).toBe(folder.id);
    });

    it("recursive mode hard-deletes the whole tree, tombstones every folder + note", async () => {
      const prisma = getIntegrationPrisma();
      const user = await createTestUser();
      const parent = await prisma.folder.create({
        data: { userId: user.id, name: "Work", isLocalFile: false },
      });
      const child = await prisma.folder.create({
        data: { userId: user.id, name: "Q2", parentId: parent.id, isLocalFile: false },
      });
      const note = await prisma.note.create({
        data: { userId: user.id, title: "task", content: "", folderId: child.id },
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/notes/folders/${parent.id}?mode=recursive`,
        headers: authHeaderFor(user),
      });

      expect(res.statusCode).toBe(200);

      // Everything in the subtree is hard-deleted
      expect(await prisma.folder.findUnique({ where: { id: parent.id } })).toBeNull();
      expect(await prisma.folder.findUnique({ where: { id: child.id } })).toBeNull();
      expect(await prisma.note.findUnique({ where: { id: note.id } })).toBeNull();

      // Tombstones for both folders + the note
      const tombstones = await prisma.entityTombstone.findMany({ where: { userId: user.id } });
      const ids = tombstones.map((t) => t.entityId).sort();
      expect(ids).toEqual([child.id, note.id, parent.id].sort());
    });
  });

  describe("managed folder (isLocalFile=true)", () => {
    it("move-up mode hard-deletes the folder and re-files notes up", async () => {
      const prisma = getIntegrationPrisma();
      const user = await createTestUser();
      const rootFolder = await prisma.folder.create({
        data: { userId: user.id, name: "Root", isLocalFile: false },
      });
      const managed = await prisma.folder.create({
        data: {
          userId: user.id,
          name: "managed-notes",
          parentId: rootFolder.id,
          isLocalFile: true,
        },
      });
      const note = await prisma.note.create({
        data: {
          userId: user.id,
          title: "managed-note",
          content: "",
          folderId: managed.id,
          isLocalFile: true,
        },
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/notes/folders/${managed.id}`,
        headers: authHeaderFor(user),
      });

      expect(res.statusCode).toBe(200);

      // Managed folder is gone entirely (not soft-deleted)
      expect(await prisma.folder.findUnique({ where: { id: managed.id } })).toBeNull();

      // Note re-filed to the managed folder's parent (rootFolder), not null
      // (move-up semantics). Still alive.
      const n = await prisma.note.findUnique({ where: { id: note.id } });
      expect(n).not.toBeNull();
      expect(n?.folderId).toBe(rootFolder.id);
      expect(n?.deletedAt).toBeNull();
    });

    it("recursive mode hard-deletes managed folder AND its notes + descendants", async () => {
      const prisma = getIntegrationPrisma();
      const user = await createTestUser();
      const managed = await prisma.folder.create({
        data: { userId: user.id, name: "managed", isLocalFile: true },
      });
      const subfolder = await prisma.folder.create({
        data: {
          userId: user.id,
          name: "sub",
          parentId: managed.id,
          isLocalFile: true,
        },
      });
      const note1 = await prisma.note.create({
        data: {
          userId: user.id,
          title: "root-file",
          content: "",
          folderId: managed.id,
          isLocalFile: true,
        },
      });
      const note2 = await prisma.note.create({
        data: {
          userId: user.id,
          title: "sub-file",
          content: "",
          folderId: subfolder.id,
          isLocalFile: true,
        },
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/notes/folders/${managed.id}?mode=recursive`,
        headers: authHeaderFor(user),
      });

      expect(res.statusCode).toBe(200);

      // Everything in the managed subtree is hard-deleted
      expect(await prisma.folder.findUnique({ where: { id: managed.id } })).toBeNull();
      expect(await prisma.folder.findUnique({ where: { id: subfolder.id } })).toBeNull();
      expect(await prisma.note.findUnique({ where: { id: note1.id } })).toBeNull();
      expect(await prisma.note.findUnique({ where: { id: note2.id } })).toBeNull();
    });

    it("recursive managed-folder delete leaves unrelated folders intact", async () => {
      const prisma = getIntegrationPrisma();
      const user = await createTestUser();
      const managed = await prisma.folder.create({
        data: { userId: user.id, name: "managed", isLocalFile: true },
      });
      const siblingUnmanaged = await prisma.folder.create({
        data: { userId: user.id, name: "unrelated", isLocalFile: false },
      });
      const siblingNote = await prisma.note.create({
        data: {
          userId: user.id,
          title: "untouched",
          content: "",
          folderId: siblingUnmanaged.id,
        },
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/notes/folders/${managed.id}?mode=recursive`,
        headers: authHeaderFor(user),
      });

      expect(res.statusCode).toBe(200);
      expect(await prisma.folder.findUnique({ where: { id: managed.id } })).toBeNull();

      // Sibling + its note untouched
      const sib = await prisma.folder.findUnique({ where: { id: siblingUnmanaged.id } });
      expect(sib).not.toBeNull();
      expect(sib?.deletedAt).toBeNull();

      const n = await prisma.note.findUnique({ where: { id: siblingNote.id } });
      expect(n).not.toBeNull();
    });
  });
});
