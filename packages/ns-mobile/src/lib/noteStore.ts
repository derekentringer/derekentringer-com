import * as Crypto from "expo-crypto";
import type { Note, FolderInfo, FolderSyncData } from "@derekentringer/ns-shared";
import { getDatabase } from "./database";
import type { SyncQueueEntry } from "./types";

// ─── Row types ─────────────────────────────────────────────

interface NoteRow {
  id: string;
  title: string;
  content: string;
  folder: string | null;
  folder_id: string | null;
  folder_path: string | null;
  tags: string;
  summary: string | null;
  favorite: number;
  sort_order: number;
  favorite_sort_order: number;
  audio_mode: string | null;
  transcript: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_status: string;
  remote_id: string | null;
}

interface FolderRow {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  favorite: number;
  is_local_file: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ─── Row mappers ───────────────────────────────────────────

function rowToNote(row: NoteRow): Note {
  let tags: string[] = [];
  try {
    tags = JSON.parse(row.tags);
  } catch {
    tags = [];
  }

  return {
    id: row.id,
    title: row.title,
    content: row.content,
    folder: row.folder,
    folderId: row.folder_id,
    folderPath: row.folder_path,
    tags,
    summary: row.summary,
    favorite: row.favorite === 1,
    sortOrder: row.sort_order,
    favoriteSortOrder: row.favorite_sort_order,
    isLocalFile: false,
    audioMode: row.audio_mode as Note["audioMode"],
    transcript: row.transcript ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

// ─── Sync queue functions ──────────────────────────────────

export async function enqueueSyncAction(
  action: string,
  entityId: string,
  entityType: "note" | "folder",
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT INTO sync_queue (entity_id, entity_type, action, created_at) VALUES (?, ?, ?, ?)",
    [entityId, entityType, action, new Date().toISOString()],
  );
}

export async function readSyncQueue(limit: number): Promise<SyncQueueEntry[]> {
  const db = await getDatabase();
  return db.getAllAsync<SyncQueueEntry>(
    "SELECT * FROM sync_queue ORDER BY id ASC LIMIT ?",
    [limit],
  );
}

export async function removeSyncQueueEntries(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDatabase();
  const placeholders = ids.map(() => "?").join(",");
  await db.runAsync(
    `DELETE FROM sync_queue WHERE id IN (${placeholders})`,
    ids,
  );
}

export async function getSyncQueueCount(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM sync_queue",
  );
  return row?.count ?? 0;
}

// ─── Sync meta (KV store) ──────────────────────────────────

export async function getSyncMeta(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string | null }>(
    "SELECT value FROM sync_meta WHERE key = ?",
    [key],
  );
  return row?.value ?? null;
}

export async function setSyncMeta(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)",
    [key, value],
  );
}

// ─── Remote upsert functions (pull — do NOT enqueue) ───────

export async function upsertNoteFromRemote(note: Note): Promise<void> {
  const db = await getDatabase();

  // LWW: skip if local updatedAt is newer
  const existing = await db.getFirstAsync<{ updated_at: string; deleted_at: string | null }>(
    "SELECT updated_at, deleted_at FROM notes WHERE id = ?",
    [note.id],
  );
  if (existing && !existing.deleted_at && existing.updated_at > note.updatedAt) {
    return; // Local is newer, skip
  }

  await db.runAsync(
    `INSERT OR REPLACE INTO notes (
      id, title, content, folder, folder_id, folder_path, tags, summary,
      favorite, sort_order, favorite_sort_order, audio_mode,
      created_at, updated_at, deleted_at, sync_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
    [
      note.id,
      note.title,
      note.content,
      note.folder ?? null,
      note.folderId ?? null,
      note.folderPath ?? null,
      JSON.stringify(note.tags),
      note.summary ?? null,
      note.favorite ? 1 : 0,
      note.sortOrder,
      note.favoriteSortOrder,
      note.audioMode ?? null,
      note.createdAt,
      note.updatedAt,
      note.deletedAt ?? null,
    ],
  );

  // Update FTS
  if (!note.deletedAt) {
    await ftsUpsert(note.id, note.title, note.content, note.tags);
  } else {
    await ftsDelete(note.id);
  }
}

export async function upsertFolderFromRemote(folder: FolderSyncData): Promise<void> {
  const db = await getDatabase();

  // LWW: skip if local updatedAt is newer
  const existing = await db.getFirstAsync<{ updated_at: string; deleted_at: string | null }>(
    "SELECT updated_at, deleted_at FROM folders WHERE id = ?",
    [folder.id],
  );
  if (existing && !existing.deleted_at && existing.updated_at > folder.updatedAt) {
    return;
  }

  await db.runAsync(
    `INSERT OR REPLACE INTO folders (
      id, name, parent_id, sort_order, favorite, is_local_file, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      folder.id,
      folder.name,
      folder.parentId ?? null,
      folder.sortOrder,
      folder.favorite ? 1 : 0,
      folder.isLocalFile ? 1 : 0,
      folder.createdAt,
      folder.updatedAt,
      folder.deletedAt ?? null,
    ],
  );
}

