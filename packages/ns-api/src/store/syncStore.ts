import { getPrisma } from "../lib/prisma.js";
import type {
  Note as PrismaNote,
  Folder as PrismaFolder,
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

export async function cleanupStaleCursors(days = 90): Promise<number> {
  const prisma = getPrisma();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const result = await prisma.syncCursor.deleteMany({
    where: { lastSyncedAt: { lt: cutoff } },
  });
  return result.count;
}
