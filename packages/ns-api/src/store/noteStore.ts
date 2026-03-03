import { getPrisma } from "../lib/prisma.js";
import type { CreateNoteRequest, UpdateNoteRequest, NoteSortField, SortOrder } from "@derekentringer/shared/ns";
import type { Note as PrismaNote } from "../generated/prisma/client.js";

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2025"
  );
}

export async function createNote(
  data: CreateNoteRequest,
): Promise<PrismaNote> {
  const prisma = getPrisma();
  return prisma.note.create({
    data: {
      title: data.title,
      content: data.content ?? "",
      folder: data.folder ?? null,
      tags: data.tags ?? [],
    },
  });
}

export async function getNote(id: string): Promise<PrismaNote | null> {
  const prisma = getPrisma();
  const note = await prisma.note.findUnique({ where: { id } });
  if (!note || note.deletedAt) return null;
  return note;
}

export interface ListNotesFilter {
  folder?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: NoteSortField;
  sortOrder?: SortOrder;
}

export async function listNotes(
  filter?: ListNotesFilter,
): Promise<{ notes: PrismaNote[]; total: number }> {
  const prisma = getPrisma();
  const page = filter?.page ?? 1;
  const pageSize = filter?.pageSize ?? 50;
  const skip = (page - 1) * pageSize;
  const sortBy = filter?.sortBy ?? "updatedAt";
  const sortOrder = filter?.sortOrder ?? "desc";

  const where: Record<string, unknown> = { deletedAt: null };

  if (filter?.folder) {
    where.folder = filter.folder;
  }

  if (filter?.search) {
    where.OR = [
      { title: { contains: filter.search, mode: "insensitive" } },
      { content: { contains: filter.search, mode: "insensitive" } },
    ];
  }

  const [notes, total] = await Promise.all([
    prisma.note.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      skip,
      take: pageSize,
    }),
    prisma.note.count({ where }),
  ]);

  return { notes, total };
}

export interface ListTrashedFilter {
  page?: number;
  pageSize?: number;
}

export async function listTrashedNotes(
  filter?: ListTrashedFilter,
): Promise<{ notes: PrismaNote[]; total: number }> {
  const prisma = getPrisma();
  const page = filter?.page ?? 1;
  const pageSize = filter?.pageSize ?? 50;
  const skip = (page - 1) * pageSize;

  const where = { deletedAt: { not: null } };

  const [notes, total] = await Promise.all([
    prisma.note.findMany({
      where,
      orderBy: { deletedAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.note.count({ where }),
  ]);

  return { notes, total };
}

export async function updateNote(
  id: string,
  data: UpdateNoteRequest,
): Promise<PrismaNote | null> {
  const prisma = getPrisma();
  try {
    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.content !== undefined) updateData.content = data.content;
    if (data.folder !== undefined) updateData.folder = data.folder;
    if (data.tags !== undefined) updateData.tags = data.tags;

    return await prisma.note.update({
      where: { id, deletedAt: null },
      data: updateData,
    });
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export async function softDeleteNote(id: string): Promise<boolean> {
  const prisma = getPrisma();
  try {
    await prisma.note.update({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return true;
  } catch (error) {
    if (isNotFoundError(error)) return false;
    throw error;
  }
}

export async function restoreNote(id: string): Promise<PrismaNote | null> {
  const prisma = getPrisma();
  try {
    return await prisma.note.update({
      where: { id },
      data: { deletedAt: null },
    });
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export async function permanentDeleteNote(id: string): Promise<boolean> {
  const prisma = getPrisma();
  try {
    await prisma.note.delete({
      where: { id },
    });
    return true;
  } catch (error) {
    if (isNotFoundError(error)) return false;
    throw error;
  }
}

export async function purgeOldTrash(days = 30): Promise<number> {
  const prisma = getPrisma();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const result = await prisma.note.deleteMany({
    where: {
      deletedAt: { lt: cutoff },
    },
  });

  return result.count;
}
