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

export async function registerDeviceToken(input: {
  token: string;
  platform: string;
  name?: string;
}): Promise<DeviceToken> {
  const prisma = getPrisma();
  const encrypted = encryptDeviceTokenForCreate(input);
  const row = await prisma.deviceToken.upsert({
    where: { token: encrypted.token },
    create: encrypted,
    update: {
      platform: encrypted.platform,
      name: encrypted.name,
    },
  });
  return decryptDeviceToken(row);
}

export async function listDeviceTokens(): Promise<DeviceToken[]> {
  const prisma = getPrisma();
  const rows = await prisma.deviceToken.findMany({
    orderBy: { createdAt: "desc" },
  });
  return rows.map(decryptDeviceToken);
}

export async function deleteDeviceToken(id: string): Promise<boolean> {
  const prisma = getPrisma();
  try {
    await prisma.deviceToken.delete({ where: { id } });
    return true;
  } catch (e: unknown) {
    if (isNotFoundError(e)) return false;
    throw e;
  }
}

export async function removeDeviceTokenByEncryptedToken(encryptedToken: string): Promise<void> {
  const prisma = getPrisma();
  try {
    await prisma.deviceToken.delete({ where: { token: encryptedToken } });
  } catch (e: unknown) {
    if (isNotFoundError(e)) return;
    throw e;
  }
}

/** Get all raw encrypted tokens for FCM sending */
export async function getAllEncryptedTokens(): Promise<Array<{ id: string; token: string }>> {
  const prisma = getPrisma();
  const rows = await prisma.deviceToken.findMany({
    select: { id: true, token: true },
  });
  return rows;
}

// --- Notification Preferences ---

/**
 * Seeds default preferences for all notification types if none exist.
 * Called on first GET to ensure the user always sees all types.
 */
export async function seedDefaultPreferences(): Promise<void> {
  const prisma = getPrisma();
  const existing = await prisma.notificationPreference.count();
  if (existing > 0) return;

  const allTypes = Object.values(NotificationType);
  for (const type of allTypes) {
    const encrypted = encryptNotificationPreferenceForCreate({
      type,
      enabled: true,
      config: null,
    });
    try {
      await prisma.notificationPreference.create({ data: encrypted });
    } catch (e: unknown) {
      if (isUniqueConstraintError(e)) continue;
      throw e;
    }
  }
}

export async function listNotificationPreferences(): Promise<NotificationPreference[]> {
  await seedDefaultPreferences();
  const prisma = getPrisma();
  const rows = await prisma.notificationPreference.findMany();
  return rows.map(decryptNotificationPreference);
}

export async function getNotificationPreference(
  type: string,
): Promise<NotificationPreference | null> {
  const prisma = getPrisma();
  const row = await prisma.notificationPreference.findUnique({
    where: { type },
  });
  if (!row) return null;
  return decryptNotificationPreference(row);
}

export async function updateNotificationPreference(
  type: string,
  input: { enabled?: boolean; config?: NotificationConfig | null },
): Promise<NotificationPreference | null> {
  const prisma = getPrisma();
  const encrypted = encryptNotificationPreferenceForUpdate(input);
  try {
    const row = await prisma.notificationPreference.update({
      where: { type },
      data: encrypted,
    });
    return decryptNotificationPreference(row);
  } catch (e: unknown) {
    if (isNotFoundError(e)) return null;
    throw e;
  }
}

// --- Notification Log ---

export async function createNotificationLog(input: {
  type: string;
  title: string;
  body: string;
  dedupeKey: string;
  metadata?: Record<string, unknown> | null;
}): Promise<NotificationLogEntry | null> {
  const prisma = getPrisma();
  const encrypted = encryptNotificationLogForCreate(input);
  try {
    const row = await prisma.notificationLog.create({ data: encrypted });
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
  limit = 20,
  offset = 0,
): Promise<{ notifications: NotificationLogEntry[]; total: number }> {
  const prisma = getPrisma();
  const where = { isCleared: false };
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

export async function getUnreadCount(): Promise<number> {
  const prisma = getPrisma();
  return prisma.notificationLog.count({ where: { isRead: false, isCleared: false } });
}

export async function markAllNotificationsRead(): Promise<number> {
  const prisma = getPrisma();
  const result = await prisma.notificationLog.updateMany({
    where: { isRead: false, isCleared: false },
    data: { isRead: true },
  });
  return result.count;
}

export async function clearNotificationHistory(): Promise<number> {
  const prisma = getPrisma();
  const result = await prisma.notificationLog.updateMany({
    where: { isCleared: false },
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
