import { getPrisma } from "../lib/prisma.js";
import type {
  CreateNoteRequest,
  UpdateNoteRequest,
  NoteSortField,
  SortOrder,
  FolderInfo,
  TagInfo,
} from "@derekentringer/shared/ns";
import type { Note as PrismaNote, Folder as PrismaFolder } from "../generated/prisma/client.js";
import { generateQueryEmbedding } from "../services/embeddingService.js";
import { syncNoteLinks } from "./linkStore.js";
import { captureVersion } from "./versionStore.js";

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2025"
  );
}

export async function createNote(
  userId: string,
  data: CreateNoteRequest,
): Promise<PrismaNote> {
  const prisma = getPrisma();

  const maxResult = await prisma.note.aggregate({
    _max: { sortOrder: true },
    where: { userId, deletedAt: null },
  });
  const nextSortOrder = (maxResult._max.sortOrder ?? -1) + 1;

  // Ensure folder exists in folders table (legacy name-based path)
  if (data.folder && !data.folderId) {
    const existing = await prisma.folder.findFirst({
      where: { userId, parentId: null, name: data.folder },
    });
    if (!existing) {
      await prisma.folder.create({ data: { userId, name: data.folder } });
    }
  }

  const created = await prisma.note.create({
    data: {
      userId,
      title: data.title,
      content: data.content ?? "",
      folder: data.folder ?? null,
      folderId: data.folderId ?? null,
      tags: data.tags ?? [],
      sortOrder: nextSortOrder,
      audioMode: data.audioMode ?? null,
    },
  });

  if (created.content) {
    syncNoteLinks(userId, created.id, created.content).catch((err) => {
      console.error("Failed to sync note links:", err);
    });
  }

  captureVersion(created.id, created.title, created.content).catch((err) => {
    console.error("Failed to capture version:", err);
  });

  return created;
}

export async function getNote(userId: string, id: string): Promise<PrismaNote | null> {
  const prisma = getPrisma();
  const note = await prisma.note.findUnique({ where: { id } });
  if (!note || note.deletedAt || note.userId !== userId) return null;
  return note;
}

export type SearchMode = "keyword" | "semantic" | "hybrid";

