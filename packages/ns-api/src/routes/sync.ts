import { PassThrough } from "node:stream";
import type { FastifyPluginAsync } from "fastify";
import type {
  SyncChange,
  SyncPushRequest,
  SyncPullRequest,
  SyncPullResponse,
  SyncPushResponse,
  Note,
  FolderSyncData,
} from "@derekentringer/shared/ns";
import {
  getSyncCursor,
  upsertSyncCursor,
  getNotesChangedSince,
  getFoldersChangedSince,
} from "../store/syncStore.js";
import { getPrisma } from "../lib/prisma.js";
import { toNote } from "../lib/mappers.js";
import type {
  Note as PrismaNote,
  Folder as PrismaFolder,
} from "../generated/prisma/client.js";

const BATCH_LIMIT = 100;

function toFolderSyncData(f: PrismaFolder): FolderSyncData {
  return {
    id: f.id,
    name: f.name,
    parentId: f.parentId,
    sortOrder: f.sortOrder,
    favorite: f.favorite,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
    deletedAt: f.deletedAt ? f.deletedAt.toISOString() : null,
  };
}

const syncRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", async (request, reply) => {
    await (request as unknown as { jwtVerify: () => Promise<void> }).jwtVerify();
  });

  // POST /sync/push
  app.post<{ Body: SyncPushRequest }>("/push", async (request, reply) => {
    const userId = request.user.sub;
    const { deviceId, changes } = request.body;

    if (!deviceId || !Array.isArray(changes)) {
      return reply.status(400).send({ error: "Invalid request" });
    }

    const prisma = getPrisma();
    let applied = 0;
    let rejected = 0;

    for (const change of changes) {
      try {
        if (change.type === "note") {
          await applyNoteChange(prisma, userId, change);
          applied++;
        } else if (change.type === "folder") {
          await applyFolderChange(prisma, userId, change);
          applied++;
        } else {
          rejected++;
        }
      } catch (err) {
        rejected++;
        request.log.warn({ err, changeId: change.id }, "Sync change rejected");
      }
    }

    const now = new Date();
    await upsertSyncCursor(userId, deviceId, now);

    const response: SyncPushResponse = {
      applied,
      rejected,
      cursor: { deviceId, lastSyncedAt: now.toISOString() },
    };

    if (applied > 0) {
      app.sseHub.notify(userId, deviceId);
    }

    return reply.send(response);
  });

  // GET /sync/events — SSE stream for real-time sync notifications
  app.get<{ Querystring: { deviceId?: string } }>(
    "/events",
    async (request, reply) => {
      const userId = request.user.sub;
      const deviceId = (request.query.deviceId as string) || "unknown";

      const stream = new PassThrough();

      app.sseHub.addConnection(userId, deviceId, stream);

      request.raw.socket.on("close", () => {
        app.sseHub.removeConnection(userId, stream);
        stream.end();
      });

      // Send initial connected event
      stream.write("event: connected\ndata: {}\n\n");

      return reply
        .type("text/event-stream")
        .header("Cache-Control", "no-cache")
        .header("Connection", "keep-alive")
        .send(stream);
    },
  );

  // POST /sync/pull
  app.post<{ Body: SyncPullRequest }>("/pull", async (request, reply) => {
    const userId = request.user.sub;
    const { deviceId, since } = request.body;

    if (!deviceId || !since) {
      return reply.status(400).send({ error: "Invalid request" });
    }

    const sinceDate = new Date(since);

    const [notes, folders] = await Promise.all([
      getNotesChangedSince(userId, sinceDate),
      getFoldersChangedSince(userId, sinceDate),
    ]);

    const noteChanges: SyncChange[] = notes.map((n) => ({
      id: n.id,
      type: "note" as const,
      action: determineNoteAction(n, sinceDate),
      data: toNote(n),
      timestamp: n.updatedAt.toISOString(),
    }));

    const folderChanges: SyncChange[] = folders.map((f) => ({
      id: f.id,
      type: "folder" as const,
      action: determineFolderAction(f, sinceDate),
      data: toFolderSyncData(f),
      timestamp: f.updatedAt.toISOString(),
    }));

    // Merge and sort by timestamp, limit to batch size
    const allChanges = [...noteChanges, ...folderChanges]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(0, BATCH_LIMIT);

    const now = new Date();
    await upsertSyncCursor(userId, deviceId, now);

    const hasMore = (notes.length + folders.length) >= BATCH_LIMIT;

    const response: SyncPullResponse = {
      changes: allChanges,
      cursor: { deviceId, lastSyncedAt: now.toISOString() },
      hasMore,
    };

    return reply.send(response);
  });
};

