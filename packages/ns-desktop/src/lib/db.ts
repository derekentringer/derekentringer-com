import Database from "@tauri-apps/plugin-sql";
import { v4 as uuidv4 } from "uuid";
import type {
  Note,
  FolderInfo,
  FolderSyncData,
  ImageSyncData,
  TagInfo,
  NoteSearchResult,
  NoteSortField,
  SortOrder,
  BacklinkInfo,
  NoteTitleEntry,
  NoteVersion,
  NoteVersionListResponse,
  AudioMode,
} from "@derekentringer/ns-shared";
import {
  parseFrontmatter,
  updateFrontmatterField,
  injectFrontmatter,
} from "@derekentringer/ns-shared";
import { DB_URI } from "./dbName.ts";

let dbInstance: Database | null = null;

async function getDb(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await Database.load(DB_URI);
  }
  return dbInstance;
}

interface NoteRow {
  id: string;
  title: string;
  content: string;
  folder_id: string | null;
  tags: string;
  summary: string;
  favorite: number;
  sort_order: number;
  favorite_sort_order: number;
  is_local_file: number;
  audio_mode: string | null;
  transcript: string | null;
  local_path: string | null;
  local_file_hash: string | null;
  is_deleted: number;
  deleted_at: string | null;
  sync_status: string;
  created_at: string;
  updated_at: string;
}

function rowToNote(row: NoteRow): Note {
  let tags: string[] = [];
  try {
    if (row.tags) tags = JSON.parse(row.tags);
  } catch {
    tags = [];
  }
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    folder: null,
    folderId: row.folder_id ?? null,
    folderPath: null,
    tags,
    summary: row.summary || null,
    favorite: (row.favorite ?? 0) === 1,
    sortOrder: row.sort_order ?? 0,
    favoriteSortOrder: row.favorite_sort_order ?? 0,
    isLocalFile: (row.is_local_file ?? 0) === 1,
    audioMode: (row.audio_mode as AudioMode) ?? null,
    transcript: row.transcript ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null,
  };
}

// ---------------------------------------------------------------------------
// FTS5 sync helpers (internal)
// ---------------------------------------------------------------------------

async function ftsInsert(
  id: string,
  title: string,
  content: string,
  tags: string,
): Promise<void> {
  const db = await getDb();
  const result = await db.execute(
    "INSERT INTO notes_fts(title, content, tags) VALUES ($1, $2, $3)",
    [title, content, tags],
  );
  const ftsRowid = result.lastInsertId;
  await db.execute(
    "INSERT INTO fts_map(note_id, fts_rowid) VALUES ($1, $2)",
    [id, ftsRowid],
  );
}

async function ftsUpdate(
  id: string,
  title: string,
  content: string,
  tags: string,
): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ fts_rowid: number }[]>(
    "SELECT fts_rowid FROM fts_map WHERE note_id = $1",
    [id],
  );
  if (rows.length === 0) {
    // Note not in FTS yet — insert instead
    await ftsInsert(id, title, content, tags);
    return;
  }
  const oldRowid = rows[0].fts_rowid;
  await db.execute(
    "DELETE FROM notes_fts WHERE rowid = $1",
    [oldRowid],
  );
  const result = await db.execute(
    "INSERT INTO notes_fts(title, content, tags) VALUES ($1, $2, $3)",
    [title, content, tags],
  );
  const newRowid = result.lastInsertId;
  await db.execute(
    "UPDATE fts_map SET fts_rowid = $1 WHERE note_id = $2",
    [newRowid, id],
  );
}

async function ftsDelete(id: string): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ fts_rowid: number }[]>(
    "SELECT fts_rowid FROM fts_map WHERE note_id = $1",
    [id],
  );
  if (rows.length > 0) {
    await db.execute(
      "DELETE FROM notes_fts WHERE rowid = $1",
      [rows[0].fts_rowid],
    );
    await db.execute(
      "DELETE FROM fts_map WHERE note_id = $1",
      [id],
    );
  }
}

/** Backfill FTS index for existing notes on first run */
export async function initFts(): Promise<void> {
  const db = await getDb();
  const [{ count }] = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM fts_map",
  );
  if (count > 0) return; // already populated

  const notes = await db.select<NoteRow[]>(
    "SELECT * FROM notes WHERE is_deleted = 0",
  );
  for (const row of notes) {
    await ftsInsert(row.id, row.title, row.content, row.tags);
  }
}

// ---------------------------------------------------------------------------
// Note CRUD
// ---------------------------------------------------------------------------

export interface FetchNotesOptions {
  folderId?: string | null; // null = unfiled, undefined = all
  sortBy?: NoteSortField;
  sortOrder?: SortOrder;
}

export async function countAllNotes(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM notes WHERE is_deleted = 0",
  );
  return rows[0]?.count ?? 0;
}

export async function fetchNotes(options?: FetchNotesOptions): Promise<Note[]> {
  const db = await getDb();

  const whereClauses = ["is_deleted = 0"];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (options?.folderId !== undefined) {
    if (options.folderId === null) {
      whereClauses.push("folder_id IS NULL");
    } else {
      // Include notes in the selected folder and all descendant folders
      const descendantIds = await collectDescendantFolderIds(options.folderId);
      const allIds = [options.folderId, ...descendantIds];
      const placeholders = allIds.map((_, i) => `$${paramIdx + i}`).join(", ");
      whereClauses.push(`folder_id IN (${placeholders})`);
      params.push(...allIds);
      paramIdx += allIds.length;
    }
  }

  const sortField = options?.sortBy ?? "updatedAt";
  const sortOrder = options?.sortOrder ?? "desc";

  const columnMap: Record<NoteSortField, string> = {
    title: "title",
    createdAt: "created_at",
    updatedAt: "updated_at",
    sortOrder: "sort_order",
  };

  const orderColumn = columnMap[sortField] ?? "updated_at";
  const orderDir = sortOrder === "asc" ? "ASC" : "DESC";
  const collate = sortField === "title" ? " COLLATE NOCASE" : "";

  const sql = `SELECT * FROM notes WHERE ${whereClauses.join(" AND ")} ORDER BY ${orderColumn}${collate} ${orderDir}`;
  const rows = await db.select<NoteRow[]>(sql, params);
  return rows.map(rowToNote);
}