export interface ListNotesFilter {
  folder?: string;
  folderId?: string;
  folderIds?: string[];
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

// Explicit column list for raw SQL queries (avoids issues with unsupported types like vector)
const NOTE_COLUMNS = `"id", "userId", "title", "content", "folder", "folderId", "tags", "summary", "favorite", "sortOrder", "favoriteSortOrder", "isLocalFile", "audioMode", "createdAt", "updatedAt", "deletedAt"`;

export async function listNotes(
  userId: string,
  filter?: ListNotesFilter,
): Promise<{ notes: FtsRow[]; total: number }> {
  const prisma = getPrisma();
  const page = filter?.page ?? 1;
  const pageSize = filter?.pageSize ?? 50;
  const skip = (page - 1) * pageSize;
  const sortBy = filter?.sortBy ?? "updatedAt";
  const sortOrder = filter?.sortOrder ?? "desc";

  // Resolve folder + all descendant folders so clicking a parent shows nested notes
  if (filter?.folderId && !filter.folderIds) {
    filter = { ...filter, folderIds: await getSelfAndDescendantIds(filter.folderId) };
  }

  // Use raw SQL for search
  if (filter?.search) {
    const mode = filter.searchMode ?? "keyword";

    if (mode === "semantic") {
      return semanticSearch(userId, filter.search, filter, pageSize, skip);
    }
    if (mode === "hybrid") {
      return hybridSearch(userId, filter.search, filter, pageSize, skip);
    }

    // Keyword search (default)
    return keywordSearch(userId, filter.search, filter, pageSize, skip, sortBy, sortOrder);
  }

  // Standard Prisma query (no search)
  const where: Record<string, unknown> = { userId, deletedAt: null };

  if (filter?.folderIds && filter.folderIds.length > 0) {
    where.folderId = { in: filter.folderIds };
  } else if (filter?.folder) {
    where.folder = filter.folder;
  }

  if (filter?.tags && filter.tags.length > 0) {
    where.tags = { array_contains: filter.tags };
  }

  // Case-insensitive title sort requires raw SQL
  if (sortBy === "title") {
    const dir = sortOrder === "desc" ? "DESC" : "ASC";
    const params: unknown[] = [userId];
    let paramIdx = 2;
    let whereClause = `"userId" = $1 AND "deletedAt" IS NULL`;

    if (filter?.folderIds && filter.folderIds.length > 0) {
      whereClause += ` AND "folderId" = ANY($${paramIdx})`;
      params.push(filter.folderIds);
      paramIdx++;
    } else if (filter?.folder) {
      whereClause += ` AND "folder" = $${paramIdx}`;
      params.push(filter.folder);
      paramIdx++;
    }

    if (filter?.tags && filter.tags.length > 0) {
      whereClause += ` AND "tags" @> $${paramIdx}::jsonb`;
      params.push(JSON.stringify(filter.tags));
      paramIdx++;
    }

    const countQuery = `SELECT COUNT(*)::int AS total FROM "notes" WHERE ${whereClause}`;
    const dataQuery = `SELECT ${NOTE_COLUMNS} FROM "notes" WHERE ${whereClause} ORDER BY LOWER("title") ${dir} LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    params.push(pageSize, skip);

    const [countResult, notes] = await Promise.all([
      prisma.$queryRawUnsafe<[{ total: number }]>(countQuery, ...params.slice(0, -2)),
      prisma.$queryRawUnsafe<FtsRow[]>(dataQuery, ...params),
    ]);

    return { notes, total: countResult[0]?.total ?? 0 };
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

  if (filter.folderIds && filter.folderIds.length > 0) {
    clause += ` AND "folderId" = ANY($${idx})`;
    params.push(filter.folderIds);
    idx++;
  } else if (filter.folder) {
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
  userId: string,
  search: string,
  filter: ListNotesFilter,
  pageSize: number,
  skip: number,
  sortBy: string,
  sortOrder: string,
): Promise<{ notes: FtsRow[]; total: number }> {
  const prisma = getPrisma();
  const params: unknown[] = [search, userId];
  let paramIdx = 3;

  let whereClause = `"deletedAt" IS NULL AND "userId" = $2 AND "search_vector" @@ plainto_tsquery('english', $1)`;

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
    SELECT "id", "title", "content", "folder", "tags", "summary", "favorite", "sortOrder",
      "favoriteSortOrder", "folderId",
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
  userId: string,
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

  // Count query — $1 = userId, filter indices start at 2
  const baseWhere = `"deletedAt" IS NULL AND "userId" = $1 AND "embedding" IS NOT NULL AND LENGTH("content") >= ${MIN_CONTENT_LEN}`;
  const countFilter = buildFilterClause(filter, 2);
  const countQuery = `SELECT COUNT(*)::int AS total FROM "notes" WHERE ${baseWhere}${countFilter.clause}`;

  // Data query — $1 = userId, $2 = vector, filter indices start at 3
  const dataFilter = buildFilterClause(filter, 3);
  let dataParamIdx = dataFilter.nextIdx;
  const dataQuery = `
    SELECT "id", "title", "content", "folder", "tags", "summary", "favorite", "sortOrder",
      "favoriteSortOrder", "folderId",
      "createdAt", "updatedAt", "deletedAt"
    FROM "notes"
    WHERE ${baseWhere.replace("$1", "$1")}${dataFilter.clause.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + 1}`)}
      AND (1 - ("embedding" <=> $2::vector)) > ${SIM_THRESHOLD}
    ORDER BY "embedding" <=> $2::vector ASC
    LIMIT $${dataParamIdx + 1} OFFSET $${dataParamIdx + 2}
  `;

  const [countResult, notes] = await Promise.all([
    prisma.$queryRawUnsafe<[{ total: number }]>(countQuery, userId, ...countFilter.params),
    prisma.$queryRawUnsafe<FtsRow[]>(dataQuery, userId, vectorStr, ...dataFilter.params, pageSize, skip),
  ]);

  return {
    notes,
    total: countResult[0]?.total ?? 0,
  };
}

async function hybridSearch(
  userId: string,
  search: string,
  filter: ListNotesFilter,
  pageSize: number,
  skip: number,
): Promise<{ notes: FtsRow[]; total: number }> {
  const prisma = getPrisma();
  const queryEmbedding = await generateQueryEmbedding(search);
  const vectorStr = `[${queryEmbedding.join(",")}]`;

  const HYBRID_SIM_THRESHOLD = 0.4;
  const MIN_CONTENT_LEN = 20;

  // $1 = search text, $2 = vector, $3 = userId, filter indices start at 4
  const baseWhere = `"deletedAt" IS NULL AND "userId" = $3 AND ("search_vector" @@ plainto_tsquery('english', $1) OR ("embedding" IS NOT NULL AND LENGTH("content") >= ${MIN_CONTENT_LEN} AND (1 - ("embedding" <=> $2::vector)) > ${HYBRID_SIM_THRESHOLD}))`;

  const countFilter = buildFilterClause(filter, 4);
  const countQuery = `SELECT COUNT(*)::int AS total FROM "notes" WHERE ${baseWhere}${countFilter.clause}`;

  const dataFilter = buildFilterClause(filter, 4);
  let dataParamIdx = dataFilter.nextIdx;
  const dataQuery = `
    SELECT "id", "title", "content", "folder", "tags", "summary", "favorite", "sortOrder",
      "favoriteSortOrder", "folderId",
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
    prisma.$queryRawUnsafe<[{ total: number }]>(countQuery, search, vectorStr, userId, ...countFilter.params),
    prisma.$queryRawUnsafe<FtsRow[]>(dataQuery, search, vectorStr, userId, ...dataFilter.params, pageSize, skip),
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
  userId: string,
  filter?: ListTrashedFilter,
): Promise<{ notes: PrismaNote[]; total: number }> {
  const prisma = getPrisma();
  const page = filter?.page ?? 1;
  const pageSize = filter?.pageSize ?? 50;
  const skip = (page - 1) * pageSize;

  const where = { userId, deletedAt: { not: null } };

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
  userId: string,
  id: string,
  data: UpdateNoteRequest,
): Promise<PrismaNote | null> {
  const prisma = getPrisma();
  try {
    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.content !== undefined) updateData.content = data.content;
    if (data.folder !== undefined) updateData.folder = data.folder;
    if (data.folderId !== undefined) updateData.folderId = data.folderId;
    if (data.tags !== undefined) updateData.tags = data.tags;
    if (data.summary !== undefined) updateData.summary = data.summary;
    if (data.favorite !== undefined) {
      updateData.favorite = data.favorite;
      if (data.favorite) {
        // Auto-assign next favoriteSortOrder
        const maxResult = await prisma.note.aggregate({
          _max: { favoriteSortOrder: true },
          where: { userId, favorite: true, deletedAt: null },
        });
        updateData.favoriteSortOrder = (maxResult._max.favoriteSortOrder ?? -1) + 1;
      }
    }

    const updated = await prisma.note.update({
      where: { id, userId, deletedAt: null },
      data: updateData,
    });

    if (data.content !== undefined) {
      syncNoteLinks(userId, updated.id, updated.content).catch((err) => {
        console.error("Failed to sync note links:", err);
      });
    }

    if (data.title !== undefined || data.content !== undefined) {
      captureVersion(updated.id, updated.title, updated.content).catch((err) => {
        console.error("Failed to capture version:", err);
      });
    }

    return updated;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export async function softDeleteNote(userId: string, id: string): Promise<boolean> {
  const prisma = getPrisma();
  try {
    await prisma.note.update({
      where: { id, userId, deletedAt: null },
      data: { deletedAt: new Date(), favorite: false },
    });
    return true;
  } catch (error) {
    if (isNotFoundError(error)) return false;
    throw error;
  }
}

export async function restoreNote(userId: string, id: string): Promise<PrismaNote | null> {
  const prisma = getPrisma();
  try {
    return await prisma.note.update({
      where: { id, userId },
      data: { deletedAt: null },
    });
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export async function permanentDeleteNote(userId: string, id: string): Promise<boolean> {
  const prisma = getPrisma();
  try {
    await prisma.note.delete({
      where: { id, userId },
    });
    return true;
  } catch (error) {
    if (isNotFoundError(error)) return false;
    throw error;
  }
}

export async function permanentDeleteTrash(userId: string, ids?: string[]): Promise<number> {
  const prisma = getPrisma();
  const where: Record<string, unknown> = { userId, deletedAt: { not: null } };
  if (ids && ids.length > 0) {
    where.id = { in: ids };
  }
  const result = await prisma.note.deleteMany({ where });
  return result.count;
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

export async function createFolder(
  userId: string,
  name: string,
  parentId?: string | null,
): Promise<PrismaFolder> {
  const prisma = getPrisma();

  // Auto-increment sortOrder among siblings
  const maxResult = await prisma.folder.aggregate({
    _max: { sortOrder: true },
    where: { userId, parentId: parentId ?? null },
  });
  const nextSortOrder = (maxResult._max.sortOrder ?? -1) + 1;

  return prisma.folder.create({
    data: {
      userId,
      name,
      parentId: parentId ?? null,
      sortOrder: nextSortOrder,
    },
  });
}

export async function getDescendantIds(folderId: string): Promise<string[]> {
  const prisma = getPrisma();
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `WITH RECURSIVE descendants AS (
      SELECT "id" FROM "folders" WHERE "parentId" = $1 AND "deletedAt" IS NULL
      UNION ALL
      SELECT f."id" FROM "folders" f
      INNER JOIN descendants d ON f."parentId" = d."id"
      WHERE f."deletedAt" IS NULL
    )
    SELECT "id" FROM descendants`,
    folderId,
  );
  return rows.map((r) => r.id);
}

export async function getSelfAndDescendantIds(
  folderId: string,
): Promise<string[]> {
  const descendants = await getDescendantIds(folderId);
  return [folderId, ...descendants];
}

export async function getFolderPath(folderId: string): Promise<string> {
  const prisma = getPrisma();
  const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(
    `WITH RECURSIVE ancestors AS (
      SELECT "id", "name", "parentId" FROM "folders" WHERE "id" = $1
      UNION ALL
      SELECT f."id", f."name", f."parentId" FROM "folders" f
      INNER JOIN ancestors a ON f."id" = a."parentId"
    )
    SELECT "name" FROM ancestors`,
    folderId,
  );
  // Rows come child→root, reverse for path
  return rows.reverse().map((r) => r.name).join(" / ");
}

function buildFolderTree(
  flatFolders: (PrismaFolder & { count: number })[],
): FolderInfo[] {
  const map = new Map<string, FolderInfo>();
  const roots: FolderInfo[] = [];

  // Create FolderInfo nodes
  for (const f of flatFolders) {
    map.set(f.id, {
      id: f.id,
      name: f.name,
      parentId: f.parentId,
      sortOrder: f.sortOrder,
      favorite: f.favorite,
      count: f.count,
      totalCount: f.count,
      createdAt: f.createdAt.toISOString(),
      children: [],
    });
  }

  // Build tree
  for (const f of flatFolders) {
    const node = map.get(f.id)!;
    if (f.parentId && map.has(f.parentId)) {
      map.get(f.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children by sortOrder
  for (const node of map.values()) {
    node.children.sort((a, b) => a.sortOrder - b.sortOrder);
  }
  roots.sort((a, b) => a.sortOrder - b.sortOrder);

  // Post-order traversal to compute totalCount
  function computeTotalCount(node: FolderInfo): number {
    let total = node.count;
    for (const child of node.children) {
      total += computeTotalCount(child);
    }
    node.totalCount = total;
    return total;
  }
  for (const root of roots) {
    computeTotalCount(root);
  }

  return roots;
}

export async function listFolders(userId: string): Promise<FolderInfo[]> {
  const prisma = getPrisma();

  // Get all folders for user (exclude soft-deleted)
  const allFolders = await prisma.folder.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  // Get note counts grouped by folderId
  const groups = await prisma.note.groupBy({
    by: ["folderId"],
    where: { userId, deletedAt: null, folderId: { not: null } },
    _count: { id: true },
  });

  const countMap = new Map(
    groups.map((g) => [g.folderId as string, g._count.id]),
  );

  const foldersWithCount = allFolders.map((f) => ({
    ...f,
    count: countMap.get(f.id) ?? 0,
  }));

  return buildFolderTree(foldersWithCount);
}

export async function listFavoriteNotes(
  userId: string,
  sortBy?: NoteSortField,
  sortOrder?: SortOrder,
): Promise<PrismaNote[]> {
  const prisma = getPrisma();
  const field = sortBy ?? "updatedAt";
  const order = sortOrder ?? "desc";

  // Map "sortOrder" field name to "favoriteSortOrder" for favorites
  const orderByField = field === "sortOrder" ? "favoriteSortOrder" : field;

  // Case-insensitive title sort requires raw SQL
  if (orderByField === "title") {
    const dir = order === "desc" ? "DESC" : "ASC";
    return prisma.$queryRawUnsafe<PrismaNote[]>(
      `SELECT ${NOTE_COLUMNS} FROM "notes" WHERE "userId" = $1 AND "favorite" = true AND "deletedAt" IS NULL ORDER BY LOWER("title") ${dir}`,
      userId,
    );
  }

  return prisma.note.findMany({
    where: { userId, favorite: true, deletedAt: null },
    orderBy: { [orderByField]: order },
  });
}

export async function toggleFolderFavorite(
  userId: string,
  folderId: string,
  favorite: boolean,
): Promise<PrismaFolder> {
  const prisma = getPrisma();
  return prisma.folder.update({
    where: { id: folderId, userId },
    data: { favorite },
  });
}

export async function reorderNotes(
  userId: string,
  order: { id: string; sortOrder: number }[],
): Promise<void> {
  const prisma = getPrisma();
  await prisma.$transaction(
    order.map((item) =>
      prisma.note.update({
        where: { id: item.id, userId },
        data: { sortOrder: item.sortOrder },
      }),
    ),
  );
}

export async function reorderFavoriteNotes(
  userId: string,
  order: { id: string; favoriteSortOrder: number }[],
): Promise<void> {
  const prisma = getPrisma();
  await prisma.$transaction(
    order.map((item) =>
      prisma.note.update({
        where: { id: item.id, userId },
        data: { favoriteSortOrder: item.favoriteSortOrder },
      }),
    ),
  );
}

export async function renameFolderById(
  userId: string,
  folderId: string,
  newName: string,
): Promise<PrismaFolder> {
  const prisma = getPrisma();
  return prisma.folder.update({
    where: { id: folderId, userId },
    data: { name: newName },
  });
}

export async function moveFolder(
  userId: string,
  folderId: string,
  newParentId: string | null,
  sortOrder?: number,
): Promise<PrismaFolder> {
  const prisma = getPrisma();

  // Validate no circular reference
  if (newParentId) {
    const descendants = await getSelfAndDescendantIds(folderId);
    if (descendants.includes(newParentId)) {
      throw new Error("Cannot move folder into its own descendant");
    }
  }

  const data: Record<string, unknown> = { parentId: newParentId };
  if (sortOrder !== undefined) {
    data.sortOrder = sortOrder;
  } else {
    // Auto-increment sortOrder among new siblings
    const maxResult = await prisma.folder.aggregate({
      _max: { sortOrder: true },
      where: { userId, parentId: newParentId },
    });
    data.sortOrder = (maxResult._max.sortOrder ?? -1) + 1;
  }

  return prisma.folder.update({
    where: { id: folderId, userId },
    data,
  });
}

export async function reorderFolders(
  userId: string,
  order: { id: string; sortOrder: number }[],
): Promise<void> {
  const prisma = getPrisma();
  await prisma.$transaction(
    order.map((item) =>
      prisma.folder.update({
        where: { id: item.id, userId },
        data: { sortOrder: item.sortOrder },
      }),
    ),
  );
}

export type FolderDeleteMode = "move-up" | "recursive";

export async function deleteFolderById(
  userId: string,
  folderId: string,
  mode: FolderDeleteMode = "move-up",
): Promise<number> {
  const prisma = getPrisma();

  const folder = await prisma.folder.findUnique({ where: { id: folderId } });
  if (!folder || folder.userId !== userId || folder.deletedAt) return 0;

  const now = new Date();

  if (mode === "recursive") {
    // Get all descendant folder IDs
    const descendantIds = await getDescendantIds(folderId);
    const allIds = [folderId, ...descendantIds];

    // Unfile all notes in this folder and descendants
    const result = await prisma.note.updateMany({
      where: { userId, folderId: { in: allIds }, deletedAt: null },
      data: { folderId: null, folder: null },
    });

    // Soft-delete all descendant folders then this folder
    if (descendantIds.length > 0) {
      await prisma.folder.updateMany({
        where: { id: { in: descendantIds } },
        data: { deletedAt: now },
      });
    }
    await prisma.folder.update({
      where: { id: folderId },
      data: { deletedAt: now },
    });

    return result.count;
  }

  // "move-up" mode: children and notes move to parent folder
  const parentId = folder.parentId;

  // Move children to parent
  await prisma.folder.updateMany({
    where: { parentId: folderId, deletedAt: null },
    data: { parentId },
  });

  // Move notes to parent folder
  const result = await prisma.note.updateMany({
    where: { userId, folderId, deletedAt: null },
    data: { folderId: parentId, folder: null },
  });

  // Soft-delete the folder
  await prisma.folder.update({
    where: { id: folderId },
    data: { deletedAt: now },
  });

  return result.count;
}

// Legacy name-based rename (kept for backward compat during transition)
export async function renameFolder(
  userId: string,
  oldName: string,
  newName: string,
): Promise<number> {
  const prisma = getPrisma();
  const result = await prisma.note.updateMany({
    where: { userId, folder: oldName, deletedAt: null },
    data: { folder: newName },
  });
  // Find the folder by name and rename it
  const folder = await prisma.folder.findFirst({ where: { userId, name: oldName, parentId: null } });
  if (folder) {
    await prisma.folder.update({
      where: { id: folder.id },
      data: { name: newName },
    });
  }
  return result.count;
}

// Legacy name-based delete (kept for backward compat during transition)
export async function deleteFolder(userId: string, name: string): Promise<number> {
  const prisma = getPrisma();
  const result = await prisma.note.updateMany({
    where: { userId, folder: name, deletedAt: null },
    data: { folder: null },
  });
  // Soft-delete from folders table
  const folder = await prisma.folder.findFirst({ where: { userId, name, deletedAt: null } });
  if (folder) {
    await prisma.folder.update({
      where: { id: folder.id },
      data: { deletedAt: new Date() },
    });
  }
  return result.count;
}

export async function listTags(userId: string): Promise<TagInfo[]> {
  const prisma = getPrisma();
  const result = await prisma.$queryRawUnsafe<TagInfo[]>(`
    SELECT tag AS name, COUNT(*)::int AS count
    FROM "notes", jsonb_array_elements_text("tags") AS tag
    WHERE "deletedAt" IS NULL AND "userId" = $1
    GROUP BY tag
    ORDER BY tag ASC
  `, userId);
  return result;
}

export async function renameTag(
  userId: string,
  oldName: string,
  newName: string,
): Promise<number> {
  const prisma = getPrisma();
  // Find notes that contain the old tag
  const notes = await prisma.note.findMany({
    where: { userId, deletedAt: null },
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

export async function findRelevantNotes(
  userId: string,
  query: string,
  limit: number = 5,
): Promise<{ id: string; title: string; content: string }[]> {
  const prisma = getPrisma();
  const queryEmbedding = await generateQueryEmbedding(query);
  const vectorStr = `[${queryEmbedding.join(",")}]`;

  const SIM_THRESHOLD = 0.3;
  const MIN_CONTENT_LEN = 20;

  const notes = await prisma.$queryRawUnsafe<
    { id: string; title: string; content: string }[]
  >(
    `SELECT "id", "title", "content"
     FROM "notes"
     WHERE "deletedAt" IS NULL
       AND "userId" = $1
       AND "embedding" IS NOT NULL
       AND LENGTH("content") >= ${MIN_CONTENT_LEN}
       AND (1 - ("embedding" <=> $2::vector)) > ${SIM_THRESHOLD}
     ORDER BY "embedding" <=> $2::vector ASC
     LIMIT $3`,
    userId,
    vectorStr,
    limit,
  );

  return notes;
}

export interface MeetingContextNote {
  id: string;
  title: string;
  snippet: string;
  score: number;
  updatedAt: Date;
}

export async function findMeetingContextNotes(
  userId: string,
  query: string,
  limit: number = 8,
  threshold: number = 0.65,
): Promise<MeetingContextNote[]> {
  const prisma = getPrisma();
  const queryEmbedding = await generateQueryEmbedding(query);
  const vectorStr = `[${queryEmbedding.join(",")}]`;

  const MIN_CONTENT_LEN = 20;

  const notes = await prisma.$queryRawUnsafe<
    { id: string; title: string; content: string; score: number; updatedAt: Date }[]
  >(
    `SELECT "id", "title", "content", (1 - ("embedding" <=> $2::vector)) AS score, "updatedAt"
     FROM "notes"
     WHERE "deletedAt" IS NULL
       AND "userId" = $1
       AND "embedding" IS NOT NULL
       AND LENGTH("content") >= ${MIN_CONTENT_LEN}
       AND (1 - ("embedding" <=> $2::vector)) > $3
     ORDER BY "embedding" <=> $2::vector ASC
     LIMIT $4`,
    userId,
    vectorStr,
    threshold,
    limit,
  );

  return notes.map((n) => ({
    id: n.id,
    title: n.title || "Untitled",
    snippet: extractSnippet(n.content, 150),
    score: Math.round(Number(n.score) * 100) / 100,
    updatedAt: n.updatedAt,
  }));
}

function extractSnippet(content: string, maxLen: number): string {
  // Strip markdown formatting for a clean snippet
  const cleaned = content
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~`>|[\]()!]/g, "")
    .replace(/\n+/g, " ")
    .trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen).replace(/\s\S*$/, "") + "...";
}

export async function removeTag(userId: string, name: string): Promise<number> {
  const prisma = getPrisma();
  const notes = await prisma.note.findMany({
    where: { userId, deletedAt: null },
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

export async function getDashboardData(userId: string): Promise<{
  recentlyEdited: PrismaNote[];
  favorites: PrismaNote[];
  audioNotes: PrismaNote[];
}> {
  const prisma = getPrisma();

  const [recentlyEdited, favorites, audioNotes] = await Promise.all([
    prisma.note.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    prisma.note.findMany({
      where: { userId, favorite: true, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    prisma.note.findMany({
      where: { userId, audioMode: { not: null }, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  return { recentlyEdited, favorites, audioNotes };
}
