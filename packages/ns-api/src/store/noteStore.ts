import { getPrisma } from "../lib/prisma.js";
import type {
  CreateNoteRequest,
  UpdateNoteRequest,
  NoteSortField,
  SortOrder,
  FolderInfo,
  TagInfo,
} from "@derekentringer/shared/ns";
import type { Note as PrismaNote } from "../generated/prisma/client.js";
import { generateQueryEmbedding } from "../services/embeddingService.js";

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

  const maxResult = await prisma.note.aggregate({
    _max: { sortOrder: true },
    where: { deletedAt: null },
  });
  const nextSortOrder = (maxResult._max.sortOrder ?? -1) + 1;

  // Ensure folder exists in folders table
  if (data.folder) {
    await prisma.folder.upsert({
      where: { name: data.folder },
      update: {},
      create: { name: data.folder },
    });
  }

  return prisma.note.create({
    data: {
      title: data.title,
      content: data.content ?? "",
      folder: data.folder ?? null,
      tags: data.tags ?? [],
      sortOrder: nextSortOrder,
    },
  });
}

export async function getNote(id: string): Promise<PrismaNote | null> {
  const prisma = getPrisma();
  const note = await prisma.note.findUnique({ where: { id } });
  if (!note || note.deletedAt) return null;
  return note;
}

export type SearchMode = "keyword" | "semantic" | "hybrid";

export interface ListNotesFilter {
  folder?: string;
  search?: string;
  searchMode?: SearchMode;
  tags?: string[];
  page?: number;
  pageSize?: number;
  sortBy?: NoteSortField;
  sortOrder?: SortOrder;
}

interface FtsRow extends PrismaNote {
  headline?: string;
}

