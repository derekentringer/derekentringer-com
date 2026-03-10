import { describe, it, expect, beforeEach } from "vitest";
import {
  getDB,
  resetDB,
  cacheNote,
  cacheNotes,
  getCachedNote,
  getAllCachedNotes,
  deleteCachedNote,
  cacheNoteList,
  getCachedNoteList,
  cacheFolders,
  getCachedFolders,
  cacheTags,
  getCachedTags,
  setMeta,
  getMeta,
  clearAllCaches,
} from "../lib/db.ts";
import type { Note, FolderInfo, TagInfo } from "@derekentringer/shared/ns";

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "note-1",
    title: "Test Note",
    content: "Hello world",
    folder: null,
    folderId: null,
    folderPath: null,
    tags: [],
    summary: null,
    favorite: false,
    sortOrder: 0,
    favoriteSortOrder: 0,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(async () => {
  resetDB();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase("notesync-cache");
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
});

describe("db", () => {
  it("caches and retrieves a single note", async () => {
    const note = makeNote();
    await cacheNote(note);
    const result = await getCachedNote("note-1");
    expect(result).toEqual(note);
  });

  it("caches and retrieves multiple notes", async () => {
    const notes = [
      makeNote({ id: "n1", updatedAt: "2025-01-01T00:00:00.000Z" }),
      makeNote({ id: "n2", updatedAt: "2025-01-02T00:00:00.000Z" }),
    ];
    await cacheNotes(notes);
    const all = await getAllCachedNotes();
    expect(all).toHaveLength(2);
  });

  it("deletes a cached note", async () => {
    await cacheNote(makeNote());
    await deleteCachedNote("note-1");
    const result = await getCachedNote("note-1");
    expect(result).toBeUndefined();
  });

  it("enforces 100-note limit by evicting oldest", async () => {
    const notes: Note[] = [];
    for (let i = 0; i < 105; i++) {
      notes.push(
        makeNote({
          id: `n-${String(i).padStart(3, "0")}`,
          updatedAt: new Date(2025, 0, 1, 0, i).toISOString(),
        }),
      );
    }
    await cacheNotes(notes);
    const all = await getAllCachedNotes();
    expect(all.length).toBeLessThanOrEqual(100);
    // Oldest notes should be evicted
    expect(all.find((n) => n.id === "n-000")).toBeUndefined();
  });

  it("caches noteList metadata without content", async () => {
    const notes = [makeNote({ content: "full content here" })];
    await cacheNoteList(notes);
    const list = await getCachedNoteList();
    expect(list).toHaveLength(1);
    expect(list[0].content).toBe("");
  });

  it("round-trips folders", async () => {
    const folders: FolderInfo[] = [
      {
        id: "f1",
        name: "Work",
        parentId: null,
        sortOrder: 0,
        favorite: false,
        count: 1,
        totalCount: 1,
        createdAt: "2025-01-01T00:00:00.000Z",
        children: [],
      },
    ];
    await cacheFolders(folders);
    const result = await getCachedFolders();
    expect(result).toEqual(folders);
  });

  it("round-trips tags", async () => {
    const tags: TagInfo[] = [{ name: "js", count: 5 }];
    await cacheTags(tags);
    const result = await getCachedTags();
    expect(result).toEqual(tags);
  });

  it("sets and gets meta values", async () => {
    await setMeta("lastSyncedAt", 12345);
    const val = await getMeta("lastSyncedAt");
    expect(val).toBe(12345);
  });

  it("clears all caches", async () => {
    await cacheNote(makeNote());
    await cacheFolders([]);
    await cacheTags([]);
    await setMeta("lastSyncedAt", 1);
    await clearAllCaches();

    const notes = await getAllCachedNotes();
    const folders = await getCachedFolders();
    const tags = await getCachedTags();
    const meta = await getMeta("lastSyncedAt");
    expect(notes).toHaveLength(0);
    expect(folders).toBeNull();
    expect(tags).toBeNull();
    expect(meta).toBeUndefined();
  });
});