export async function softDeleteNoteFromRemote(noteId: string, timestamp: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE notes SET deleted_at = ?, sync_status = 'synced' WHERE id = ?",
    [timestamp, noteId],
  );
  await ftsDelete(noteId);
}

export async function softDeleteFolderFromRemote(folderId: string, timestamp: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE folders SET deleted_at = ? WHERE id = ?",
    [timestamp, folderId],
  );
}

/**
 * Hard-delete a note from a remote tombstone (Phase 1.5). Mobile has no
 * on-disk file mirroring, so this is just a local SQLite + FTS cleanup.
 */
export async function hardDeleteNoteFromRemote(noteId: string): Promise<void> {
  const db = await getDatabase();
  await ftsDelete(noteId);
  await db.runAsync("DELETE FROM notes WHERE id = ?", [noteId]);
}

/**
 * Hard-delete a folder from a remote tombstone (Phase 1.5). Unfiles any
 * notes defensively then removes the row.
 */
export async function hardDeleteFolderFromRemote(folderId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE notes SET folder_id = NULL WHERE folder_id = ?",
    [folderId],
  );
  await db.runAsync("DELETE FROM folders WHERE id = ?", [folderId]);
}

// ─── Local CRUD functions (mutations — DO enqueue) ─────────

export async function createNoteLocal(data: {
  title: string;
  content?: string;
  folder?: string;
  folderId?: string;
  tags?: string[];
  audioMode?: string;
}): Promise<Note> {
  const db = await getDatabase();
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();
  const tags = data.tags ?? [];

  await db.runAsync(
    `INSERT INTO notes (
      id, title, content, folder, folder_id, tags, summary,
      favorite, sort_order, favorite_sort_order, audio_mode,
      created_at, updated_at, sync_status
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, 0, 0, 0, ?, ?, ?, 'pending')`,
    [
      id,
      data.title,
      data.content ?? "",
      data.folder ?? null,
      data.folderId ?? null,
      JSON.stringify(tags),
      data.audioMode ?? null,
      now,
      now,
    ],
  );

  await enqueueSyncAction("create", id, "note");
  await ftsInsert(id, data.title, data.content ?? "", tags);

  return {
    id,
    title: data.title,
    content: data.content ?? "",
    folder: data.folder ?? null,
    folderId: data.folderId ?? null,
    folderPath: null,
    tags,
    summary: null,
    favorite: false,
    sortOrder: 0,
    favoriteSortOrder: 0,
    isLocalFile: false,
    audioMode: (data.audioMode as Note["audioMode"]) ?? null,
    transcript: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

export async function updateNoteLocal(
  id: string,
  changes: {
    title?: string;
    content?: string;
    folder?: string | null;
    folderId?: string | null;
    tags?: string[];
    summary?: string | null;
    favorite?: boolean;
  },
): Promise<Note | null> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  const sets: string[] = ["updated_at = ?", "sync_status = 'pending'"];
  const args: (string | number | null)[] = [now];

  if (changes.title !== undefined) {
    sets.push("title = ?");
    args.push(changes.title);
  }
  if (changes.content !== undefined) {
    sets.push("content = ?");
    args.push(changes.content);
  }
  if (changes.folder !== undefined) {
    sets.push("folder = ?");
    args.push(changes.folder ?? null);
  }
  if (changes.folderId !== undefined) {
    sets.push("folder_id = ?");
    args.push(changes.folderId ?? null);
  }
  if (changes.tags !== undefined) {
    sets.push("tags = ?");
    args.push(JSON.stringify(changes.tags));
  }
  if (changes.summary !== undefined) {
    sets.push("summary = ?");
    args.push(changes.summary ?? null);
  }
  if (changes.favorite !== undefined) {
    sets.push("favorite = ?");
    args.push(changes.favorite ? 1 : 0);
  }

  args.push(id);
  await db.runAsync(
    `UPDATE notes SET ${sets.join(", ")} WHERE id = ?`,
    args,
  );

  await enqueueSyncAction("update", id, "note");

  // Update FTS if text fields changed
  const note = await getNote(id);
  if (note && !note.deletedAt) {
    await ftsUpsert(note.id, note.title, note.content, note.tags);
  }

  return note;
}

export async function deleteNoteLocal(id: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    "UPDATE notes SET deleted_at = ?, sync_status = 'pending' WHERE id = ?",
    [now, id],
  );
  await enqueueSyncAction("delete", id, "note");
  await ftsDelete(id);
}

