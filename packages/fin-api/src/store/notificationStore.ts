import type {
  DeviceToken,
  NotificationPreference,
  NotificationLogEntry,
  NotificationConfig,
} from "@derekentringer/shared";
import { NotificationType } from "@derekentringer/shared";
import { getPrisma } from "../lib/prisma.js";
import {
  decryptDeviceToken,
  encryptDeviceTokenForCreate,
  decryptNotificationPreference,
  encryptNotificationPreferenceForCreate,
  encryptNotificationPreferenceForUpdate,
  decryptNotificationLog,
  encryptNotificationLogForCreate,
} from "../lib/mappers.js";

function isNotFoundError(e: unknown): boolean {
  return (
    e !== null &&
    typeof e === "object" &&
    "code" in e &&
    (e as { code: string }).code === "P2025"
  );
}

function isUniqueConstraintError(e: unknown): boolean {
  return (
    e !== null &&
    typeof e === "object" &&
    "code" in e &&
    (e as { code: string }).code === "P2002"
  );
}

// --- Device Tokens ---

export async function registerDeviceToken(
  userId: string,
  input: {
    token: string;
    platform: string;
    name?: string;
  },
): Promise<DeviceToken> {
  const prisma = getPrisma();
  const encrypted = encryptDeviceTokenForCreate(input);
  const row = await prisma.deviceToken.upsert({
    where: { token: encrypted.token },
    create: { ...encrypted, userId },
    update: {
      platform: encrypted.platform,
      name: encrypted.name,
      userId,
    },
  });
  return decryptDeviceToken(row);
}

export async function listDeviceTokens(userId: string): Promise<DeviceToken[]> {
  const prisma = getPrisma();
  const rows = await prisma.deviceToken.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(decryptDeviceToken);
}

export async function deleteDeviceToken(userId: string, id: string): Promise<boolean> {
  const prisma = getPrisma();
  try {
    // Verify ownership before deleting
    const token = await prisma.deviceToken.findUnique({ where: { id } });
    if (!token || token.userId !== userId) return false;
    await prisma.deviceToken.delete({ where: { id } });
    return true;
  } catch (e: unknown) {
    if (isNotFoundError(e)) return false;
    throw e;
  }
}

export async function removeDeviceTokenByEncryptedToken(
  userId: string,
  encryptedToken: string,
): Promise<void> {
  const prisma = getPrisma();
  try {
    // Scope deletion to this user's token
    const token = await prisma.deviceToken.findUnique({ where: { token: encryptedToken } });
    if (!token || token.userId !== userId) return;
    await prisma.deviceToken.delete({ where: { token: encryptedToken } });
  } catch (e: unknown) {
    if (isNotFoundError(e)) return;
    throw e;
  }
}

/** Get all raw encrypted tokens for FCM sending (scoped to a specific user) */
export async function getAllEncryptedTokens(
  userId: string,
): Promise<Array<{ id: string; token: string }>> {
  const prisma = getPrisma();
  const rows = await prisma.deviceToken.findMany({
    where: { userId },
    select: { id: true, token: true },
  });
  return rows;
}

// --- Notification Preferences ---

/**
 * Seeds default preferences for all notification types if none exist for the user.
 * Called on first GET to ensure the user always sees all types.
 */
export async function seedDefaultPreferences(userId: string): Promise<void> {
  const prisma = getPrisma();
  const existing = await prisma.notificationPreference.count({
    where: { userId },
  });
  if (existing > 0) return;

  const allTypes = Object.values(NotificationType);
  for (const type of allTypes) {
    const encrypted = encryptNotificationPreferenceForCreate({
      type,
      enabled: true,
      config: null,
    });
    try {
      await prisma.notificationPreference.create({
        data: { ...encrypted, userId },
      });
    } catch (e: unknown) {
      if (isUniqueConstraintError(e)) continue;
      throw e;
    }
  }
}

export async function listNotificationPreferences(
  userId: string,
): Promise<NotificationPreference[]> {
  await seedDefaultPreferences(userId);
  const prisma = getPrisma();
  const rows = await prisma.notificationPreference.findMany({
    where: { userId },
  });
  return rows.map(decryptNotificationPreference);
}

