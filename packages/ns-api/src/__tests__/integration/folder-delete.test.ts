import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  getIntegrationPrisma,
  resetDb,
  disconnectIntegrationPrisma,
} from "./helpers/db.js";
import { createTestUser, authHeaderFor } from "./helpers/users.js";

/**
 * Phase 1.4 — REST DELETE /notes/folders/:id branches on isLocalFile.
 *
 *   - Unmanaged folder (isLocalFile=false): soft-delete (today's behavior)
 *   - Managed folder   (isLocalFile=true ): hard-delete, mirroring the
 *                                            sync-push delete path.
 *
 * Both modes (`move-up` and `recursive`) are verified for both branches.
 */

describe("Phase 1.4 — REST folder delete branches on isLocalFile", () => {
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
    it("move-up mode soft-deletes the folder and re-files notes", async () => {
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

      // Folder is soft-deleted, note unfiled but still alive
      const f = await prisma.folder.findUnique({ where: { id: folder.id } });
      expect(f).not.toBeNull();
      expect(f?.deletedAt).not.toBeNull();

      const n = await prisma.note.findUnique({ where: { id: note.id } });
      expect(n).not.toBeNull();
      expect(n?.folderId).toBeNull();
      expect(n?.deletedAt).toBeNull();
    });

    it("recursive mode soft-deletes the tree but unfiles notes", async () => {
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

      // Both folders soft-deleted; note unfiled but not deleted
      expect((await prisma.folder.findUnique({ where: { id: parent.id } }))?.deletedAt).not.toBeNull();
      expect((await prisma.folder.findUnique({ where: { id: child.id } }))?.deletedAt).not.toBeNull();

      const n = await prisma.note.findUnique({ where: { id: note.id } });
      expect(n).not.toBeNull();
      expect(n?.folderId).toBeNull();
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
