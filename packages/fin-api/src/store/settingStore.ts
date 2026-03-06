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

export async function isAiEnabled(): Promise<boolean> {
  const value = await getSetting("aiEnabled");
  // Default to true if not set
  return value !== "false";
}

export async function setAiEnabled(enabled: boolean): Promise<void> {
  await setSetting("aiEnabled", String(enabled));
}
