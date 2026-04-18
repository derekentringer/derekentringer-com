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

// Keyset pagination on (updatedAt, id): `updatedAt > since` alone can
// straddle rows sharing an identical updatedAt across BATCH_LIMIT. The
// tie-breaker `lastId` lets the next page resume without skipping.
export async function getNotesChangedSince(
  userId: string,
  since: Date,
  lastId?: string,
): Promise<PrismaNote[]> {
  const prisma = getPrisma();
  return prisma.note.findMany({
    where: {
      userId,
      ...(lastId
        ? {
            OR: [
              { updatedAt: { gt: since } },
              { updatedAt: since, id: { gt: lastId } },
            ],
          }
        : { updatedAt: { gt: since } }),
    },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: BATCH_LIMIT,
  });
}

export async function getFoldersChangedSince(
  userId: string,
  since: Date,
  lastId?: string,
): Promise<PrismaFolder[]> {
  const prisma = getPrisma();
  return prisma.folder.findMany({
    where: {
      userId,
      ...(lastId
        ? {
            OR: [
              { updatedAt: { gt: since } },
              { updatedAt: since, id: { gt: lastId } },
            ],
          }
        : { updatedAt: { gt: since } }),
    },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: BATCH_LIMIT,
  });
}

export async function getImagesChangedSince(
  userId: string,
  since: Date,
  lastId?: string,
): Promise<PrismaImage[]> {
  const prisma = getPrisma();
  return prisma.image.findMany({
    where: {
      userId,
      ...(lastId
        ? {
            OR: [
              { updatedAt: { gt: since } },
              { updatedAt: since, id: { gt: lastId } },
            ],
          }
        : { updatedAt: { gt: since } }),
    },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: BATCH_LIMIT,
  });
}

export async function getTombstonesChangedSince(
  userId: string,
  since: Date,
  lastEntityId?: string,
): Promise<PrismaTombstone[]> {
  const prisma = getPrisma();
  return prisma.entityTombstone.findMany({
    where: {
      userId,
      ...(lastEntityId
        ? {
            OR: [
              { deletedAt: { gt: since } },
              { deletedAt: since, entityId: { gt: lastEntityId } },
            ],
          }
        : { deletedAt: { gt: since } }),
    },
    orderBy: [{ deletedAt: "asc" }, { entityId: "asc" }],
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

/**
 * Phase 4.5 — tombstone sweep.
 *
 * A tombstone is safe to drop once every active `sync_cursor` for the
 * user has advanced past `deletedAt`. Any device whose cursor hasn't
 * moved past the deletion may still need to observe the tombstone on
 * its next pull, so we can't delete it yet.
 *
 * Stale cursors (device uninstalled, browser localStorage cleared)
 * would block the sweep forever. Callers should run
 * `cleanupStaleCursors` (default 90 days) first so abandoned cursors
 * don't pin tombstones indefinitely.
 *
 * Returns the number of tombstones removed. A single sweep removing
 * more than `alertThreshold` rows (default 10,000) is logged as a
 * warning — that's an accumulation pattern the cron is supposed to
 * prevent and usually signals a bug.
 */
export async function sweepTombstones(opts?: {
  alertThreshold?: number;
  logger?: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void };
}): Promise<number> {
  const prisma = getPrisma();
  const alertThreshold = opts?.alertThreshold ?? 10_000;

  // Delete every tombstone for which NO sync_cursor for that user has
  // a lastSyncedAt <= tombstone.deletedAt. Equivalent to: every cursor
  // for this user is already past the deletion. Expressed with a raw
  // SQL correlated subquery because Prisma's query DSL can't negate
  // per-row against a joined table.
  const result = await prisma.$executeRaw`
    DELETE FROM entity_tombstones t
    WHERE NOT EXISTS (
      SELECT 1 FROM sync_cursors c
      WHERE c."userId" = t."userId"
        AND c."lastSyncedAt" <= t."deletedAt"
    )
  `;

  const removed = typeof result === "number" ? result : 0;
  const log = opts?.logger;
  if (log) {
    if (removed >= alertThreshold) {
      log.warn(
        { removed, alertThreshold },
        "Tombstone sweep removed more than expected — unexpected accumulation may signal a bug",
      );
    } else if (removed > 0) {
      log.info({ removed }, "Tombstone sweep");
    }
  }
  return removed;
}
