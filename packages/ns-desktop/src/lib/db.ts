import Database from "@tauri-apps/plugin-sql";
import { v4 as uuidv4 } from "uuid";
import type {
  Note,
  FolderInfo,
  TagInfo,
  NoteSearchResult,
  NoteSortField,
  SortOrder,
} from "@derekentringer/ns-shared";

let dbInstance: Database | null = null;

async function getDb(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await Database.load("sqlite:notesync.db");
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

export async function fetchNotes(options?: FetchNotesOptions): Promise<Note[]> {
  const db = await getDb();

  const whereClauses = ["is_deleted = 0"];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (options?.folderId !== undefined) {
    if (options.folderId === null) {
      whereClauses.push("folder_id IS NULL");
    } else {
      whereClauses.push(`folder_id = $${paramIdx}`);
      params.push(options.folderId);
      paramIdx++;
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

  const sql = `SELECT * FROM notes WHERE ${whereClauses.join(" AND ")} ORDER BY ${orderColumn} ${orderDir}`;
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
}

export async function createNote(data: CreateNoteInput): Promise<Note> {
  const db = await getDb();
  const id = uuidv4();
  const now = new Date().toISOString();
  const title = data.title ?? "";
  const content = data.content ?? "";
  const folderId = data.folderId ?? null;

  await db.execute(
    `INSERT INTO notes (id, title, content, folder_id, is_deleted, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 0, $5, $5)`,
    [id, title, content, folderId, now],
  );

  // Sync to FTS
  await ftsInsert(id, title, content, "[]");

  // Re-read the row to get all column values including migration-002 defaults
  const note = await fetchNoteById(id);
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
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

export async function updateNote(
  id: string,
  data: Partial<Pick<Note, "title" | "content" | "tags" | "summary" | "favorite" | "sortOrder" | "folderId">>,
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
  return note;
}

export async function softDeleteNote(id: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute(
    "UPDATE notes SET is_deleted = 1, deleted_at = $1, updated_at = $1 WHERE id = $2",
    [now, id],
  );
  await ftsDelete(id);
}

export async function hardDeleteNote(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM notes WHERE id = $1", [id]);
  await ftsDelete(id);
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export async function searchNotes(query: string): Promise<NoteSearchResult[]> {
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

export async function fetchFolders(): Promise<FolderInfo[]> {
  const db = await getDb();
  const folderRows = await db.select<FolderRow[]>(
    "SELECT * FROM folders ORDER BY sort_order ASC, name ASC",
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
}

export async function deleteFolder(
  id: string,
  mode: "move-up" | "recursive",
): Promise<void> {
  const db = await getDb();

  if (mode === "move-up") {
    // Get this folder's parent
    const [folder] = await db.select<FolderRow[]>(
      "SELECT * FROM folders WHERE id = $1",
      [id],
    );
    const parentId = folder?.parent_id ?? null;

    // Move child folders to parent
    await db.execute(
      "UPDATE folders SET parent_id = $1 WHERE parent_id = $2",
      [parentId, id],
    );

    // Move notes to parent folder
    await db.execute(
      "UPDATE notes SET folder_id = $1 WHERE folder_id = $2",
      [parentId, id],
    );

    // Delete the folder
    await db.execute("DELETE FROM folders WHERE id = $1", [id]);
  } else {
    // Recursive: collect all descendant folder IDs
    const allIds = await collectDescendantFolderIds(id);
    allIds.push(id);

    // Get all notes in these folders to clean up FTS
    for (const folderId of allIds) {
      const noteRows = await db.select<{ id: string }[]>(
        "SELECT id FROM notes WHERE folder_id = $1",
        [folderId],
      );
      // Unfiled these notes (don't delete notes, just remove folder association)
      for (const noteRow of noteRows) {
        await db.execute(
          "UPDATE notes SET folder_id = NULL WHERE id = $1",
          [noteRow.id],
        );
      }
    }

    // Delete all folders (children first, parent last)
    for (const folderId of allIds.reverse()) {
      await db.execute("DELETE FROM folders WHERE id = $1", [folderId]);
    }
  }
}

async function collectDescendantFolderIds(parentId: string): Promise<string[]> {
  const db = await getDb();
  const children = await db.select<{ id: string }[]>(
    "SELECT id FROM folders WHERE parent_id = $1",
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
}