export async function getNotificationPreference(
  userId: string,
  type: string,
): Promise<NotificationPreference | null> {
  const prisma = getPrisma();
  const row = await prisma.notificationPreference.findUnique({
    where: { userId_type: { userId, type } },
  });
  if (!row) return null;
  return decryptNotificationPreference(row);
}

export async function updateNotificationPreference(
  userId: string,
  type: string,
  input: { enabled?: boolean; config?: NotificationConfig | null },
): Promise<NotificationPreference | null> {
  const prisma = getPrisma();
  const encrypted = encryptNotificationPreferenceForUpdate(input);
  try {
    const row = await prisma.notificationPreference.update({
      where: { userId_type: { userId, type } },
      data: encrypted,
    });
    return decryptNotificationPreference(row);
  } catch (e: unknown) {
    if (isNotFoundError(e)) return null;
    throw e;
  }
}

// --- Notification Log ---

export async function createNotificationLog(
  userId: string,
  input: {
    type: string;
    title: string;
    body: string;
    dedupeKey: string;
    metadata?: Record<string, unknown> | null;
  },
): Promise<NotificationLogEntry | null> {
  const prisma = getPrisma();
  const encrypted = encryptNotificationLogForCreate(input);
  try {
    const row = await prisma.notificationLog.create({
      data: { ...encrypted, userId },
    });
    return decryptNotificationLog(row);
  } catch (e: unknown) {
    // Duplicate dedupe key — already sent, benign during rolling deploys
    if (isUniqueConstraintError(e)) return null;
    throw e;
  }
}

export async function updateNotificationLogFcmId(
  id: string,
  fcmMessageId: string,
): Promise<void> {
  const prisma = getPrisma();
  try {
    await prisma.notificationLog.update({
      where: { id },
      data: { fcmMessageId },
    });
  } catch {
    // Best-effort update
  }
}

export async function listNotificationLogs(
  userId: string,
  limit = 20,
  offset = 0,
): Promise<{ notifications: NotificationLogEntry[]; total: number }> {
  const prisma = getPrisma();
  const where = { userId, isCleared: false };
  const [rows, total] = await Promise.all([
    prisma.notificationLog.findMany({
      where,
      orderBy: { sentAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.notificationLog.count({ where }),
  ]);
  return {
    notifications: rows.map(decryptNotificationLog),
    total,
  };
}

export async function getUnreadCount(userId: string): Promise<number> {
  const prisma = getPrisma();
  return prisma.notificationLog.count({ where: { userId, isRead: false, isCleared: false } });
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const prisma = getPrisma();
  const result = await prisma.notificationLog.updateMany({
    where: { userId, isRead: false, isCleared: false },
    data: { isRead: true },
  });
  return result.count;
}

export async function clearNotificationHistory(userId: string): Promise<number> {
  const prisma = getPrisma();
  const result = await prisma.notificationLog.updateMany({
    where: { userId, isCleared: false },
    data: { isCleared: true },
  });
  return result.count;
}

export async function checkDedupeKeyExists(dedupeKey: string): Promise<boolean> {
  const prisma = getPrisma();
  const row = await prisma.notificationLog.findUnique({
    where: { dedupeKey },
    select: { id: true },
  });
  return row !== null;
}

/** Batch check: returns the set of dedupeKeys that already exist in the log */
export async function checkDedupeKeysExist(dedupeKeys: string[]): Promise<Set<string>> {
  if (dedupeKeys.length === 0) return new Set();
  const prisma = getPrisma();
  const rows = await prisma.notificationLog.findMany({
    where: { dedupeKey: { in: dedupeKeys } },
    select: { dedupeKey: true },
  });
  return new Set(rows.map((r) => r.dedupeKey));
}

/** Delete notification logs older than the given number of days */
export async function cleanupOldNotificationLogs(retentionDays = 90): Promise<number> {
  const prisma = getPrisma();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const result = await prisma.notificationLog.deleteMany({
    where: { sentAt: { lt: cutoff } },
  });
  return result.count;
}
