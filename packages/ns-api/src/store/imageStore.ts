import { getPrisma } from "../lib/prisma.js";
import type { Image as PrismaImage } from "../generated/prisma/client.js";

export async function createImage(
  userId: string,
  noteId: string,
  data: {
    id: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    r2Key: string;
    r2Url: string;
    altText?: string;
  },
): Promise<PrismaImage> {
  const prisma = getPrisma();
  return prisma.image.create({
    data: {
      id: data.id,
      userId,
      noteId,
      filename: data.filename,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      r2Key: data.r2Key,
      r2Url: data.r2Url,
      altText: data.altText ?? "",
    },
  });
}

export async function getImage(
  userId: string,
  imageId: string,
): Promise<PrismaImage | null> {
  const prisma = getPrisma();
  return prisma.image.findFirst({
    where: { id: imageId, userId, deletedAt: null },
  });
}

export async function getImagesByNoteId(
  userId: string,
  noteId: string,
): Promise<PrismaImage[]> {
  const prisma = getPrisma();
  return prisma.image.findMany({
    where: { userId, noteId, deletedAt: null },
    orderBy: { sortOrder: "asc" },
  });
}

export async function getImagesByNoteIds(
  userId: string,
  noteIds: string[],
): Promise<PrismaImage[]> {
  if (noteIds.length === 0) return [];
  const prisma = getPrisma();
  return prisma.image.findMany({
    where: { userId, noteId: { in: noteIds }, deletedAt: null },
    orderBy: { sortOrder: "asc" },
  });
}

export async function updateImageAiDescription(
  imageId: string,
  aiDescription: string,
): Promise<void> {
  const prisma = getPrisma();
  await prisma.image.update({
    where: { id: imageId },
    data: { aiDescription },
  });
}

export async function softDeleteImage(
  userId: string,
  imageId: string,
): Promise<boolean> {
  const prisma = getPrisma();
  const image = await prisma.image.findFirst({
    where: { id: imageId, userId, deletedAt: null },
  });
  if (!image) return false;
  await prisma.image.update({
    where: { id: imageId },
    data: { deletedAt: new Date() },
  });
  return true;
}

export async function getImagesChangedSince(
  userId: string,
  since: Date,
): Promise<PrismaImage[]> {
  const prisma = getPrisma();
  return prisma.image.findMany({
    where: { userId, updatedAt: { gt: since } },
    orderBy: { updatedAt: "asc" },
  });
}

export async function getR2KeysForNoteIds(
  noteIds: string[],
): Promise<string[]> {
  if (noteIds.length === 0) return [];
  const prisma = getPrisma();
  const images = await prisma.image.findMany({
    where: { noteId: { in: noteIds } },
    select: { r2Key: true },
  });
  return images.map((i) => i.r2Key);
}

export async function getImageDescriptionsForNoteId(
  noteId: string,
): Promise<string[]> {
  const prisma = getPrisma();
  const images = await prisma.image.findMany({
    where: { noteId, deletedAt: null, aiDescription: { not: null } },
    select: { aiDescription: true },
    orderBy: { sortOrder: "asc" },
  });
  return images
    .map((i) => i.aiDescription)
    .filter((d): d is string => !!d);
}