export async function toggleFavoriteLocal(id: string, favorite: boolean): Promise<Note | null> {
  return updateNoteLocal(id, { favorite });
}

export async function createFolderLocal(name: string, parentId?: string): Promise<FolderInfo> {
  const db = await getDatabase();
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO folders (id, name, parent_id, sort_order, favorite, created_at, updated_at)
     VALUES (?, ?, ?, 0, 0, ?, ?)`,
    [id, name, parentId ?? null, now, now],
  );

  await enqueueSyncAction("create", id, "folder");

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

export async function renameFolderLocal(id: string, name: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    "UPDATE folders SET name = ?, updated_at = ? WHERE id = ?",
    [name, now, id],
  );
  await enqueueSyncAction("update", id, "folder");
}

export async function deleteFolderLocal(id: string, _mode?: "move-up" | "recursive"): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    "UPDATE folders SET deleted_at = ? WHERE id = ?",
    [now, id],
  );
  await enqueueSyncAction("delete", id, "folder");
}

export async function restoreNoteLocal(id: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    "UPDATE notes SET deleted_at = NULL, updated_at = ?, sync_status = 'pending' WHERE id = ?",
    [now, id],
  );
  await enqueueSyncAction("update", id, "note");

  // Re-add to FTS
  const note = await getNote(id);
  if (note) {
    await ftsInsert(note.id, note.title, note.content, note.tags);
  }
}

// ─── Read functions ────────────────────────────────────────

export async function getAllNotes(params?: {
  folderId?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
  favorite?: boolean;
  limit?: number;
  deletedOnly?: boolean;
  tags?: string[];
}): Promise<Note[]> {
  const db = await getDatabase();

  if (params?.search) {
    return searchNotes(params.search);
  }

  let sql: string;
  const args: (string | number)[] = [];

  if (params?.deletedOnly) {
    sql = "SELECT * FROM notes WHERE deleted_at IS NOT NULL";
  } else {
    sql = "SELECT * FROM notes WHERE deleted_at IS NULL";
  }

  if (params?.folderId) {
    sql += " AND folder_id = ?";
    args.push(params.folderId);
  }

  if (params?.favorite) {
    sql += " AND favorite = 1";
  }

  if (params?.tags && params.tags.length > 0) {
    for (const tag of params.tags) {
      sql += " AND tags LIKE ?";
      args.push(`%"${tag}"%`);
    }
  }

  const sortCol =
    params?.sortBy === "title"
      ? "title"
      : params?.sortBy === "createdAt"
        ? "created_at"
        : "updated_at";
  const sortDir = params?.sortOrder === "asc" ? "ASC" : "DESC";
  sql += ` ORDER BY ${sortCol} ${sortDir}`;

  if (params?.limit) {
    sql += " LIMIT ?";
    args.push(params.limit);
  }

  const rows = await db.getAllAsync<NoteRow>(sql, args);
  return rows.map(rowToNote);
}

export async function getNote(id: string): Promise<Note | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<NoteRow>(
    "SELECT * FROM notes WHERE id = ?",
    [id],
  );
  return row ? rowToNote(row) : null;
}

export async function getDashboardData(): Promise<{
  favorites: Note[];
  recentlyEdited: Note[];
}> {
  const favorites = await getAllNotes({ favorite: true, limit: 10 });
  const recentlyEdited = await getAllNotes({ sortBy: "updatedAt", sortOrder: "desc", limit: 10 });
  return { favorites, recentlyEdited };
}

export async function getFolders(): Promise<FolderInfo[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<FolderRow>(
    "SELECT * FROM folders WHERE deleted_at IS NULL ORDER BY sort_order ASC",
  );

  // Compute note counts per folder
  const countRows = await db.getAllAsync<{ folder_id: string; count: number }>(
    "SELECT folder_id, COUNT(*) as count FROM notes WHERE deleted_at IS NULL AND folder_id IS NOT NULL GROUP BY folder_id",
  );
  const countMap = new Map(countRows.map((r) => [r.folder_id, r.count]));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    sortOrder: row.sort_order,
    favorite: row.favorite === 1,
    isLocalFile: (row.is_local_file ?? 0) === 1,
    count: countMap.get(row.id) ?? 0,
    totalCount: countMap.get(row.id) ?? 0,
    createdAt: row.created_at,
    children: [],
  }));
}

export async function upsertNotes(notes: Note[]): Promise<void> {
  const db = await getDatabase();

  for (const note of notes) {
    await db.runAsync(
      `INSERT OR REPLACE INTO notes (
        id, title, content, folder, folder_id, folder_path, tags, summary,
        favorite, sort_order, favorite_sort_order, audio_mode,
        created_at, updated_at, deleted_at, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
      [
        note.id,
        note.title,
        note.content,
        note.folder ?? null,
        note.folderId ?? null,
        note.folderPath ?? null,
        JSON.stringify(note.tags),
        note.summary ?? null,
        note.favorite ? 1 : 0,
        note.sortOrder,
        note.favoriteSortOrder,
        note.audioMode ?? null,
        note.createdAt,
        note.updatedAt,
        note.deletedAt ?? null,
      ],
    );
  }
}