function determineNoteAction(
  note: PrismaNote,
  since: Date,
): "create" | "update" | "delete" {
  if (note.deletedAt) return "delete";
  if (note.createdAt > since) return "create";
  return "update";
}

function determineFolderAction(
  folder: PrismaFolder,
  since: Date,
): "create" | "update" | "delete" {
  if (folder.deletedAt) return "delete";
  if (folder.createdAt > since) return "create";
  return "update";
}

async function applyNoteChange(
  prisma: ReturnType<typeof getPrisma>,
  userId: string,
  change: SyncChange,
): Promise<void> {
  const noteData = change.data as Note | null;

  if (change.action === "delete") {
    // Soft-delete the note
    const existing = await prisma.note.findUnique({ where: { id: change.id } });
    if (existing && existing.userId === userId) {
      await prisma.note.update({
        where: { id: change.id },
        data: { deletedAt: new Date(change.timestamp), favorite: false },
      });
    }
    return;
  }

  if (!noteData) return;

  // Last-write-wins: only apply if client timestamp >= server updatedAt
  const existing = await prisma.note.findUnique({ where: { id: change.id } });

  if (existing) {
    if (existing.userId !== userId) return;

    const clientTime = new Date(change.timestamp);
    if (clientTime < existing.updatedAt) return; // server wins

    await prisma.note.update({
      where: { id: change.id },
      data: {
        title: noteData.title,
        content: noteData.content,
        folder: noteData.folder,
        folderId: noteData.folderId,
        tags: noteData.tags,
        summary: noteData.summary,
        favorite: noteData.favorite,
        sortOrder: noteData.sortOrder,
        favoriteSortOrder: noteData.favoriteSortOrder,
        deletedAt: noteData.deletedAt ? new Date(noteData.deletedAt) : null,
      },
    });
  } else {
    // Create new note
    await prisma.note.create({
      data: {
        id: change.id,
        userId,
        title: noteData.title,
        content: noteData.content ?? "",
        folder: noteData.folder,
        folderId: noteData.folderId,
        tags: noteData.tags ?? [],
        summary: noteData.summary,
        favorite: noteData.favorite ?? false,
        sortOrder: noteData.sortOrder ?? 0,
        favoriteSortOrder: noteData.favoriteSortOrder ?? 0,
        deletedAt: noteData.deletedAt ? new Date(noteData.deletedAt) : null,
      },
    });
  }
}

async function applyFolderChange(
  prisma: ReturnType<typeof getPrisma>,
  userId: string,
  change: SyncChange,
): Promise<void> {
  const folderData = change.data as FolderSyncData | null;

  if (change.action === "delete") {
    const existing = await prisma.folder.findUnique({ where: { id: change.id } });
    if (existing && existing.userId === userId) {
      await prisma.folder.update({
        where: { id: change.id },
        data: { deletedAt: new Date(change.timestamp) },
      });
    }
    return;
  }

  if (!folderData) return;

  const existing = await prisma.folder.findUnique({ where: { id: change.id } });

  if (existing) {
    if (existing.userId !== userId) return;

    const clientTime = new Date(change.timestamp);
    if (clientTime < existing.updatedAt) return;

    await prisma.folder.update({
      where: { id: change.id },
      data: {
        name: folderData.name,
        parentId: folderData.parentId,
        sortOrder: folderData.sortOrder,
        favorite: folderData.favorite,
        deletedAt: folderData.deletedAt ? new Date(folderData.deletedAt) : null,
      },
    });
  } else {
    await prisma.folder.create({
      data: {
        id: change.id,
        userId,
        name: folderData.name,
        parentId: folderData.parentId,
        sortOrder: folderData.sortOrder ?? 0,
        favorite: folderData.favorite ?? false,
        deletedAt: folderData.deletedAt ? new Date(folderData.deletedAt) : null,
      },
    });
  }
}

export default syncRoutes;
