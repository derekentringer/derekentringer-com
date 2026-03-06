import { getPrisma } from "../lib/prisma.js";

export async function getSetting(key: string): Promise<string | null> {
  const prisma = getPrisma();
  const row = await prisma.setting.findUnique({ where: { id: key } });
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.setting.upsert({
    where: { id: key },
    update: { value },
    create: { id: key, value },
  });
}

export async function isEmbeddingEnabled(): Promise<boolean> {
  const value = await getSetting("embeddingEnabled");
  return value === "true";
}

export async function setEmbeddingEnabled(enabled: boolean): Promise<void> {
  await setSetting("embeddingEnabled", String(enabled));
}

const DEFAULT_TRASH_RETENTION_DAYS = 30;

export async function getTrashRetentionDays(): Promise<number> {
  const value = await getSetting("trashRetentionDays");
  if (value === null) return DEFAULT_TRASH_RETENTION_DAYS;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? DEFAULT_TRASH_RETENTION_DAYS : parsed;
}

export async function setTrashRetentionDays(days: number): Promise<void> {
  await setSetting("trashRetentionDays", String(days));
}

const DEFAULT_VERSION_INTERVAL_MINUTES = 15;

export async function getVersionIntervalMinutes(): Promise<number> {
  const value = await getSetting("versionIntervalMinutes");
  if (value === null) return DEFAULT_VERSION_INTERVAL_MINUTES;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? DEFAULT_VERSION_INTERVAL_MINUTES : parsed;
}

export async function setVersionIntervalMinutes(minutes: number): Promise<void> {
  await setSetting("versionIntervalMinutes", String(minutes));
}