export async function upsertFolders(folders: FolderInfo[]): Promise<void> {
  const db = await getDatabase();
  const flatFolders = flattenFolders(folders);
  for (const folder of flatFolders) {
    await db.runAsync(
      `INSERT OR REPLACE INTO folders (
        id, name, parent_id, sort_order, favorite, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        folder.id,
        folder.name,
        folder.parentId ?? null,
        folder.sortOrder,
        folder.favorite ? 1 : 0,
        folder.createdAt,
        new Date().toISOString(),
      ],
    );
  }
}

function flattenFolders(folders: FolderInfo[]): FolderInfo[] {
  const result: FolderInfo[] = [];
  for (const folder of folders) {
    result.push(folder);
    if (folder.children?.length) {
      result.push(...flattenFolders(folder.children));
    }
  }
  return result;
}

export async function getTagsLocal(): Promise<{ name: string; count: number }[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ tag: string }>(
    "SELECT DISTINCT j.value as tag FROM notes, json_each(notes.tags) as j WHERE notes.deleted_at IS NULL",
  );

  // Count occurrences
  const countMap = new Map<string, number>();
  for (const row of rows) {
    countMap.set(row.tag, (countMap.get(row.tag) ?? 0) + 1);
  }

  // Re-query with counts
  const tagCountRows = await db.getAllAsync<{ tag: string; cnt: number }>(
    "SELECT j.value as tag, COUNT(*) as cnt FROM notes, json_each(notes.tags) as j WHERE notes.deleted_at IS NULL GROUP BY j.value ORDER BY cnt DESC",
  );

  return tagCountRows.map((r) => ({ name: r.tag, count: r.cnt }));
}

// ─── FTS functions ─────────────────────────────────────────

async function ftsInsert(noteId: string, title: string, content: string, tags: string[]): Promise<void> {
  const db = await getDatabase();
  // Remove old entry first
  await ftsDelete(noteId);

  const tagsText = tags.join(" ");
  await db.runAsync(
    "INSERT INTO notes_fts (title, content, tags) VALUES (?, ?, ?)",
    [title, content, tagsText],
  );
  const lastId = await db.getFirstAsync<{ last_insert_rowid: number }>(
    "SELECT last_insert_rowid() as last_insert_rowid",
  );
  if (lastId) {
    await db.runAsync(
      "INSERT OR REPLACE INTO fts_map (note_id, fts_rowid) VALUES (?, ?)",
      [noteId, lastId.last_insert_rowid],
    );
  }
}

async function ftsUpsert(noteId: string, title: string, content: string, tags: string[]): Promise<void> {
  await ftsInsert(noteId, title, content, tags);
}

async function ftsDelete(noteId: string): Promise<void> {
  const db = await getDatabase();
  const mapping = await db.getFirstAsync<{ fts_rowid: number }>(
    "SELECT fts_rowid FROM fts_map WHERE note_id = ?",
    [noteId],
  );
  if (mapping) {
    await db.runAsync(
      "INSERT INTO notes_fts (notes_fts, rowid, title, content, tags) VALUES ('delete', ?, '', '', '')",
      [mapping.fts_rowid],
    );
    await db.runAsync("DELETE FROM fts_map WHERE note_id = ?", [noteId]);
  }
}

export async function searchNotes(query: string): Promise<Note[]> {
  const db = await getDatabase();

  // Try FTS5 search first
  try {
    const ftsQuery = query.split(/\s+/).map((t) => `"${t}"`).join(" OR ");
    const rows = await db.getAllAsync<NoteRow>(
      `SELECT n.* FROM notes n
       INNER JOIN fts_map m ON m.note_id = n.id
       INNER JOIN notes_fts f ON f.rowid = m.fts_rowid
       WHERE notes_fts MATCH ? AND n.deleted_at IS NULL
       ORDER BY n.updated_at DESC LIMIT 50`,
      [ftsQuery],
    );
    if (rows.length > 0) return rows.map(rowToNote);
  } catch {
    // FTS not ready, fall through to LIKE
  }

  // Fallback to LIKE search
  const term = `%${query}%`;
  const rows = await db.getAllAsync<NoteRow>(
    "SELECT * FROM notes WHERE deleted_at IS NULL AND (title LIKE ? OR content LIKE ?) ORDER BY updated_at DESC LIMIT 50",
    [term, term],
  );
  return rows.map(rowToNote);
}

export async function rebuildFtsIndex(): Promise<void> {
  const db = await getDatabase();
  // Clear existing FTS data
  await db.execAsync("DELETE FROM fts_map");
  await db.runAsync("INSERT INTO notes_fts (notes_fts) VALUES ('delete-all')");

  // Rebuild from all non-deleted notes
  const notes = await db.getAllAsync<NoteRow>(
    "SELECT * FROM notes WHERE deleted_at IS NULL",
  );
  for (const row of notes) {
    const note = rowToNote(row);
    await ftsInsert(note.id, note.title, note.content, note.tags);
  }
}

// ─── Data readers for sync push ────────────────────────────

export async function readNoteForSync(id: string): Promise<Note | null> {
  const db = await getDatabase();
  // Include deleted notes (needed for delete push)
  const row = await db.getFirstAsync<NoteRow>(
    "SELECT * FROM notes WHERE id = ?",
    [id],
  );
  return row ? rowToNote(row) : null;
}

export async function readFolderForSync(id: string): Promise<FolderSyncData | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<FolderRow>(
    "SELECT * FROM folders WHERE id = ?",
    [id],
  );
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    sortOrder: row.sort_order,
    favorite: row.favorite === 1,
    isLocalFile: (row.is_local_file ?? 0) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}
