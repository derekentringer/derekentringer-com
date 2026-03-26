import type { Note, FolderInfo } from "@derekentringer/ns-shared";
import { getDatabase } from "./database";

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
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export async function getAllNotes(params?: {
  folderId?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
}): Promise<Note[]> {
  const db = await getDatabase();

  let sql = "SELECT * FROM notes WHERE deleted_at IS NULL";
  const args: (string | number)[] = [];

  if (params?.folderId) {
    sql += " AND folder_id = ?";
    args.push(params.folderId);
  }

  if (params?.search) {
    sql += " AND (title LIKE ? OR content LIKE ?)";
    const term = `%${params.search}%`;
    args.push(term, term);
  }

  const sortCol =
    params?.sortBy === "title"
      ? "title"
      : params?.sortBy === "createdAt"
        ? "created_at"
        : "updated_at";
  const sortDir = params?.sortOrder === "asc" ? "ASC" : "DESC";
  sql += ` ORDER BY ${sortCol} ${sortDir}`;

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

export async function getFolders(): Promise<FolderInfo[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<FolderRow>(
    "SELECT * FROM folders WHERE deleted_at IS NULL ORDER BY sort_order ASC",
  );

  // Build flat list with counts (counts are server-side, default to 0 locally)
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    sortOrder: row.sort_order,
    favorite: row.favorite === 1,
    count: 0,
    totalCount: 0,
    createdAt: row.created_at,
    children: [],
  }));
}

export async function upsertFolders(
  folders: FolderInfo[],
): Promise<void> {
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

export async function searchNotes(query: string): Promise<Note[]> {
  const db = await getDatabase();
  const term = `%${query}%`;
  const rows = await db.getAllAsync<NoteRow>(
    "SELECT * FROM notes WHERE deleted_at IS NULL AND (title LIKE ? OR content LIKE ?) ORDER BY updated_at DESC LIMIT 50",
    [term, term],
  );
  return rows.map(rowToNote);
}
