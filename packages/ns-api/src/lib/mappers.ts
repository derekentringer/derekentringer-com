import type { Note as PrismaNote } from "../generated/prisma/client.js";
import type { Note, NoteSearchResult } from "@derekentringer/shared/ns";

export function toNote(row: PrismaNote): Note {
  let tags: string[] = [];
  if (Array.isArray(row.tags)) {
    tags = row.tags.filter((t): t is string => typeof t === "string");
  }

  return {
    id: row.id,
    title: row.title,
    content: row.content,
    folder: row.folder,
    folderId: row.folderId,
    folderPath: null,
    tags,
    summary: row.summary,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  };
}

export function toNoteSearchResult(
  row: PrismaNote & { headline?: string },
): NoteSearchResult {
  return {
    ...toNote(row),
    headline: row.headline ?? undefined,
  };
}
