import { PassThrough } from "node:stream";
import type { FastifyPluginAsync } from "fastify";
import type {
  SyncChange,
  SyncPushRequest,
  SyncPullRequest,
  SyncPullResponse,
  SyncPushResponse,
  SyncRejection,
  Note,
  FolderSyncData,
  ImageSyncData,
} from "@derekentringer/shared/ns";
import {
  getSyncCursor,
  upsertSyncCursor,
  getNotesChangedSince,
  getFoldersChangedSince,
  getImagesChangedSince,
  getTombstonesChangedSince,
  writeTombstone,
} from "../store/syncStore.js";
import { getPrisma } from "../lib/prisma.js";
import { toNote } from "../lib/mappers.js";
import type {
  Note as PrismaNote,
  Folder as PrismaFolder,
  Image as PrismaImage,
} from "../generated/prisma/client.js";

type PrismaLike = Pick<ReturnType<typeof getPrisma>, "note" | "folder" | "image" | "entityTombstone">;

const BATCH_LIMIT = 100;

function toFolderSyncData(f: PrismaFolder): FolderSyncData {
  return {
    id: f.id,
    name: f.name,
    parentId: f.parentId,
    sortOrder: f.sortOrder,
    favorite: f.favorite,
    isLocalFile: f.isLocalFile,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
    deletedAt: f.deletedAt ? f.deletedAt.toISOString() : null,
  };
}