export async function listNotes(
  filter?: ListNotesFilter,
): Promise<{ notes: FtsRow[]; total: number }> {
  const prisma = getPrisma();
  const page = filter?.page ?? 1;
  const pageSize = filter?.pageSize ?? 50;
  const skip = (page - 1) * pageSize;
  const sortBy = filter?.sortBy ?? "sortOrder";
  const sortOrder = filter?.sortOrder ?? "asc";

  // Use raw SQL for search
  if (filter?.search) {
    const mode = filter.searchMode ?? "keyword";

    if (mode === "semantic") {
      return semanticSearch(filter.search, filter, pageSize, skip);
    }
    if (mode === "hybrid") {
      return hybridSearch(filter.search, filter, pageSize, skip);
    }

    // Keyword search (default)
    return keywordSearch(filter.search, filter, pageSize, skip, sortBy, sortOrder);
  }

  // Standard Prisma query (no search)
  const where: Record<string, unknown> = { deletedAt: null };

  if (filter?.folder) {
    where.folder = filter.folder;
  }

  if (filter?.tags && filter.tags.length > 0) {
    where.tags = { array_contains: filter.tags };
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

function buildFilterClause(
  filter: ListNotesFilter,
  startIdx: number,
): { clause: string; params: unknown[]; nextIdx: number } {
  let clause = "";
  const params: unknown[] = [];
  let idx = startIdx;

  if (filter.folder) {
    clause += ` AND "folder" = $${idx}`;
    params.push(filter.folder);
    idx++;
  }

  if (filter.tags && filter.tags.length > 0) {
    clause += ` AND "tags" @> $${idx}::jsonb`;
    params.push(JSON.stringify(filter.tags));
    idx++;
  }

  return { clause, params, nextIdx: idx };
}

async function keywordSearch(
  search: string,
  filter: ListNotesFilter,
  pageSize: number,
  skip: number,
  sortBy: string,
  sortOrder: string,
): Promise<{ notes: FtsRow[]; total: number }> {
  const prisma = getPrisma();
  const params: unknown[] = [search];
  let paramIdx = 2;

  let whereClause = `"deletedAt" IS NULL AND "search_vector" @@ plainto_tsquery('english', $1)`;

  const extra = buildFilterClause(filter, paramIdx);
  whereClause += extra.clause;
  params.push(...extra.params);
  paramIdx = extra.nextIdx;

  const SORT_COL_MAP: Record<string, string> = {
    title: '"title"',
    createdAt: '"createdAt"',
    updatedAt: '"updatedAt"',
    sortOrder: '"sortOrder"',
  };
  const sortCol = SORT_COL_MAP[sortBy] ?? '"sortOrder"';
  const sortDir = sortOrder === "desc" ? "DESC" : "ASC";

  const countQuery = `SELECT COUNT(*)::int AS total FROM "notes" WHERE ${whereClause}`;
  const dataQuery = `
    SELECT "id", "title", "content", "folder", "tags", "summary", "sortOrder",
      "createdAt", "updatedAt", "deletedAt",
      ts_headline('english', "title" || ' ' || "content", plainto_tsquery('english', $1),
        'StartSel=<mark>, StopSel=</mark>, MaxWords=35, MinWords=15') AS headline
    FROM "notes"
    WHERE ${whereClause}
    ORDER BY ts_rank("search_vector", plainto_tsquery('english', $1)) DESC, ${sortCol} ${sortDir}
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
  `;
  params.push(pageSize, skip);

  const [countResult, notes] = await Promise.all([
    prisma.$queryRawUnsafe<[{ total: number }]>(countQuery, ...params.slice(0, -2)),
    prisma.$queryRawUnsafe<FtsRow[]>(dataQuery, ...params),
  ]);

  return {
    notes,
    total: countResult[0]?.total ?? 0,
  };
}

async function semanticSearch(
  search: string,
  filter: ListNotesFilter,
  pageSize: number,
  skip: number,
): Promise<{ notes: FtsRow[]; total: number }> {
  const prisma = getPrisma();
  const queryEmbedding = await generateQueryEmbedding(search);
  const vectorStr = `[${queryEmbedding.join(",")}]`;

  // Minimum cosine similarity threshold to filter low-quality matches
  const SIM_THRESHOLD = 0.3;

  // Minimum content length — notes with empty/near-empty content produce
  // unreliable embeddings that spuriously match many queries
  const MIN_CONTENT_LEN = 20;

  // Count query — no vector param needed, filter indices start at 1
  const baseWhere = `"deletedAt" IS NULL AND "embedding" IS NOT NULL AND LENGTH("content") >= ${MIN_CONTENT_LEN}`;
  const countFilter = buildFilterClause(filter, 1);
  const countQuery = `SELECT COUNT(*)::int AS total FROM "notes" WHERE ${baseWhere}${countFilter.clause}`;

  // Data query — $1 = vector, filter indices start at 2
  const dataFilter = buildFilterClause(filter, 2);
  let dataParamIdx = dataFilter.nextIdx;
  const dataQuery = `
    SELECT "id", "title", "content", "folder", "tags", "summary", "sortOrder",
      "createdAt", "updatedAt", "deletedAt"
    FROM "notes"
    WHERE ${baseWhere}${dataFilter.clause}
      AND (1 - ("embedding" <=> $1::vector)) > ${SIM_THRESHOLD}
    ORDER BY "embedding" <=> $1::vector ASC
    LIMIT $${dataParamIdx} OFFSET $${dataParamIdx + 1}
  `;

  const [countResult, notes] = await Promise.all([
    prisma.$queryRawUnsafe<[{ total: number }]>(countQuery, ...countFilter.params),
    prisma.$queryRawUnsafe<FtsRow[]>(dataQuery, vectorStr, ...dataFilter.params, pageSize, skip),
  ]);

  return {
    notes,
    total: countResult[0]?.total ?? 0,
  };
}

async function hybridSearch(
  search: string,
  filter: ListNotesFilter,
  pageSize: number,
  skip: number,
): Promise<{ notes: FtsRow[]; total: number }> {
  const prisma = getPrisma();
  const queryEmbedding = await generateQueryEmbedding(search);
  const vectorStr = `[${queryEmbedding.join(",")}]`;

  // Semantic similarity threshold — filters out notes with weak/irrelevant
  // embeddings. Higher than pure semantic (0.3) because hybrid includes the
  // keyword path as a fallback so we can be stricter on the semantic side.
  const HYBRID_SIM_THRESHOLD = 0.4;

  // Minimum content length for semantic signal — notes with empty/near-empty
  // content produce unreliable embeddings that spuriously match many queries.
  // Keyword matching still works for sparse notes via the first OR branch.
  const MIN_CONTENT_LEN = 20;

  // Require keyword match OR meaningful semantic similarity from substantial content
  const baseWhere = `"deletedAt" IS NULL AND ("search_vector" @@ plainto_tsquery('english', $1) OR ("embedding" IS NOT NULL AND LENGTH("content") >= ${MIN_CONTENT_LEN} AND (1 - ("embedding" <=> $2::vector)) > ${HYBRID_SIM_THRESHOLD}))`;

  // Count query — $1 = search text, $2 = vector, filter indices start at 3
  const countFilter = buildFilterClause(filter, 3);
  const countQuery = `SELECT COUNT(*)::int AS total FROM "notes" WHERE ${baseWhere}${countFilter.clause}`;

  // Data query — $1 = search text, $2 = vector, filter indices start at 3
  // Scoring: ts_rank values are tiny (0.01–0.1) so raw keyword weight is
  // negligible vs semantic similarity (0–1). A flat 0.3 bonus for keyword
  // matches ensures notes containing the search term always outrank
  // semantic-only matches of similar quality.
  const dataFilter = buildFilterClause(filter, 3);
  let dataParamIdx = dataFilter.nextIdx;
  const dataQuery = `
    SELECT "id", "title", "content", "folder", "tags", "summary", "sortOrder",
      "createdAt", "updatedAt", "deletedAt",
      ts_headline('english', "title" || ' ' || "content", plainto_tsquery('english', $1),
        'StartSel=<mark>, StopSel=</mark>, MaxWords=35, MinWords=15') AS headline,
      (
        0.3 * COALESCE(ts_rank("search_vector", plainto_tsquery('english', $1)), 0) +
        0.7 * COALESCE(1 - ("embedding" <=> $2::vector), 0) +
        CASE WHEN "search_vector" @@ plainto_tsquery('english', $1) THEN 0.3 ELSE 0 END
      ) AS hybrid_score
    FROM "notes"
    WHERE ${baseWhere}${dataFilter.clause}
    ORDER BY hybrid_score DESC
    LIMIT $${dataParamIdx} OFFSET $${dataParamIdx + 1}
  `;

  const [countResult, notes] = await Promise.all([
    prisma.$queryRawUnsafe<[{ total: number }]>(countQuery, search, vectorStr, ...countFilter.params),
    prisma.$queryRawUnsafe<FtsRow[]>(dataQuery, search, vectorStr, ...dataFilter.params, pageSize, skip),
  ]);

  return {
    notes,
    total: countResult[0]?.total ?? 0,
  };
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
    if (data.summary !== undefined) updateData.summary = data.summary;

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

export async function createFolder(name: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.folder.create({ data: { name } });
}

export async function listFolders(): Promise<FolderInfo[]> {
  const prisma = getPrisma();

  // Get all standalone folders
  const allFolders = await prisma.folder.findMany({
    orderBy: { name: "asc" },
  });

  // Get note counts grouped by folder
  const groups = await prisma.note.groupBy({
    by: ["folder"],
    where: { deletedAt: null, folder: { not: null } },
    _count: { id: true },
  });

  const countMap = new Map(
    groups.map((g) => [g.folder as string, g._count.id]),
  );

  // Merge: every folder from the folders table, with count from notes
  return allFolders.map((f) => ({
    name: f.name,
    count: countMap.get(f.name) ?? 0,
    createdAt: f.createdAt.toISOString(),
  }));
}

export async function reorderNotes(
  order: { id: string; sortOrder: number }[],
): Promise<void> {
  const prisma = getPrisma();
  await prisma.$transaction(
    order.map((item) =>
      prisma.note.update({
        where: { id: item.id },
        data: { sortOrder: item.sortOrder },
      }),
    ),
  );
}

export async function renameFolder(
  oldName: string,
  newName: string,
): Promise<number> {
  const prisma = getPrisma();
  const result = await prisma.note.updateMany({
    where: { folder: oldName, deletedAt: null },
    data: { folder: newName },
  });
  // Rename in folders table (upsert to handle edge cases)
  await prisma.folder.upsert({
    where: { name: oldName },
    update: { name: newName },
    create: { name: newName },
  });
  return result.count;
}

export async function deleteFolder(name: string): Promise<number> {
  const prisma = getPrisma();
  const result = await prisma.note.updateMany({
    where: { folder: name, deletedAt: null },
    data: { folder: null },
  });
  // Remove from folders table
  await prisma.folder.deleteMany({ where: { name } });
  return result.count;
}

export async function listTags(): Promise<TagInfo[]> {
  const prisma = getPrisma();
  const result = await prisma.$queryRawUnsafe<TagInfo[]>(`
    SELECT tag AS name, COUNT(*)::int AS count
    FROM "notes", jsonb_array_elements_text("tags") AS tag
    WHERE "deletedAt" IS NULL
    GROUP BY tag
    ORDER BY tag ASC
  `);
  return result;
}

export async function renameTag(
  oldName: string,
  newName: string,
): Promise<number> {
  const prisma = getPrisma();
  // Find notes that contain the old tag
  const notes = await prisma.note.findMany({
    where: { deletedAt: null },
    select: { id: true, tags: true },
  });

  const toUpdate = notes.filter((n) => {
    if (!Array.isArray(n.tags)) return false;
    return n.tags.includes(oldName);
  });

  if (toUpdate.length === 0) return 0;

  await prisma.$transaction(
    toUpdate.map((n) => {
      const tags = (n.tags as string[]).map((t) =>
        t === oldName ? newName : t,
      );
      // Deduplicate in case newName already exists
      const unique = [...new Set(tags)];
      return prisma.note.update({
        where: { id: n.id },
        data: { tags: unique },
      });
    }),
  );

  return toUpdate.length;
}

export async function removeTag(name: string): Promise<number> {
  const prisma = getPrisma();
  const notes = await prisma.note.findMany({
    where: { deletedAt: null },
    select: { id: true, tags: true },
  });

  const toUpdate = notes.filter((n) => {
    if (!Array.isArray(n.tags)) return false;
    return n.tags.includes(name);
  });

  if (toUpdate.length === 0) return 0;

  await prisma.$transaction(
    toUpdate.map((n) => {
      const tags = (n.tags as string[]).filter((t) => t !== name);
      return prisma.note.update({
        where: { id: n.id },
        data: { tags },
      });
    }),
  );

  return toUpdate.length;
}
