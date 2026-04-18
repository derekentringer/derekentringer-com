import { getPrisma } from "../lib/prisma.js";
import type {
  Note as PrismaNote,
  Folder as PrismaFolder,
  Image as PrismaImage,
  EntityTombstone as PrismaTombstone,
} from "../generated/prisma/client.js";

const BATCH_LIMIT = 100;

export async function getSyncCursor(
  userId: string,
  deviceId: string,
): Promise<Date | null> {
  const prisma = getPrisma();
  const cursor = await prisma.syncCursor.findUnique({
    where: { userId_deviceId: { userId, deviceId } },
  });
  return cursor?.lastSyncedAt ?? null;
}

export async function upsertSyncCursor(
  userId: string,
  deviceId: string,
  lastSyncedAt: Date,
): Promise<void> {
  const prisma = getPrisma();
  await prisma.syncCursor.upsert({
    where: { userId_deviceId: { userId, deviceId } },
    create: { userId, deviceId, lastSyncedAt },
    update: { lastSyncedAt },
  });
}

export async function getNotesChangedSince(
  userId: string,
  since: Date,
): Promise<PrismaNote[]> {
  const prisma = getPrisma();
  return prisma.note.findMany({
    where: {
      userId,
      updatedAt: { gt: since },
    },
    orderBy: { updatedAt: "asc" },
    take: BATCH_LIMIT,
  });
}

export async function getFoldersChangedSince(
  userId: string,
  since: Date,
): Promise<PrismaFolder[]> {
  const prisma = getPrisma();
  return prisma.folder.findMany({
    where: {
      userId,
      updatedAt: { gt: since },
    },
    orderBy: { updatedAt: "asc" },
    take: BATCH_LIMIT,
  });
}

export async function getImagesChangedSince(
  userId: string,
  since: Date,
): Promise<PrismaImage[]> {
  const prisma = getPrisma();
  return prisma.image.findMany({
    where: {
      userId,
      updatedAt: { gt: since },
    },
    orderBy: { updatedAt: "asc" },
    take: BATCH_LIMIT,
  });
}

export async function getTombstonesChangedSince(
  userId: string,
  since: Date,
): Promise<PrismaTombstone[]> {
  const prisma = getPrisma();
  return prisma.entityTombstone.findMany({
    where: {
      userId,
      deletedAt: { gt: since },
    },
    orderBy: { deletedAt: "asc" },
    take: BATCH_LIMIT,
  });
}

/**
 * Upsert a tombstone inside a transaction. `tx` is the prisma transaction
 * client passed from `applyFolderChange` / `applyNoteChange` so the hard
 * delete + tombstone write happen atomically.
 */
export async function writeTombstone(
  tx: Pick<ReturnType<typeof getPrisma>, "entityTombstone">,
  userId: string,
  entityType: "folder" | "note",
  entityId: string,
): Promise<void> {
  const now = new Date();
  await tx.entityTombstone.upsert({
    where: { userId_entityId: { userId, entityId } },
    create: { userId, entityType, entityId, deletedAt: now },
    update: { deletedAt: now, entityType },
  });
}

export async function cleanupStaleCursors(days = 90): Promise<number> {
  const prisma = getPrisma();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const result = await prisma.syncCursor.deleteMany({
    where: { lastSyncedAt: { lt: cutoff } },
  });
  return result.count;
}