function toImageSyncData(i: PrismaImage): ImageSyncData {
  return {
    id: i.id,
    noteId: i.noteId,
    filename: i.filename,
    mimeType: i.mimeType,
    sizeBytes: i.sizeBytes,
    r2Key: i.r2Key,
    r2Url: i.r2Url,
    altText: i.altText,
    aiDescription: i.aiDescription,
    sortOrder: i.sortOrder,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
    deletedAt: i.deletedAt ? i.deletedAt.toISOString() : null,
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
    let skipped = 0;
    const rejections: SyncRejection[] = [];

    // Per-change transactions. A single outer tx would enter
    // `in_failed_sql_transaction` state on the first Postgres constraint
    // violation (FK, unique), poisoning every subsequent statement in the
    // batch. Running each change in its own tx isolates failures so a
    // single bad change can't silently drop its 99 neighbors.
    for (const change of changes) {
      try {
        const result = await prisma.$transaction(async (tx) => {
          if (change.type === "note") {
            return await applyNoteChange(tx, userId, change);
          }
          if (change.type === "folder") {
            return await applyFolderChange(tx, userId, change);
          }
          if (change.type === "image") {
            return await applyImageChange(tx, userId, change);
          }
          return "unknown" as const;
        });

        if (result === "applied") {
          applied++;
        } else if (result === "timestamp_conflict") {
          skipped++;
          rejections.push({
            changeId: change.id,
            changeType: change.type,
            changeAction: change.action,
            reason: "timestamp_conflict",
            message: `Server has a newer version of this ${change.type}`,
          });
        } else if (result === "unknown") {
          rejected++;
        } else {
          skipped++;
        }
      } catch (err) {
        rejected++;
        const rejection = classifyPrismaError(err, change);
        rejections.push(rejection);
        request.log.warn({ err, changeId: change.id }, "Sync change rejected");
      }
    }

    const now = new Date();
    await upsertSyncCursor(userId, deviceId, now);

    const response: SyncPushResponse = {
      applied,
      rejected,
      skipped,
      cursor: { deviceId, lastSyncedAt: now.toISOString() },
      ...(rejections.length > 0 ? { rejections } : {}),
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

    const [notes, folders, images, tombstones] = await Promise.all([
      getNotesChangedSince(userId, sinceDate),
      getFoldersChangedSince(userId, sinceDate),
      getImagesChangedSince(userId, sinceDate),
      getTombstonesChangedSince(userId, sinceDate),
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

    const imageChanges: SyncChange[] = images.map((i) => ({
      id: i.id,
      type: "image" as const,
      action: determineImageAction(i, sinceDate),
      data: toImageSyncData(i),
      timestamp: i.updatedAt.toISOString(),
    }));

    // Merge and sort by timestamp ASC. Each per-type query is already capped
    // at BATCH_LIMIT (see syncStore.ts), so the combined response is bounded
    // at 3*BATCH_LIMIT.
    const allChanges = [...noteChanges, ...folderChanges, ...imageChanges].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    // Cursor math: per-type pagination with a single global cursor.
    //
    // Each per-type query uses `take: BATCH_LIMIT`. If a type hit that cap,
    // there may be more items of that type with `updatedAt > lastReturned`.
    // We must NOT advance the global cursor past any such item, or the next
    // pull (which uses `updatedAt > cursor`) will permanently skip it.
    //
    // For each type compute a "safe advance" timestamp:
    //   - If the type hit BATCH_LIMIT: its last returned item's updatedAt.
    //     We've seen everything up to and including this timestamp.
    //   - If the type returned < BATCH_LIMIT: +Infinity. This type is drained.
    //
    // Global cursor = min(safe advance across all types). This guarantees the
    // next pull cannot skip items of any capped type, because we never
    // advance past that type's last-seen boundary.
    const safeAdvance = (
      items: Array<{ updatedAt?: Date; deletedAt?: Date | null }>,
    ): number => {
      if (items.length < BATCH_LIMIT) return Number.POSITIVE_INFINITY;
      const last = items[items.length - 1];
      // Regular entities carry updatedAt; tombstones carry deletedAt.
      const ts = last.updatedAt ?? last.deletedAt;
      return ts ? ts.getTime() : Number.POSITIVE_INFINITY;
    };

    const minSafe = Math.min(
      safeAdvance(notes),
      safeAdvance(folders),
      safeAdvance(images),
      safeAdvance(tombstones),
    );

    const tombstoneData = tombstones.map((t) => ({
      id: t.entityId,
      type: t.entityType as "folder" | "note",
      deletedAt: t.deletedAt.toISOString(),
    }));

    let cursorDate: Date;
    if (Number.isFinite(minSafe)) {
      // At least one type is capped — advance cursor only as far as safe.
      cursorDate = new Date(minSafe);
    } else if (allChanges.length > 0 || tombstoneData.length > 0) {
      // All types fully drained — advance to the last returned item.
      const lastChangeTs = allChanges.length > 0
        ? new Date(allChanges[allChanges.length - 1].timestamp).getTime()
        : 0;
      const lastTombstoneTs = tombstones.length > 0
        ? tombstones[tombstones.length - 1].deletedAt.getTime()
        : 0;
      cursorDate = new Date(Math.max(lastChangeTs, lastTombstoneTs));
    } else {
      // Nothing returned — hold cursor at wall-clock so the client doesn't
      // re-pull the same empty range forever.
      cursorDate = new Date();
    }
    await upsertSyncCursor(userId, deviceId, cursorDate);

    // hasMore is true if ANY per-type query hit its BATCH_LIMIT cap, meaning
    // more items of that type exist beyond what we fetched.
    const hasMore =
      notes.length >= BATCH_LIMIT ||
      folders.length >= BATCH_LIMIT ||
      images.length >= BATCH_LIMIT ||
      tombstones.length >= BATCH_LIMIT;

    const response: SyncPullResponse = {
      changes: allChanges,
      cursor: { deviceId, lastSyncedAt: cursorDate.toISOString() },
      hasMore,
      ...(tombstoneData.length > 0 ? { tombstones: tombstoneData } : {}),
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

type ApplyResult = "applied" | "skipped" | "timestamp_conflict";

async function applyNoteChange(
  prisma: PrismaLike,
  userId: string,
  change: SyncChange,
): Promise<ApplyResult> {
  const noteData = change.data as Note | null;

  if (change.action === "delete") {
    const existing = await prisma.note.findUnique({ where: { id: change.id } });
    if (existing && existing.userId === userId) {
      if (existing.isLocalFile) {
        // Hard-delete locally managed files to prevent stale entries + write
        // a tombstone so other clients learn about the deletion via pull.
        await prisma.note.delete({ where: { id: change.id } });
        await writeTombstone(prisma, userId, "note", change.id);
      } else {
        // Soft-delete regular notes (NoteSync trash)
        await prisma.note.update({
          where: { id: change.id },
          data: { deletedAt: new Date(change.timestamp), favorite: false },
        });
      }
      return "applied";
    }
    return "skipped";
  }

  if (!noteData) return "skipped";

  // Last-write-wins: only apply if client timestamp >= server updatedAt
  const existing = await prisma.note.findUnique({ where: { id: change.id } });

  if (existing) {
    if (existing.userId !== userId) return "skipped";

    const clientTime = new Date(change.timestamp);
    if (!change.force && clientTime < existing.updatedAt) return "timestamp_conflict";

    const noteUpdateData: Record<string, unknown> = {
      title: noteData.title,
      content: noteData.content,
      folder: noteData.folder,
      folderId: noteData.folderId,
      tags: noteData.tags,
      summary: noteData.summary,
      favorite: noteData.favorite,
      sortOrder: noteData.sortOrder,
      favoriteSortOrder: noteData.favoriteSortOrder,
      isLocalFile: noteData.isLocalFile ?? false,
      deletedAt: noteData.deletedAt ? new Date(noteData.deletedAt) : null,
    };

    try {
      await prisma.note.update({
        where: { id: change.id },
        data: noteUpdateData,
      });
    } catch (err: unknown) {
      // On FK violation during force push, retry with folderId: null
      if (change.force && isPrismaError(err, "P2003")) {
        noteUpdateData.folderId = null;
        noteUpdateData.folder = null;
        await prisma.note.update({
          where: { id: change.id },
          data: noteUpdateData,
        });
      } else {
        throw err;
      }
    }
    return "applied";
  } else {
    // Create new note
    try {
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
          isLocalFile: noteData.isLocalFile ?? false,
          deletedAt: noteData.deletedAt ? new Date(noteData.deletedAt) : null,
        },
      });
    } catch (err: unknown) {
      // On FK violation during force push, retry with folderId: null
      if (change.force && isPrismaError(err, "P2003")) {
        await prisma.note.create({
          data: {
            id: change.id,
            userId,
            title: noteData.title,
            content: noteData.content ?? "",
            folder: null,
            folderId: null,
            tags: noteData.tags ?? [],
            summary: noteData.summary,
            favorite: noteData.favorite ?? false,
            sortOrder: noteData.sortOrder ?? 0,
            favoriteSortOrder: noteData.favoriteSortOrder ?? 0,
            isLocalFile: noteData.isLocalFile ?? false,
            deletedAt: noteData.deletedAt ? new Date(noteData.deletedAt) : null,
          },
        });
      } else {
        throw err;
      }
    }
    return "applied";
  }
}

async function applyFolderChange(
  prisma: PrismaLike,
  userId: string,
  change: SyncChange,
): Promise<ApplyResult> {
  const folderData = change.data as FolderSyncData | null;

  if (change.action === "delete") {
    const existing = await prisma.folder.findUnique({ where: { id: change.id } });
    if (existing && existing.userId === userId) {
      // Unfile any notes still in this folder
      await prisma.note.updateMany({
        where: { folderId: change.id },
        data: { folderId: existing.parentId },
      });
      // Move child folders to parent
      await prisma.folder.updateMany({
        where: { parentId: change.id },
        data: { parentId: existing.parentId },
      });
      // Hard-delete the folder + write a tombstone so other clients see the
      // deletion on their next pull.
      await prisma.folder.delete({ where: { id: change.id } });
      await writeTombstone(prisma, userId, "folder", change.id);
      return "applied";
    }
    return "skipped";
  }

  if (!folderData) return "skipped";

  const existing = await prisma.folder.findUnique({ where: { id: change.id } });

  if (existing) {
    if (existing.userId !== userId) return "skipped";

    const clientTime = new Date(change.timestamp);
    if (!change.force && clientTime < existing.updatedAt) return "timestamp_conflict";

    const folderUpdateData: Record<string, unknown> = {
      name: folderData.name,
      parentId: folderData.parentId,
      sortOrder: folderData.sortOrder,
      favorite: folderData.favorite,
      isLocalFile: folderData.isLocalFile ?? false,
      deletedAt: folderData.deletedAt ? new Date(folderData.deletedAt) : null,
    };

    try {
      await prisma.folder.update({
        where: { id: change.id },
        data: folderUpdateData,
      });
    } catch (err: unknown) {
      if (change.force && isPrismaError(err, "P2003")) {
        folderUpdateData.parentId = null;
        await prisma.folder.update({
          where: { id: change.id },
          data: folderUpdateData,
        });
      } else {
        throw err;
      }
    }
    return "applied";
  } else {
    try {
      await prisma.folder.create({
        data: {
          id: change.id,
          userId,
          name: folderData.name,
          parentId: folderData.parentId,
          sortOrder: folderData.sortOrder ?? 0,
          favorite: folderData.favorite ?? false,
          isLocalFile: folderData.isLocalFile ?? false,
          deletedAt: folderData.deletedAt ? new Date(folderData.deletedAt) : null,
        },
      });
    } catch (err: unknown) {
      if (change.force && isPrismaError(err, "P2003")) {
        await prisma.folder.create({
          data: {
            id: change.id,
            userId,
            name: folderData.name,
            parentId: null,
            sortOrder: folderData.sortOrder ?? 0,
            favorite: folderData.favorite ?? false,
            isLocalFile: folderData.isLocalFile ?? false,
            deletedAt: folderData.deletedAt ? new Date(folderData.deletedAt) : null,
          },
        });
      } else {
        throw err;
      }
    }
    return "applied";
  }
}

function determineImageAction(
  image: PrismaImage,
  since: Date,
): "create" | "update" | "delete" {
  if (image.deletedAt) return "delete";
  if (image.createdAt > since) return "create";
  return "update";
}

async function applyImageChange(
  prisma: PrismaLike,
  userId: string,
  change: SyncChange,
): Promise<ApplyResult> {
  const imageData = change.data as ImageSyncData | null;

  if (change.action === "delete") {
    const existing = await prisma.image.findUnique({ where: { id: change.id } });
    if (existing && existing.userId === userId) {
      await prisma.image.update({
        where: { id: change.id },
        data: { deletedAt: new Date(change.timestamp) },
      });
      return "applied";
    }
    return "skipped";
  }

  if (!imageData) return "skipped";

  const existing = await prisma.image.findUnique({ where: { id: change.id } });

  if (existing) {
    if (existing.userId !== userId) return "skipped";

    const clientTime = new Date(change.timestamp);
    if (!change.force && clientTime < existing.updatedAt) return "timestamp_conflict";

    await prisma.image.update({
      where: { id: change.id },
      data: {
        noteId: imageData.noteId,
        filename: imageData.filename,
        mimeType: imageData.mimeType,
        sizeBytes: imageData.sizeBytes,
        r2Key: imageData.r2Key,
        r2Url: imageData.r2Url,
        altText: imageData.altText,
        aiDescription: imageData.aiDescription,
        sortOrder: imageData.sortOrder,
        deletedAt: imageData.deletedAt ? new Date(imageData.deletedAt) : null,
      },
    });
    return "applied";
  } else {
    await prisma.image.create({
      data: {
        id: change.id,
        userId,
        noteId: imageData.noteId,
        filename: imageData.filename,
        mimeType: imageData.mimeType,
        sizeBytes: imageData.sizeBytes,
        r2Key: imageData.r2Key,
        r2Url: imageData.r2Url,
        altText: imageData.altText ?? "",
        aiDescription: imageData.aiDescription,
        sortOrder: imageData.sortOrder ?? 0,
        deletedAt: imageData.deletedAt ? new Date(imageData.deletedAt) : null,
      },
    });
    return "applied";
  }
}

function isPrismaError(err: unknown, code: string): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === code
  );
}

function classifyPrismaError(err: unknown, change: SyncChange): SyncRejection {
  let reason: SyncRejection["reason"] = "unknown";
  let message = "An unknown error occurred";

  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code: string }).code;
    if (code === "P2003") {
      reason = "fk_constraint";
      message = "Referenced record (folder or parent) does not exist";
    } else if (code === "P2002") {
      reason = "unique_constraint";
      message = "A record with this identifier already exists";
    } else if (code === "P2025") {
      reason = "not_found";
      message = "Record not found";
    }
  }

  if (reason === "unknown" && err instanceof Error) {
    message = err.message;
  }

  return {
    changeId: change.id,
    changeType: change.type,
    changeAction: change.action,
    reason,
    message,
  };
}

export default syncRoutes;