export async function fetchNoteById(id: string): Promise<Note | null> {
  const db = await getDb();
  const rows = await db.select<NoteRow[]>(
    "SELECT * FROM notes WHERE id = $1",
    [id],
  );
  return rows.length > 0 ? rowToNote(rows[0]) : null;
}

export interface CreateNoteInput {
  title?: string;
  content?: string;
  folderId?: string;
  tags?: string[];
  isLocalFile?: boolean;
}

export async function createNote(data: CreateNoteInput): Promise<Note> {
  const db = await getDb();
  const id = uuidv4();
  const now = new Date().toISOString();
  const title = data.title ?? "";
  const folderId = data.folderId ?? null;

  const isLocalFile = data.isLocalFile ? 1 : 0;
  const tags = data.tags ?? [];
  const tagsJson = JSON.stringify(tags);

  // Inject frontmatter into content — frontmatter is the source of truth for
  // metadata fields. If content already has frontmatter, merge without overwriting.
  const content = injectFrontmatter(data.content ?? "", {
    title: title || undefined,
    tags: tags.length > 0 ? tags : undefined,
  });

  await db.execute(
    `INSERT INTO notes (id, title, content, folder_id, tags, is_local_file, is_deleted, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $7)`,
    [id, title, content, folderId, tagsJson, isLocalFile, now],
  );

  // Sync to FTS
  await ftsInsert(id, title, content, tagsJson);

  // Re-read the row to get all column values including migration-002 defaults
  const note = await fetchNoteById(id);

  // Enqueue sync action (fire-and-forget)
  enqueueSyncAction("create", id, "note").catch(() => {});

  if (note) return note;

  // Fallback if re-read fails
  return {
    id,
    title,
    content,
    folder: null,
    folderId,
    folderPath: null,
    tags: [],
    summary: null,
    favorite: false,
    sortOrder: 0,
    favoriteSortOrder: 0,
    isLocalFile: data.isLocalFile ?? false,
    audioMode: null,
    transcript: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

export async function updateNote(
  id: string,
  data: Partial<Pick<Note, "title" | "content" | "tags" | "summary" | "favorite" | "sortOrder" | "folderId" | "isLocalFile">>,
): Promise<Note> {
  const db = await getDb();
  const now = new Date().toISOString();

  const setClauses: string[] = ["updated_at = $1"];
  const params: unknown[] = [now];
  let paramIdx = 2;

  if (data.title !== undefined) {
    setClauses.push(`title = $${paramIdx}`);
    params.push(data.title);
    paramIdx++;
  }
  if (data.content !== undefined) {
    setClauses.push(`content = $${paramIdx}`);
    params.push(data.content);
    paramIdx++;
  }
  if (data.tags !== undefined) {
    setClauses.push(`tags = $${paramIdx}`);
    params.push(JSON.stringify(data.tags));
    paramIdx++;
  }
  if (data.summary !== undefined) {
    setClauses.push(`summary = $${paramIdx}`);
    params.push(data.summary ?? "");
    paramIdx++;
  }
  if (data.favorite !== undefined) {
    setClauses.push(`favorite = $${paramIdx}`);
    params.push(data.favorite ? 1 : 0);
    paramIdx++;

    if (data.favorite) {
      // Auto-assign next favorite_sort_order
      const [maxRow] = await db.select<{ max_order: number | null }[]>(
        "SELECT MAX(favorite_sort_order) as max_order FROM notes WHERE favorite = 1 AND is_deleted = 0",
      );
      const nextOrder = (maxRow?.max_order ?? -1) + 1;
      setClauses.push(`favorite_sort_order = $${paramIdx}`);
      params.push(nextOrder);
      paramIdx++;
    }
  }
  if (data.sortOrder !== undefined) {
    setClauses.push(`sort_order = $${paramIdx}`);
    params.push(data.sortOrder);
    paramIdx++;
  }
  if (data.folderId !== undefined) {
    setClauses.push(`folder_id = $${paramIdx}`);
    params.push(data.folderId);
    paramIdx++;
  }
  if (data.isLocalFile !== undefined) {
    setClauses.push(`is_local_file = $${paramIdx}`);
    params.push(data.isLocalFile ? 1 : 0);
    paramIdx++;
  }

  // Sync frontmatter ↔ database cache.
  // When content changes: derive cache columns from frontmatter in content.
  // When metadata fields change without content: update frontmatter in content.
  if (data.content !== undefined) {
    // Content changed — parse frontmatter and derive cache columns
    const { metadata } = parseFrontmatter(data.content);
    if (metadata.title !== undefined && data.title === undefined) {
      setClauses.push(`title = $${paramIdx}`);
      params.push(metadata.title);
      paramIdx++;
    }
    if (metadata.tags !== undefined && data.tags === undefined) {
      setClauses.push(`tags = $${paramIdx}`);
      params.push(JSON.stringify(metadata.tags));
      paramIdx++;
    }
    if (metadata.description !== undefined && data.summary === undefined) {
      setClauses.push(`summary = $${paramIdx}`);
      params.push(metadata.description);
      paramIdx++;
    }
    if (metadata.favorite !== undefined && data.favorite === undefined) {
      setClauses.push(`favorite = $${paramIdx}`);
      params.push(metadata.favorite ? 1 : 0);
      paramIdx++;
    }
  } else {
    // Metadata changed without content — update frontmatter in content.
    const metadataChanged =
      data.title !== undefined ||
      data.tags !== undefined ||
      data.summary !== undefined ||
      data.favorite !== undefined;

    if (metadataChanged) {
      const rows = await db.select<{ content: string }[]>(
        "SELECT content FROM notes WHERE id = $1",
        [id],
      );
      if (rows.length > 0 && rows[0].content !== undefined) {
        let content = rows[0].content;
        if (data.title !== undefined) {
          content = updateFrontmatterField(content, "title", data.title);
        }
        if (data.tags !== undefined) {
          content = updateFrontmatterField(
            content,
            "tags",
            data.tags.length > 0 ? data.tags : undefined,
          );
        }
        if (data.summary !== undefined) {
          content = updateFrontmatterField(
            content,
            "description",
            data.summary || undefined,
          );
        }
        if (data.favorite !== undefined) {
          content = updateFrontmatterField(
            content,
            "favorite",
            data.favorite || undefined,
          );
        }
        setClauses.push(`content = $${paramIdx}`);
        params.push(content);
        paramIdx++;
      }
    }
  }

  params.push(id);
  await db.execute(
    `UPDATE notes SET ${setClauses.join(", ")} WHERE id = $${paramIdx}`,
    params,
  );

  // Sync FTS if searchable fields changed
  if (data.title !== undefined || data.content !== undefined || data.tags !== undefined) {
    const note = await fetchNoteById(id);
    if (note) {
      await ftsUpdate(id, note.title, note.content, JSON.stringify(note.tags));
    }
  }

  const note = await fetchNoteById(id);
  if (!note) throw new Error(`Note ${id} not found after update`);

  // Enqueue sync action (fire-and-forget)
  enqueueSyncAction("update", id, "note").catch(() => {});

  return note;
}

export async function softDeleteNote(id: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute(
    "UPDATE notes SET is_deleted = 1, deleted_at = $1, updated_at = $1, favorite = 0 WHERE id = $2",
    [now, id],
  );
  await ftsDelete(id);
  import("./embeddingService.ts").then((m) => m.deleteEmbedding(id)).catch(() => {});
  enqueueSyncAction("delete", id, "note").catch(() => {});
}

export async function hardDeleteNote(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM notes WHERE id = $1", [id]);
  await ftsDelete(id);
  enqueueSyncAction("delete", id, "note").catch(() => {});
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export type SearchMode = "keyword" | "semantic" | "hybrid";

export async function searchNotes(
  query: string,
  mode: SearchMode = "keyword",
): Promise<NoteSearchResult[]> {
  if (!query.trim()) return [];
  switch (mode) {
    case "semantic":
      return searchNotesSemantic(query);
    case "hybrid":
      return searchNotesHybrid(query);
    default:
      return searchNotesKeyword(query);
  }
}

async function searchNotesKeyword(query: string): Promise<NoteSearchResult[]> {
  if (!query.trim()) return [];

  const db = await getDb();
  const searchTerm = query.trim().replace(/"/g, '""');

  const rows = await db.select<(NoteRow & { headline: string })[]>(
    `SELECT n.*, snippet(notes_fts, 1, '<mark>', '</mark>', '...', 30) as headline
     FROM fts_map fm
     JOIN notes_fts ON notes_fts.rowid = fm.fts_rowid
     JOIN notes n ON n.id = fm.note_id
     WHERE notes_fts MATCH $1 AND n.is_deleted = 0
     ORDER BY rank`,
    [`"${searchTerm}"`],
  );

  return rows.map((row) => ({
    ...rowToNote(row),
    headline: row.headline,
  }));
}

async function searchNotesSemantic(query: string): Promise<NoteSearchResult[]> {
  const { requestQueryEmbedding } = await import("../api/ai.ts");
  const { getAllEmbeddings, cosineSimilarity, SIM_THRESHOLD, MIN_CONTENT_LEN } =
    await import("./embeddingService.ts");

  let queryEmbedding: number[];
  try {
    queryEmbedding = await requestQueryEmbedding(query);
  } catch {
    return []; // Offline or error — return empty
  }

  const allEmbeddings = await getAllEmbeddings();
  const scored: { noteId: string; similarity: number }[] = [];

  for (const entry of allEmbeddings) {
    const sim = cosineSimilarity(queryEmbedding, entry.embedding);
    if (sim >= SIM_THRESHOLD) {
      scored.push({ noteId: entry.noteId, similarity: sim });
    }
  }

  scored.sort((a, b) => b.similarity - a.similarity);

  const results: NoteSearchResult[] = [];
  for (const { noteId } of scored) {
    const note = await fetchNoteById(noteId);
    if (note && !note.deletedAt && note.content.length >= MIN_CONTENT_LEN) {
      results.push({
        ...note,
        headline: note.content.slice(0, 150),
      });
    }
  }

  return results;
}

async function searchNotesHybrid(query: string): Promise<NoteSearchResult[]> {
  const [keywordResults, semanticResults] = await Promise.all([
    searchNotesKeyword(query),
    searchNotesSemantic(query),
  ]);

  // Position-based normalization for keyword scores
  const keywordScores = new Map<string, number>();
  for (let i = 0; i < keywordResults.length; i++) {
    const score = 1 - i / Math.max(keywordResults.length, 1);
    keywordScores.set(keywordResults[i].id, score);
  }

  // Position-based normalization for semantic scores
  const semanticScores = new Map<string, number>();
  for (let i = 0; i < semanticResults.length; i++) {
    const score = 1 - i / Math.max(semanticResults.length, 1);
    semanticScores.set(semanticResults[i].id, score);
  }

  // Combine all unique note IDs
  const allIds = new Set([...keywordScores.keys(), ...semanticScores.keys()]);
  const hybridScored: { id: string; score: number }[] = [];

  for (const id of allIds) {
    const kw = keywordScores.get(id) ?? 0;
    const sem = semanticScores.get(id) ?? 0;
    const keywordBonus = keywordScores.has(id) ? 0.3 : 0;
    const score = 0.3 * kw + 0.7 * sem + keywordBonus;
    hybridScored.push({ id, score });
  }

  hybridScored.sort((a, b) => b.score - a.score);

  // Build results using keyword results + semantic results as source
  const resultMap = new Map<string, NoteSearchResult>();
  for (const r of keywordResults) resultMap.set(r.id, r);
  for (const r of semanticResults) {
    if (!resultMap.has(r.id)) resultMap.set(r.id, r);
  }

  const results: NoteSearchResult[] = [];
  for (const { id } of hybridScored) {
    const result = resultMap.get(id);
    if (result) results.push(result);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

interface FolderRow {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  favorite: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function buildFolderTree(
  rows: FolderRow[],
  noteCounts: Map<string, number>,
): FolderInfo[] {
  const map = new Map<string, FolderInfo>();

  for (const row of rows) {
    map.set(row.id, {
      id: row.id,
      name: row.name,
      parentId: row.parent_id ?? null,
      sortOrder: row.sort_order,
      favorite: row.favorite === 1,
      count: noteCounts.get(row.id) ?? 0,
      totalCount: 0,
      createdAt: row.created_at,
      children: [],
    });
  }

  const roots: FolderInfo[] = [];

  for (const folder of map.values()) {
    if (folder.parentId && map.has(folder.parentId)) {
      map.get(folder.parentId)!.children.push(folder);
    } else {
      roots.push(folder);
    }
  }

  // Sort children by sort_order
  function sortChildren(folders: FolderInfo[]) {
    folders.sort((a, b) => a.sortOrder - b.sortOrder);
    for (const f of folders) sortChildren(f.children);
  }
  sortChildren(roots);

  // Compute totalCount (own count + all descendant counts)
  function computeTotalCount(folder: FolderInfo): number {
    let total = folder.count;
    for (const child of folder.children) {
      total += computeTotalCount(child);
    }
    folder.totalCount = total;
    return total;
  }
  for (const root of roots) computeTotalCount(root);

  return roots;
}

export async function toggleFolderFavorite(
  folderId: string,
  favorite: boolean,
): Promise<FolderInfo[]> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute(
    "UPDATE folders SET favorite = $1, updated_at = $2 WHERE id = $3",
    [favorite ? 1 : 0, now, folderId],
  );
  enqueueSyncAction("update", folderId, "folder").catch(() => {});
  return fetchFolders();
}

export async function fetchFavoriteNotes(options?: {
  sortBy?: NoteSortField;
  sortOrder?: SortOrder;
}): Promise<Note[]> {
  const db = await getDb();
  const sortField = options?.sortBy ?? "updatedAt";
  const sortOrder = options?.sortOrder ?? "desc";

  const columnMap: Record<NoteSortField, string> = {
    title: "title",
    createdAt: "created_at",
    updatedAt: "updated_at",
    sortOrder: "favorite_sort_order",
  };

  const orderColumn = columnMap[sortField] ?? "title";
  const orderDir = sortOrder === "asc" ? "ASC" : "DESC";
  const collate = sortField === "title" ? " COLLATE NOCASE" : "";

  const rows = await db.select<NoteRow[]>(
    `SELECT * FROM notes WHERE favorite = 1 AND is_deleted = 0 ORDER BY ${orderColumn}${collate} ${orderDir}`,
  );
  return rows.map(rowToNote);
}

export async function fetchFolders(): Promise<FolderInfo[]> {
  const db = await getDb();
  const folderRows = await db.select<FolderRow[]>(
    "SELECT * FROM folders WHERE deleted_at IS NULL ORDER BY sort_order ASC, name ASC",
  );

  const countRows = await db.select<{ folder_id: string; count: number }[]>(
    "SELECT folder_id, COUNT(*) as count FROM notes WHERE is_deleted = 0 AND folder_id IS NOT NULL GROUP BY folder_id",
  );
  const noteCounts = new Map(countRows.map((r) => [r.folder_id, r.count]));

  return buildFolderTree(folderRows, noteCounts);
}

export async function createFolder(
  name: string,
  parentId?: string,
): Promise<FolderInfo> {
  const db = await getDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  await db.execute(
    "INSERT INTO folders (id, name, parent_id, sort_order, favorite, created_at, updated_at) VALUES ($1, $2, $3, 0, 0, $4, $4)",
    [id, name, parentId ?? null, now],
  );

  enqueueSyncAction("create", id, "folder").catch(() => {});

  return {
    id,
    name,
    parentId: parentId ?? null,
    sortOrder: 0,
    favorite: false,
    count: 0,
    totalCount: 0,
    createdAt: now,
    children: [],
  };
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute(
    "UPDATE folders SET name = $1, updated_at = $2 WHERE id = $3",
    [name, now, id],
  );
  enqueueSyncAction("update", id, "folder").catch(() => {});
}

export async function deleteFolder(
  id: string,
  mode: "move-up" | "recursive",
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();

  if (mode === "move-up") {
    // Get this folder's parent
    const [folder] = await db.select<FolderRow[]>(
      "SELECT * FROM folders WHERE id = $1 AND deleted_at IS NULL",
      [id],
    );
    const parentId = folder?.parent_id ?? null;

    // Move child folders to parent
    await db.execute(
      "UPDATE folders SET parent_id = $1, updated_at = $2 WHERE parent_id = $3 AND deleted_at IS NULL",
      [parentId, now, id],
    );

    // Move notes to parent folder
    await db.execute(
      "UPDATE notes SET folder_id = $1 WHERE folder_id = $2",
      [parentId, id],
    );

    // Soft-delete the folder
    await db.execute(
      "UPDATE folders SET deleted_at = $1, updated_at = $1 WHERE id = $2",
      [now, id],
    );
    enqueueSyncAction("delete", id, "folder").catch(() => {});
  } else {
    // Recursive: collect all descendant folder IDs
    const allIds = await collectDescendantFolderIds(id);
    allIds.push(id);

    // Unfile notes in these folders
    for (const folderId of allIds) {
      await db.execute(
        "UPDATE notes SET folder_id = NULL WHERE folder_id = $1",
        [folderId],
      );
    }

    // Soft-delete all folders
    for (const folderId of allIds) {
      await db.execute(
        "UPDATE folders SET deleted_at = $1, updated_at = $1 WHERE id = $2",
        [now, folderId],
      );
      enqueueSyncAction("delete", folderId, "folder").catch(() => {});
    }
  }
}

async function collectDescendantFolderIds(parentId: string): Promise<string[]> {
  const db = await getDb();
  const children = await db.select<{ id: string }[]>(
    "SELECT id FROM folders WHERE parent_id = $1 AND deleted_at IS NULL",
    [parentId],
  );
  const ids: string[] = [];
  for (const child of children) {
    ids.push(child.id);
    ids.push(...(await collectDescendantFolderIds(child.id)));
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Reorder / Move
// ---------------------------------------------------------------------------

export async function reorderNotes(
  order: { id: string; sortOrder: number }[],
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  for (const item of order) {
    await db.execute(
      "UPDATE notes SET sort_order = $1, updated_at = $2 WHERE id = $3",
      [item.sortOrder, now, item.id],
    );
    enqueueSyncAction("update", item.id, "note").catch(() => {});
  }
}

export async function reorderFavoriteNotes(
  order: { id: string; favoriteSortOrder: number }[],
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  for (const item of order) {
    await db.execute(
      "UPDATE notes SET favorite_sort_order = $1, updated_at = $2 WHERE id = $3",
      [item.favoriteSortOrder, now, item.id],
    );
    enqueueSyncAction("update", item.id, "note").catch(() => {});
  }
}

export async function moveFolderParent(
  folderId: string,
  newParentId: string | null,
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute(
    "UPDATE folders SET parent_id = $1, updated_at = $2 WHERE id = $3",
    [newParentId, now, folderId],
  );
  enqueueSyncAction("update", folderId, "folder").catch(() => {});
}

export async function reorderFolders(
  order: { id: string; sortOrder: number }[],
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  for (const item of order) {
    await db.execute(
      "UPDATE folders SET sort_order = $1, updated_at = $2 WHERE id = $3",
      [item.sortOrder, now, item.id],
    );
    enqueueSyncAction("update", item.id, "folder").catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export async function fetchTags(): Promise<TagInfo[]> {
  const db = await getDb();
  const rows = await db.select<{ name: string; count: number }[]>(
    "SELECT je.value as name, COUNT(*) as count FROM notes, json_each(notes.tags) je WHERE notes.is_deleted = 0 GROUP BY je.value ORDER BY count DESC",
  );
  return rows;
}

export async function renameTag(
  oldName: string,
  newName: string,
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();

  // Find notes containing the old tag
  const noteRows = await db.select<{ id: string; tags: string }[]>(
    "SELECT id, tags FROM notes WHERE is_deleted = 0 AND tags LIKE $1",
    [`%${JSON.stringify(oldName).slice(1, -1)}%`],
  );

  for (const row of noteRows) {
    let tags: string[] = [];
    try {
      tags = JSON.parse(row.tags);
    } catch {
      continue;
    }
    const idx = tags.indexOf(oldName);
    if (idx === -1) continue;
    tags[idx] = newName;
    // Deduplicate
    const unique = [...new Set(tags)];
    await db.execute(
      "UPDATE notes SET tags = $1, updated_at = $2 WHERE id = $3",
      [JSON.stringify(unique), now, row.id],
    );
    // Update FTS
    const note = await fetchNoteById(row.id);
    if (note) {
      await ftsUpdate(row.id, note.title, note.content, JSON.stringify(note.tags));
    }
    enqueueSyncAction("update", row.id, "note").catch(() => {});
  }
}

export async function deleteTag(name: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();

  const noteRows = await db.select<{ id: string; tags: string }[]>(
    "SELECT id, tags FROM notes WHERE is_deleted = 0 AND tags LIKE $1",
    [`%${JSON.stringify(name).slice(1, -1)}%`],
  );

  for (const row of noteRows) {
    let tags: string[] = [];
    try {
      tags = JSON.parse(row.tags);
    } catch {
      continue;
    }
    const filtered = tags.filter((t) => t !== name);
    await db.execute(
      "UPDATE notes SET tags = $1, updated_at = $2 WHERE id = $3",
      [JSON.stringify(filtered), now, row.id],
    );
    const note = await fetchNoteById(row.id);
    if (note) {
      await ftsUpdate(row.id, note.title, note.content, JSON.stringify(note.tags));
    }
    enqueueSyncAction("update", row.id, "note").catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Trash
// ---------------------------------------------------------------------------

export async function fetchTrash(): Promise<Note[]> {
  const db = await getDb();
  const rows = await db.select<NoteRow[]>(
    "SELECT * FROM notes WHERE is_deleted = 1 ORDER BY deleted_at DESC",
  );
  return rows.map(rowToNote);
}

export async function restoreNote(id: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute(
    "UPDATE notes SET is_deleted = 0, deleted_at = NULL, updated_at = $1 WHERE id = $2",
    [now, id],
  );

  // Re-add to FTS
  const note = await fetchNoteById(id);
  if (note) {
    await ftsInsert(id, note.title, note.content, JSON.stringify(note.tags));
  }
  enqueueSyncAction("update", id, "note").catch(() => {});
}

export async function bulkHardDelete(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const db = await getDb();
  let count = 0;
  for (const id of ids) {
    await db.execute("DELETE FROM notes WHERE id = $1", [id]);
    await ftsDelete(id);
    count++;
  }
  return count;
}

export async function emptyTrash(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ id: string }[]>(
    "SELECT id FROM notes WHERE is_deleted = 1",
  );
  for (const row of rows) {
    await db.execute("DELETE FROM notes WHERE id = $1", [row.id]);
    await ftsDelete(row.id);
  }
  return rows.length;
}

export async function purgeOldTrash(retentionDays: number): Promise<number> {
  if (retentionDays === 0) return 0;
  const db = await getDb();
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const rows = await db.select<{ id: string }[]>(
    "SELECT id FROM notes WHERE is_deleted = 1 AND deleted_at < $1",
    [cutoff],
  );
  for (const row of rows) {
    await db.execute("DELETE FROM notes WHERE id = $1", [row.id]);
    await ftsDelete(row.id);
  }
  return rows.length;
}

// ---------------------------------------------------------------------------
// Note Links
// ---------------------------------------------------------------------------

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
 * Sync outgoing wiki-links for a note.
 * Deletes existing outgoing links and creates new ones.
 */
export async function syncNoteLinks(
  sourceNoteId: string,
  content: string,
): Promise<void> {
  const db = await getDb();

  // Delete existing outgoing links
  await db.execute("DELETE FROM note_links WHERE source_note_id = $1", [sourceNoteId]);

  const linkTexts = extractWikiLinks(content);
  if (linkTexts.length === 0) return;

  // Resolve titles to note IDs (case-insensitive)
  const lowerTexts = linkTexts.map((t) => t.toLowerCase());
  const placeholders = lowerTexts.map((_, i) => `$${i + 1}`).join(", ");
  const rows = await db.select<{ id: string; title: string }[]>(
    `SELECT id, title FROM notes WHERE LOWER(title) IN (${placeholders}) AND is_deleted = 0`,
    lowerTexts,
  );

  const resolved = new Map<string, string>();
  for (const row of rows) {
    resolved.set(row.title.toLowerCase(), row.id);
  }

  if (resolved.size === 0) return;

  for (const text of linkTexts) {
    const targetId = resolved.get(text.toLowerCase());
    if (targetId && targetId !== sourceNoteId) {
      await db.execute(
        "INSERT OR IGNORE INTO note_links (id, source_note_id, target_note_id, link_text) VALUES ($1, $2, $3, $4)",
        [uuidv4(), sourceNoteId, targetId, text],
      );
    }
  }
}

/**
 * Get all backlinks (incoming links) for a note.
 * Filters out links from deleted source notes.
 */
export async function getBacklinks(noteId: string): Promise<BacklinkInfo[]> {
  const db = await getDb();
  const rows = await db.select<{ link_text: string; note_id: string; note_title: string }[]>(
    `SELECT nl.link_text, n.id as note_id, n.title as note_title
     FROM note_links nl
     JOIN notes n ON n.id = nl.source_note_id
     WHERE nl.target_note_id = $1 AND n.is_deleted = 0`,
    [noteId],
  );
  return rows.map((r) => ({
    noteId: r.note_id,
    noteTitle: r.note_title,
    linkText: r.link_text,
  }));
}

/**
 * List all note titles (non-deleted) for autocomplete.
 */
export async function listNoteTitles(): Promise<NoteTitleEntry[]> {
  const db = await getDb();
  return db.select<NoteTitleEntry[]>(
    "SELECT id, title FROM notes WHERE is_deleted = 0 ORDER BY title COLLATE NOCASE ASC",
  );
}

// ---------------------------------------------------------------------------
// Version History
// ---------------------------------------------------------------------------

const MAX_VERSIONS_PER_NOTE = 50;

interface NoteVersionRow {
  id: string;
  note_id: string;
  title: string;
  content: string;
  origin: string;
  created_at: string;
}

function rowToNoteVersion(row: NoteVersionRow): NoteVersion {
  return {
    id: row.id,
    noteId: row.note_id,
    title: row.title,
    content: row.content,
    origin: row.origin,
    createdAt: row.created_at,
  };
}

/**
 * Capture a version snapshot of a note, respecting the interval cooldown.
 * If intervalMinutes > 0, skips if the last version was created within that interval.
 * If intervalMinutes === 0, always captures (every save).
 */
export async function captureVersion(
  noteId: string,
  title: string,
  content: string,
  intervalMinutes: number,
): Promise<void> {
  const db = await getDb();

  if (intervalMinutes > 0) {
    const cooldownMs = intervalMinutes * 60 * 1000;
    const rows = await db.select<NoteVersionRow[]>(
      "SELECT * FROM note_versions WHERE note_id = $1 ORDER BY created_at DESC LIMIT 1",
      [noteId],
    );
    if (rows.length > 0) {
      const elapsed = Date.now() - new Date(rows[0].created_at).getTime();
      if (elapsed < cooldownMs) return;
    }
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO note_versions (id, note_id, title, content, origin, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
    [id, noteId, title, content, "desktop", now],
  );

  // Enforce version cap
  await db.execute(
    "DELETE FROM note_versions WHERE id IN (SELECT id FROM note_versions WHERE note_id = $1 ORDER BY created_at DESC LIMIT -1 OFFSET $2)",
    [noteId, MAX_VERSIONS_PER_NOTE],
  );
}

/**
 * List all versions for a note, newest first.
 */
export async function listVersions(noteId: string): Promise<NoteVersionListResponse> {
  const db = await getDb();
  const rows = await db.select<NoteVersionRow[]>(
    "SELECT * FROM note_versions WHERE note_id = $1 ORDER BY created_at DESC",
    [noteId],
  );
  return {
    versions: rows.map(rowToNoteVersion),
    total: rows.length,
  };
}

/**
 * Get a single version by ID.
 */
export async function getVersion(versionId: string): Promise<NoteVersion | null> {
  const db = await getDb();
  const rows = await db.select<NoteVersionRow[]>(
    "SELECT * FROM note_versions WHERE id = $1",
    [versionId],
  );
  return rows.length > 0 ? rowToNoteVersion(rows[0]) : null;
}

/**
 * Restore a version: update the note's title and content from the version.
 */
export async function restoreVersion(noteId: string, versionId: string): Promise<Note> {
  const version = await getVersion(versionId);
  if (!version) throw new Error(`Version ${versionId} not found`);
  return updateNote(noteId, { title: version.title, content: version.content });
}

// ---------------------------------------------------------------------------
// Sync Queue / Sync Meta
// ---------------------------------------------------------------------------

export interface SyncQueueEntry {
  id: number;
  action: string;
  entity_id: string;
  entity_type: string;
  payload: string | null;
  created_at: string;
}

export async function enqueueSyncAction(
  action: string,
  entityId: string,
  entityType: "note" | "folder" | "image",
  payload?: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO sync_queue (action, note_id, payload) VALUES ($1, $2, $3)",
    [`${entityType}:${action}`, entityId, payload ?? null],
  );
}

export async function readSyncQueue(limit = 100): Promise<SyncQueueEntry[]> {
  const db = await getDb();
  const rows = await db.select<{ id: number; action: string; note_id: string; payload: string | null; created_at: string }[]>(
    "SELECT * FROM sync_queue ORDER BY id ASC LIMIT $1",
    [limit],
  );
  return rows.map((r) => {
    const [entityType] = r.action.split(":");
    return {
      id: r.id,
      action: r.action,
      entity_id: r.note_id,
      entity_type: entityType === "folder" ? "folder" : entityType === "image" ? "image" : "note",
      payload: r.payload,
      created_at: r.created_at,
    };
  });
}

export async function removeSyncQueueEntries(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
  await db.execute(
    `DELETE FROM sync_queue WHERE id IN (${placeholders})`,
    ids,
  );
}

export async function getSyncMeta(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM sync_meta WHERE key = $1",
    [key],
  );
  return rows.length > 0 ? rows[0].value : null;
}

export async function setSyncMeta(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO sync_meta (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
    [key, value],
  );
}

export async function getSyncQueueCount(): Promise<number> {
  const db = await getDb();
  const [row] = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM sync_queue",
  );
  return row?.count ?? 0;
}

/**
 * Insert or update a note from a remote sync pull.
 * Does NOT enqueue a sync action (to avoid echo loops).
 */
export async function upsertNoteFromRemote(note: Note): Promise<void> {
  const db = await getDb();
  const existing = await db.select<{ id: string; updated_at: string }[]>(
    "SELECT id, updated_at FROM notes WHERE id = $1",
    [note.id],
  );

  const tagsJson = JSON.stringify(note.tags ?? []);

  if (existing.length > 0) {
    // LWW: skip if local is newer
    if (existing[0].updated_at > note.updatedAt) return;

    await db.execute(
      `UPDATE notes SET title = $1, content = $2, folder_id = $3, tags = $4,
       summary = $5, favorite = $6, sort_order = $7, updated_at = $8,
       deleted_at = $9, is_deleted = $10, favorite_sort_order = $11,
       is_local_file = $12, audio_mode = $13, transcript = $14
       WHERE id = $15`,
      [
        note.title,
        note.content,
        note.folderId,
        tagsJson,
        note.summary ?? "",
        note.favorite ? 1 : 0,
        note.sortOrder,
        note.updatedAt,
        note.deletedAt,
        note.deletedAt ? 1 : 0,
        note.favoriteSortOrder,
        note.isLocalFile ? 1 : 0,
        note.audioMode,
        note.transcript,
        note.id,
      ],
    );
  } else {
    await db.execute(
      `INSERT INTO notes (id, title, content, folder_id, tags, summary, favorite, sort_order,
       created_at, updated_at, deleted_at, is_deleted, favorite_sort_order, is_local_file, audio_mode, transcript)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        note.id,
        note.title,
        note.content,
        note.folderId,
        tagsJson,
        note.summary ?? "",
        note.favorite ? 1 : 0,
        note.sortOrder,
        note.createdAt,
        note.updatedAt,
        note.deletedAt,
        note.deletedAt ? 1 : 0,
        note.favoriteSortOrder,
        note.isLocalFile ? 1 : 0,
        note.audioMode,
        note.transcript,
      ],
    );
  }

  // Update FTS index (only if not deleted)
  if (!note.deletedAt) {
    await ftsUpdate(note.id, note.title, note.content, tagsJson);
  } else {
    await ftsDelete(note.id);
  }
}

/**
 * Insert or update a folder from a remote sync pull.
 */
export async function upsertFolderFromRemote(folder: FolderSyncData): Promise<void> {
  const db = await getDb();
  const existing = await db.select<{ id: string }[]>(
    "SELECT id FROM folders WHERE id = $1",
    [folder.id],
  );

  if (existing.length > 0) {
    await db.execute(
      `UPDATE folders SET name = $1, parent_id = $2, sort_order = $3, favorite = $4,
       updated_at = $5, deleted_at = $6
       WHERE id = $7`,
      [
        folder.name,
        folder.parentId,
        folder.sortOrder,
        folder.favorite ? 1 : 0,
        folder.updatedAt,
        folder.deletedAt,
        folder.id,
      ],
    );
  } else {
    await db.execute(
      `INSERT INTO folders (id, name, parent_id, sort_order, favorite, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        folder.id,
        folder.name,
        folder.parentId,
        folder.sortOrder,
        folder.favorite ? 1 : 0,
        folder.createdAt,
        folder.updatedAt,
        folder.deletedAt,
      ],
    );
  }
}

/**
 * Soft-delete a note from a remote sync pull.
 */
export async function softDeleteNoteFromRemote(
  noteId: string,
  timestamp: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE notes SET is_deleted = 1, deleted_at = $1, updated_at = $1, favorite = 0 WHERE id = $2",
    [timestamp, noteId],
  );
  await ftsDelete(noteId);
}

/**
 * Soft-delete a folder from a remote sync pull, unfile its notes.
 */
export async function softDeleteFolderFromRemote(folderId: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();

  // Unfile notes in this folder
  await db.execute(
    "UPDATE notes SET folder_id = NULL WHERE folder_id = $1",
    [folderId],
  );

  // Soft-delete the folder
  await db.execute(
    "UPDATE folders SET deleted_at = $1, updated_at = $1 WHERE id = $2",
    [now, folderId],
  );
}

// ---------------------------------------------------------------------------
// Local File Support
// ---------------------------------------------------------------------------

/**
 * Link a note to a local file on disk.
 */
export async function linkNoteToLocalFile(
  noteId: string,
  localPath: string,
  localFileHash: string,
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute(
    "UPDATE notes SET is_local_file = 1, local_path = $1, local_file_hash = $2, updated_at = $3 WHERE id = $4",
    [localPath, localFileHash, now, noteId],
  );
  enqueueSyncAction("update", noteId, "note").catch(() => {});
}

/**
 * Unlink a note from its local file (convert to cloud-only).
 */
export async function unlinkLocalFile(noteId: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute(
    "UPDATE notes SET is_local_file = 0, local_path = NULL, local_file_hash = NULL, updated_at = $1 WHERE id = $2",
    [now, noteId],
  );
  enqueueSyncAction("update", noteId, "note").catch(() => {});
}

/**
 * Update the stored hash for a local file note.
 */
export async function updateLocalFileHash(
  noteId: string,
  hash: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE notes SET local_file_hash = $1 WHERE id = $2",
    [hash, noteId],
  );
}

/**
 * Fetch all notes linked to local files.
 */
export async function fetchLocalFileNotes(): Promise<(Note & { localPath: string; localFileHash: string | null })[]> {
  const db = await getDb();
  const rows = await db.select<NoteRow[]>(
    "SELECT * FROM notes WHERE is_local_file = 1 AND local_path IS NOT NULL AND is_deleted = 0",
  );
  return rows.map((row) => ({
    ...rowToNote(row),
    localPath: row.local_path!,
    localFileHash: row.local_file_hash,
  }));
}

/**
 * Find a note by its local file path (for duplicate detection).
 */
export async function findNoteByLocalPath(path: string): Promise<Note | null> {
  const db = await getDb();
  const rows = await db.select<NoteRow[]>(
    "SELECT * FROM notes WHERE local_path = $1 AND is_deleted = 0",
    [path],
  );
  return rows.length > 0 ? rowToNote(rows[0]) : null;
}

/**
 * Get the local_path for a note (desktop-only column).
 */
export async function getNoteLocalPath(noteId: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ local_path: string | null }[]>(
    "SELECT local_path FROM notes WHERE id = $1",
    [noteId],
  );
  return rows.length > 0 ? rows[0].local_path : null;
}

/**
 * Get the local_file_hash for a note (desktop-only column).
 */
export async function getNoteLocalFileHash(noteId: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ local_file_hash: string | null }[]>(
    "SELECT local_file_hash FROM notes WHERE id = $1",
    [noteId],
  );
  return rows.length > 0 ? rows[0].local_file_hash : null;
}

export async function fetchRecentlyEditedNotes(limit = 10): Promise<Note[]> {
  const db = await getDb();
  const rows = await db.select<NoteRow[]>(
    `SELECT * FROM notes WHERE is_deleted = 0 ORDER BY updated_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map(rowToNote);
}

export async function fetchAudioNotes(limit = 10): Promise<Note[]> {
  const db = await getDb();
  const rows = await db.select<NoteRow[]>(
    `SELECT * FROM notes WHERE audio_mode IS NOT NULL AND is_deleted = 0 ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map(rowToNote);
}

// --- Images ---

export async function upsertImageFromRemote(image: ImageSyncData): Promise<void> {
  const db = await getDb();
  const existing = await db.select<{ id: string; updated_at: string }[]>(
    "SELECT id, updated_at FROM images WHERE id = $1",
    [image.id],
  );

  if (existing.length > 0) {
    if (existing[0].updated_at > image.updatedAt) return;

    await db.execute(
      `UPDATE images SET note_id = $1, filename = $2, mime_type = $3, size_bytes = $4,
       r2_key = $5, r2_url = $6, alt_text = $7, ai_description = $8, sort_order = $9,
       updated_at = $10, deleted_at = $11
       WHERE id = $12`,
      [
        image.noteId,
        image.filename,
        image.mimeType,
        image.sizeBytes,
        image.r2Key,
        image.r2Url,
        image.altText,
        image.aiDescription,
        image.sortOrder,
        image.updatedAt,
        image.deletedAt,
        image.id,
      ],
    );
  } else {
    await db.execute(
      `INSERT INTO images (id, note_id, filename, mime_type, size_bytes, r2_key, r2_url,
       alt_text, ai_description, sort_order, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        image.id,
        image.noteId,
        image.filename,
        image.mimeType,
        image.sizeBytes,
        image.r2Key,
        image.r2Url,
        image.altText,
        image.aiDescription,
        image.sortOrder,
        image.createdAt,
        image.updatedAt,
        image.deletedAt,
      ],
    );
  }
}

export async function softDeleteImageFromRemote(imageId: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute(
    "UPDATE images SET deleted_at = $1, updated_at = $1 WHERE id = $2",
    [now, imageId],
  );
}

export async function createLocalImage(data: {
  id: string;
  noteId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  r2Key: string;
  r2Url: string;
  altText: string;
  syncStatus: string;
}): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO images (id, note_id, filename, mime_type, size_bytes, r2_key, r2_url,
     alt_text, sync_status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
    [
      data.id, data.noteId, data.filename, data.mimeType, data.sizeBytes,
      data.r2Key, data.r2Url, data.altText, data.syncStatus, now,
    ],
  );
}

export async function updateImageAfterUpload(
  imageId: string,
  r2Key: string,
  r2Url: string,
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute(
    "UPDATE images SET r2_key = $1, r2_url = $2, sync_status = 'synced', updated_at = $3 WHERE id = $4",
    [r2Key, r2Url, now, imageId],
  );
}

export async function fetchPendingImageUploads(): Promise<
  { id: string; noteId: string; filename: string; mimeType: string; sizeBytes: number }[]
> {
  const db = await getDb();
  return db.select(
    "SELECT id, note_id as noteId, filename, mime_type as mimeType, size_bytes as sizeBytes FROM images WHERE sync_status = 'pending_upload' AND deleted_at IS NULL",
  );
}

export async function fetchImageById(imageId: string): Promise<ImageSyncData | null> {
  const db = await getDb();
  const rows = await db.select<{
    id: string; note_id: string; filename: string; mime_type: string;
    size_bytes: number; r2_key: string; r2_url: string; alt_text: string;
    ai_description: string | null; sort_order: number;
    created_at: string; updated_at: string; deleted_at: string | null;
  }[]>("SELECT * FROM images WHERE id = $1", [imageId]);
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    noteId: r.note_id,
    filename: r.filename,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    r2Key: r.r2_key,
    r2Url: r.r2_url,
    altText: r.alt_text,
    aiDescription: r.ai_description,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  };
}

// --- Data migrations ---

const FRONTMATTER_MIGRATION_KEY = "frontmatter_migrated";

/**
 * One-time data migration: inject YAML frontmatter into existing notes that
 * don't have it yet. Checks a flag in sync_meta so it only runs once.
 * Safe to call on every app startup — returns immediately if already done.
 */
export async function migrateFrontmatter(): Promise<void> {
  const done = await getSyncMeta(FRONTMATTER_MIGRATION_KEY);
  if (done === "1") return;

  const db = await getDb();
  const { hasFrontmatter: hasFm, injectFrontmatter: injectFm } = await import(
    "@derekentringer/ns-shared"
  );

  // Fetch all notes (including soft-deleted)
  const rows = await db.select<
    {
      id: string;
      title: string;
      content: string;
      tags: string;
      summary: string | null;
      favorite: number;
      created_at: string;
      updated_at: string;
    }[]
  >("SELECT id, title, content, tags, summary, favorite, created_at, updated_at FROM notes");

  let updated = 0;
  for (const row of rows) {
    if (hasFm(row.content)) continue;

    let tags: string[] = [];
    try {
      tags = JSON.parse(row.tags);
    } catch {
      /* ignore */
    }

    const newContent = injectFm(row.content, {
      title: row.title || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      tags: tags.length > 0 ? tags : undefined,
      summary: row.summary || undefined,
      favorite: row.favorite === 1 || undefined,
    });

    await db.execute("UPDATE notes SET content = $1 WHERE id = $2", [
      newContent,
      row.id,
    ]);

    // Update FTS index
    await ftsUpdate(
      row.id,
      row.title,
      newContent,
      row.tags,
    );

    updated++;
  }

  await setSyncMeta(FRONTMATTER_MIGRATION_KEY, "1");
  if (updated > 0) {
    console.log(`[frontmatter migration] Updated ${updated} of ${rows.length} notes`);
  }
}
