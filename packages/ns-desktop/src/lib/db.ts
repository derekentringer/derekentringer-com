import Database from "@tauri-apps/plugin-sql";
import { v4 as uuidv4 } from "uuid";
import type { Note } from "@derekentringer/ns-shared";

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

export async function fetchNotes(): Promise<Note[]> {
  const db = await getDb();
  const rows = await db.select<NoteRow[]>(
    "SELECT * FROM notes WHERE is_deleted = 0 ORDER BY updated_at DESC",
  );
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
}

export async function hardDeleteNote(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM notes WHERE id = $1", [id]);
}
