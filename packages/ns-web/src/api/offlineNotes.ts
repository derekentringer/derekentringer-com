import type {
  Note,
  CreateNoteRequest,
  UpdateNoteRequest,
  NoteListResponse,
  NoteSortField,
  SortOrder,
  FolderListResponse,
  TagListResponse,
} from "@derekentringer/shared/ns";
import * as api from "./notes.ts";
import {
  cacheNote,
  cacheNotes,
  cacheNoteList,
  getCachedNote,
  getCachedNoteList,
  deleteCachedNote,
  cacheFolders,
  getCachedFolders,
  cacheTags,
  getCachedTags,
  setMeta,
} from "../lib/db.ts";
import { enqueue, removeEntriesForNote } from "../lib/offlineQueue.ts";

export function isTempId(id: string): boolean {
  return id.startsWith("temp-");
}

export async function fetchNotes(params?: {
  folder?: string;
  folderId?: string;
  search?: string;
  searchMode?: "keyword" | "semantic" | "hybrid";
  tags?: string[];
  page?: number;
  pageSize?: number;
  sortBy?: NoteSortField;
  sortOrder?: SortOrder;
}): Promise<NoteListResponse> {
  try {
    const result = await api.fetchNotes(params);
    cacheNoteList(result.notes).catch(() => {});
    cacheNotes(result.notes).catch(() => {});
    setMeta("lastSyncedAt", Date.now()).catch(() => {});
    return result;
  } catch (err) {
    if (!navigator.onLine) {
      const notes = await getCachedNoteList();
      return { notes, total: notes.length };
    }
    throw err;
  }
}

export async function fetchNote(id: string): Promise<Note> {
  try {
    const note = await api.fetchNote(id);
    cacheNote(note).catch(() => {});
    setMeta("lastSyncedAt", Date.now()).catch(() => {});
    return note;
  } catch (err) {
    if (!navigator.onLine) {
      const cached = await getCachedNote(id);
      if (cached) return cached;
      throw new Error("Note not available offline");
    }
    throw err;
  }
}

export async function createNote(data: CreateNoteRequest): Promise<Note> {
  try {
    const note = await api.createNote(data);
    cacheNote(note).catch(() => {});
    setMeta("lastSyncedAt", Date.now()).catch(() => {});
    return note;
  } catch (err) {
    if (!navigator.onLine) {
      const now = new Date().toISOString();
      const tempNote: Note = {
        id: `temp-${crypto.randomUUID()}`,
        title: data.title,
        content: data.content ?? "",
        folder: data.folder ?? null,
        folderId: data.folderId ?? null,
        folderPath: null,
        tags: data.tags ?? [],
        summary: null,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await cacheNote(tempNote);
      await enqueue({
        noteId: tempNote.id,
        action: "create",
        payload: data as unknown as Record<string, unknown>,
        timestamp: Date.now(),
      });
      return tempNote;
    }
    throw err;
  }
}

export async function updateNote(
  id: string,
  data: UpdateNoteRequest,
): Promise<Note> {
  try {
    const note = await api.updateNote(id, data);
    cacheNote(note).catch(() => {});
    setMeta("lastSyncedAt", Date.now()).catch(() => {});
    return note;
  } catch (err) {
    if (!navigator.onLine) {
      const cached = await getCachedNote(id);
      const now = new Date().toISOString();
      const updated: Note = {
        id,
        title: data.title ?? cached?.title ?? "Untitled",
        content: data.content ?? cached?.content ?? "",
        folder: data.folder !== undefined ? data.folder : (cached?.folder ?? null),
        folderId: data.folderId !== undefined ? data.folderId : (cached?.folderId ?? null),
        folderPath: cached?.folderPath ?? null,
        tags: data.tags ?? cached?.tags ?? [],
        summary: data.summary !== undefined ? data.summary : (cached?.summary ?? null),
        sortOrder: cached?.sortOrder ?? 0,
        createdAt: cached?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
      };
      await cacheNote(updated);
      await enqueue({
        noteId: id,
        action: "update",
        payload: data as unknown as Record<string, unknown>,
        timestamp: Date.now(),
      });
      return updated;
    }
    throw err;
  }
}

export async function deleteNote(id: string): Promise<void> {
  try {
    await api.deleteNote(id);
    deleteCachedNote(id).catch(() => {});
    setMeta("lastSyncedAt", Date.now()).catch(() => {});
  } catch (err) {
    if (!navigator.onLine) {
      if (isTempId(id)) {
        await deleteCachedNote(id);
        await removeEntriesForNote(id);
        return;
      }
      await deleteCachedNote(id);
      await enqueue({
        noteId: id,
        action: "delete",
        payload: {},
        timestamp: Date.now(),
      });
      return;
    }
    throw err;
  }
}

export async function fetchFolders(): Promise<FolderListResponse> {
  try {
    const result = await api.fetchFolders();
    cacheFolders(result.folders).catch(() => {});
    return result;
  } catch (err) {
    if (!navigator.onLine) {
      const folders = await getCachedFolders();
      return { folders: folders ?? [] };
    }
    throw err;
  }
}

export async function fetchTags(): Promise<TagListResponse> {
  try {
    const result = await api.fetchTags();
    cacheTags(result.tags).catch(() => {});
    return result;
  } catch (err) {
    if (!navigator.onLine) {
      const tags = await getCachedTags();
      return { tags: tags ?? [] };
    }
    throw err;
  }
}

// Passthrough (online-only)
export {
  fetchTrash,
  restoreNote,
  permanentDeleteNote,
  emptyTrash,
  createFolderApi,
  renameFolderApi,
  deleteFolderApi,
  moveFolderApi,
  reorderFoldersApi,
  reorderNotes,
  renameTagApi,
  deleteTagApi,
  getTrashRetention,
  setTrashRetention,
} from "./notes.ts";
