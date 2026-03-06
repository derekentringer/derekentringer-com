import { getPrisma } from "../lib/prisma.js";
import { getVersionIntervalMinutes } from "./settingStore.js";

const MAX_VERSIONS_PER_NOTE = 50;

export async function captureVersion(
  noteId: string,
  title: string,
  content: string,
): Promise<void> {
  const prisma = getPrisma();
  const intervalMinutes = await getVersionIntervalMinutes();
  const cooldownMs = intervalMinutes * 60 * 1000;

  // Check if last version is within cooldown (skip check if interval is 0)
  if (cooldownMs > 0) {
    const latest = await prisma.noteVersion.findFirst({
      where: { noteId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    if (latest) {
      const elapsed = Date.now() - latest.createdAt.getTime();
      if (elapsed < cooldownMs) return;
    }
  }

  // Create new version
  await prisma.noteVersion.create({
    data: { noteId, title, content },
  });

  // Enforce cap — delete oldest versions beyond limit
  const count = await prisma.noteVersion.count({ where: { noteId } });
  if (count > MAX_VERSIONS_PER_NOTE) {
    const toDelete = await prisma.noteVersion.findMany({
      where: { noteId },
      orderBy: { createdAt: "asc" },
      take: count - MAX_VERSIONS_PER_NOTE,
      select: { id: true },
    });
    await prisma.noteVersion.deleteMany({
      where: { id: { in: toDelete.map((v) => v.id) } },
    });
  }
}

export async function listVersions(
  noteId: string,
  opts?: { page?: number; pageSize?: number },
): Promise<{ versions: { id: string; noteId: string; title: string; content: string; createdAt: Date }[]; total: number }> {
  const prisma = getPrisma();
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 50;
  const skip = (page - 1) * pageSize;

  const [versions, total] = await Promise.all([
    prisma.noteVersion.findMany({
      where: { noteId },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.noteVersion.count({ where: { noteId } }),
  ]);

  return { versions, total };
}

export async function getVersion(
  versionId: string,
): Promise<{ id: string; noteId: string; title: string; content: string; createdAt: Date } | null> {
  const prisma = getPrisma();
  return prisma.noteVersion.findUnique({ where: { id: versionId } });
}
