import type { Note as PrismaNote, NoteVersion as PrismaNoteVersion } from "../generated/prisma/client.js";
import type { Note, NoteSearchResult, NoteVersion } from "@derekentringer/shared/ns";
import type { User } from "@derekentringer/shared";

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
    favorite: row.favorite,
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

export function toNoteVersion(row: PrismaNoteVersion): NoteVersion {
  return {
    id: row.id,
    noteId: row.noteId,
    title: row.title,
    content: row.content,
    origin: "web",
    createdAt: row.createdAt.toISOString(),
  };
}

export function toUserResponse(row: {
  id: string;
  email: string;
  displayName?: string | null;
  role: string;
  totpEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName ?? null,
    role: row.role as "admin" | "user",
    totpEnabled: row.totpEnabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
