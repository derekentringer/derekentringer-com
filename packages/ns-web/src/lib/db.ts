import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Note, FolderInfo, TagInfo } from "@derekentringer/shared/ns";

const DB_NAME = "notesync-cache";
const DB_VERSION = 1;
const MAX_CACHED_NOTES = 100;

export interface OfflineQueueEntry {
  id?: number;
  noteId: string;
  action: "create" | "update" | "delete";
  payload: Record<string, unknown>;
  timestamp: number;
}

interface CachedFolders {
  key: "tree";
  folders: FolderInfo[];
  cachedAt: number;
}

interface CachedTags {
  key: "list";
  tags: TagInfo[];
  cachedAt: number;
}

interface NoteSyncDB extends DBSchema {
  notes: {
    key: string;
    value: Note;
    indexes: { "by-updatedAt": string };
  };
  noteList: {
    key: string;
    value: Note;
    indexes: { "by-updatedAt": string };
  };
  offlineQueue: {
    key: number;
    value: OfflineQueueEntry;
    indexes: { "by-noteId": string };
  };
  meta: {
    key: string;
    value: { key: string; value: unknown };
  };
  folders: {
    key: string;
    value: CachedFolders;
  };
  tags: {
    key: string;
    value: CachedTags;
  };
}

let dbInstance: IDBPDatabase<NoteSyncDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<NoteSyncDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<NoteSyncDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const notesStore = db.createObjectStore("notes", { keyPath: "id" });
      notesStore.createIndex("by-updatedAt", "updatedAt");

      const noteListStore = db.createObjectStore("noteList", { keyPath: "id" });
      noteListStore.createIndex("by-updatedAt", "updatedAt");

      const queueStore = db.createObjectStore("offlineQueue", {
        keyPath: "id",
        autoIncrement: true,
      });
      queueStore.createIndex("by-noteId", "noteId");

      db.createObjectStore("meta", { keyPath: "key" });
      db.createObjectStore("folders", { keyPath: "key" });
      db.createObjectStore("tags", { keyPath: "key" });
    },
  });

  return dbInstance;
}

async function enforceNoteLimit(db: IDBPDatabase<NoteSyncDB>) {
  const count = await db.count("notes");
  if (count <= MAX_CACHED_NOTES) return;

  const excess = count - MAX_CACHED_NOTES;
  const tx = db.transaction("notes", "readwrite");
  let cursor = await tx.store.index("by-updatedAt").openCursor();
  let deleted = 0;

  while (cursor && deleted < excess) {
    await cursor.delete();
    deleted++;
    cursor = await cursor.continue();
  }

  await tx.done;
}

export async function cacheNote(note: Note): Promise<void> {
  const db = await getDB();
  await db.put("notes", note);
  await enforceNoteLimit(db);
}

export async function cacheNotes(notes: Note[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("notes", "readwrite");
  for (const note of notes) {
    await tx.store.put(note);
  }
  await tx.done;
  await enforceNoteLimit(db);
}

export async function getCachedNote(id: string): Promise<Note | undefined> {
  const db = await getDB();
  return db.get("notes", id);
}

export async function getAllCachedNotes(): Promise<Note[]> {
  const db = await getDB();
  return db.getAll("notes");
}

export async function deleteCachedNote(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("notes", id);
}

export async function cacheNoteList(notes: Note[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("noteList", "readwrite");
  await tx.store.clear();
  for (const note of notes) {
    await tx.store.put({ ...note, content: "" });
  }
  await tx.done;
}

export async function getCachedNoteList(): Promise<Note[]> {
  const db = await getDB();
  return db.getAll("noteList");
}

export async function cacheFolders(folders: FolderInfo[]): Promise<void> {
  const db = await getDB();
  await db.put("folders", { key: "tree", folders, cachedAt: Date.now() });
}

export async function getCachedFolders(): Promise<FolderInfo[] | null> {
  const db = await getDB();
  const entry = await db.get("folders", "tree");
  return entry ? entry.folders : null;
}

export async function cacheTags(tags: TagInfo[]): Promise<void> {
  const db = await getDB();
  await db.put("tags", { key: "list", tags, cachedAt: Date.now() });
}

export async function getCachedTags(): Promise<TagInfo[] | null> {
  const db = await getDB();
  const entry = await db.get("tags", "list");
  return entry ? entry.tags : null;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await getDB();
  await db.put("meta", { key, value });
}

export async function getMeta(key: string): Promise<unknown | undefined> {
  const db = await getDB();
  const entry = await db.get("meta", key);
  return entry?.value;
}

export async function clearAllCaches(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(
    ["notes", "noteList", "offlineQueue", "meta", "folders", "tags"],
    "readwrite",
  );
  await tx.objectStore("notes").clear();
  await tx.objectStore("noteList").clear();
  await tx.objectStore("offlineQueue").clear();
  await tx.objectStore("meta").clear();
  await tx.objectStore("folders").clear();
  await tx.objectStore("tags").clear();
  await tx.done;
}

/** Reset the singleton for testing */
export function resetDB(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
