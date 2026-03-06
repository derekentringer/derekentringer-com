import { getPrisma } from "../lib/prisma.js";

/**
 * Extract wiki-link targets from markdown content.
 * Matches [[title]] syntax, returns deduplicated trimmed titles.
 */
export function extractWikiLinks(content: string): string[] {
  const regex = /\[\[([^\[\]]+?)\]\]/g;
  const seen = new Map<string, string>(); // lowercase → original
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const raw = match[1].trim();
    if (raw.length > 0) {
      const key = raw.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, raw);
      }
    }
  }
  return [...seen.values()];
}

/**
 * Resolve wiki-link texts to note IDs by case-insensitive title match.
 * Only matches non-deleted notes belonging to the given user.
 */
export async function resolveWikiLinks(
  userId: string,
  linkTexts: string[],
): Promise<Map<string, string>> {
  if (linkTexts.length === 0) return new Map();

  const prisma = getPrisma();
  const lowerTexts = linkTexts.map((t) => t.toLowerCase());

  const rows = await prisma.$queryRawUnsafe<{ id: string; title: string }[]>(
    `SELECT "id", "title" FROM "notes"
     WHERE LOWER("title") = ANY($1)
       AND "userId" = $2
       AND "deletedAt" IS NULL`,
    lowerTexts,
    userId,
  );

  // Map lowercase title → note ID
  const result = new Map<string, string>();
  for (const row of rows) {
    result.set(row.title.toLowerCase(), row.id);
  }
  return result;
}

/**
 * Sync outgoing wiki-links for a note.
 * Deletes existing outgoing links and creates new ones.
 */
export async function syncNoteLinks(
  userId: string,
  sourceNoteId: string,
  content: string,
): Promise<void> {
  const prisma = getPrisma();

  // Delete existing outgoing links
  await prisma.noteLink.deleteMany({
    where: { sourceNoteId },
  });

  const linkTexts = extractWikiLinks(content);
  if (linkTexts.length === 0) return;

  const resolved = await resolveWikiLinks(userId, linkTexts);
  if (resolved.size === 0) return;

  const data: { sourceNoteId: string; targetNoteId: string; linkText: string }[] = [];
  for (const text of linkTexts) {
    const targetId = resolved.get(text.toLowerCase());
    if (targetId && targetId !== sourceNoteId) {
      data.push({ sourceNoteId, targetNoteId: targetId, linkText: text });
    }
  }

  if (data.length > 0) {
    await prisma.noteLink.createMany({ data });
  }
}

/**
 * Get all backlinks (incoming links) for a note.
 * Filters out links from deleted source notes and notes not belonging to the user.
 */
export async function getBacklinks(
  userId: string,
  noteId: string,
): Promise<{ noteId: string; noteTitle: string; linkText: string }[]> {
  const prisma = getPrisma();

  const links = await prisma.noteLink.findMany({
    where: { targetNoteId: noteId },
    include: { sourceNote: { select: { id: true, title: true, userId: true, deletedAt: true } } },
  });

  return links
    .filter((link) => !link.sourceNote.deletedAt && link.sourceNote.userId === userId)
    .map((link) => ({
      noteId: link.sourceNote.id,
      noteTitle: link.sourceNote.title,
      linkText: link.linkText,
    }));
}

/**
 * List all note titles (non-deleted) for autocomplete, scoped to user.
 */
export async function listNoteTitles(userId: string): Promise<{ id: string; title: string }[]> {
  const prisma = getPrisma();

  return prisma.note.findMany({
    where: { userId, deletedAt: null },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });
}
