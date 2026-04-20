import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { createMockPrisma } from "./helpers/mockPrisma.js";
import type { MockPrisma } from "./helpers/mockPrisma.js";

let mockPrisma: MockPrisma;

beforeAll(() => {
  mockPrisma = createMockPrisma();
});

const mockGenerateQueryEmbedding = vi.fn();

vi.mock("../services/embeddingService.js", () => ({
  generateQueryEmbedding: (...args: unknown[]) => mockGenerateQueryEmbedding(...args),
}));

import {
  createNote,
  getNote,
  listNotes,
  listTrashedNotes,
  updateNote,
  softDeleteNote,
  restoreNote,
  permanentDeleteNote,
  purgeOldTrash,
  createFolder,
  listFolders,
  renameFolder,
  deleteFolder,
  renameFolderById,
  deleteFolderById,
  moveFolder,
  reorderFolders,
  getDescendantIds,
  listTags,
  renameTag,
  removeTag,
  getDashboardData,
} from "../store/noteStore.js";

const TEST_USER_ID = "user-1";

interface P2025Error extends Error {
  code: string;
}

function makeP2025Error(): P2025Error {
  const e = new Error("Record not found") as P2025Error;
  e.code = "P2025";
  return e;
}

function makeMockNoteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "note-1",
    userId: TEST_USER_ID,
    title: "Test Note",
    content: "Some content",
    folder: "work",
    tags: ["tag1"],
    summary: null,
    sortOrder: 0,
    favoriteSortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

describe("noteStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createNote", () => {
    it("creates a note with all fields and auto-assigns sortOrder", async () => {
      const row = makeMockNoteRow();
      mockPrisma.note.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } });
      mockPrisma.folder.findFirst.mockResolvedValue(null);
      mockPrisma.folder.create.mockResolvedValue({});
      mockPrisma.note.create.mockResolvedValue(row);

      const result = await createNote(TEST_USER_ID, {
        title: "Test Note",
        content: "Some content",
        folder: "work",
        tags: ["tag1"],
      });

      expect(result).toEqual(row);
      expect(mockPrisma.folder.findFirst).toHaveBeenCalledWith({
        where: { userId: TEST_USER_ID, parentId: null, name: "work" },
      });
      expect(mockPrisma.folder.create).toHaveBeenCalledWith({
        data: { userId: TEST_USER_ID, name: "work" },
      });
      expect(mockPrisma.note.create).toHaveBeenCalledWith({
        data: {
          userId: TEST_USER_ID,
          title: "Test Note",
          content: "---\ntitle: Test Note\ntags:\n  - tag1\n---\nSome content",
          folder: "work",
          folderId: null,
          tags: ["tag1"],
          sortOrder: 3,
          audioMode: null,
        },
      });
    });

    it("defaults content to empty string and folder/tags to null/empty", async () => {
      const row = makeMockNoteRow({ content: "", folder: null, tags: [] });
      mockPrisma.note.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
      mockPrisma.note.create.mockResolvedValue(row);

      await createNote(TEST_USER_ID, { title: "Minimal" });

      expect(mockPrisma.note.create).toHaveBeenCalledWith({
        data: {
          userId: TEST_USER_ID,
          title: "Minimal",
          content: "---\ntitle: Minimal\n---\n",
          folder: null,
          folderId: null,
          tags: [],
          sortOrder: 0,
          audioMode: null,
        },
      });
    });
  });

  describe("getNote", () => {
    it("returns note when found and not deleted", async () => {
      const row = makeMockNoteRow();
      mockPrisma.note.findUnique.mockResolvedValue(row);

      const result = await getNote(TEST_USER_ID, "note-1");

      expect(result).toEqual(row);
    });

    it("returns null when not found", async () => {
      mockPrisma.note.findUnique.mockResolvedValue(null);

      const result = await getNote(TEST_USER_ID, "nonexistent");
      expect(result).toBeNull();
    });

    it("returns null when note is soft-deleted", async () => {
      const row = makeMockNoteRow({ deletedAt: new Date() });
      mockPrisma.note.findUnique.mockResolvedValue(row);

      const result = await getNote(TEST_USER_ID, "note-1");
      expect(result).toBeNull();
    });
  });

  describe("listNotes", () => {
    it("returns notes and total with default pagination", async () => {
      const rows = [makeMockNoteRow({ id: "note-1" }), makeMockNoteRow({ id: "note-2" })];
      mockPrisma.note.findMany.mockResolvedValue(rows);
      mockPrisma.note.count.mockResolvedValue(2);

      const result = await listNotes(TEST_USER_ID);

      expect(result.notes).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(mockPrisma.note.findMany).toHaveBeenCalledWith({
        where: { userId: TEST_USER_ID, deletedAt: null },
        orderBy: { updatedAt: "desc" },
        skip: 0,
        take: 50,
      });
    });

    it("applies folder filter", async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);
      mockPrisma.note.count.mockResolvedValue(0);

      await listNotes(TEST_USER_ID, { folder: "work" });

      expect(mockPrisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: TEST_USER_ID, deletedAt: null, folder: "work" },
        }),
      );
    });

    it("applies search filter via FTS", async () => {
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([]);

      await listNotes(TEST_USER_ID, { search: "hello" });

      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
      // First call is count query, second is data query
      const countCall = mockPrisma.$queryRawUnsafe.mock.calls[0];
      expect(countCall[0]).toContain("plainto_tsquery");
      expect(countCall[1]).toBe("hello");
    });

    it("applies pagination", async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);
      mockPrisma.note.count.mockResolvedValue(0);

      await listNotes(TEST_USER_ID, { page: 3, pageSize: 10 });

      expect(mockPrisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        }),
      );
    });

    it("sorts by title ascending using case-insensitive raw SQL", async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([{ total: 0 }]);
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([]);

      await listNotes(TEST_USER_ID, { sortBy: "title", sortOrder: "asc" });

      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('LOWER("title") ASC'),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });

    it("sorts by createdAt descending", async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);
      mockPrisma.note.count.mockResolvedValue(0);

      await listNotes(TEST_USER_ID, { sortBy: "createdAt", sortOrder: "desc" });

      expect(mockPrisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: "desc" },
        }),
      );
    });

    it("defaults to updatedAt desc when no sort params", async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);
      mockPrisma.note.count.mockResolvedValue(0);

      await listNotes(TEST_USER_ID);

      expect(mockPrisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { updatedAt: "desc" },
        }),
      );
    });

    it("sorts by sortOrder", async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);
      mockPrisma.note.count.mockResolvedValue(0);

      await listNotes(TEST_USER_ID, { sortBy: "sortOrder", sortOrder: "asc" });

      expect(mockPrisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { sortOrder: "asc" },
        }),
      );
    });
  });

  describe("listTrashedNotes", () => {
    it("returns trashed notes with default pagination", async () => {
      const rows = [
        makeMockNoteRow({ id: "note-1", deletedAt: new Date() }),
        makeMockNoteRow({ id: "note-2", deletedAt: new Date() }),
      ];
      mockPrisma.note.findMany.mockResolvedValue(rows);
      mockPrisma.note.count.mockResolvedValue(2);

      const result = await listTrashedNotes(TEST_USER_ID);

      expect(result.notes).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(mockPrisma.note.findMany).toHaveBeenCalledWith({
        where: { userId: TEST_USER_ID, deletedAt: { not: null } },
        orderBy: { deletedAt: "desc" },
        skip: 0,
        take: 50,
      });
    });

    it("applies pagination", async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);
      mockPrisma.note.count.mockResolvedValue(0);

      await listTrashedNotes(TEST_USER_ID, { page: 2, pageSize: 10 });

      expect(mockPrisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        }),
      );
    });
  });

  describe("updateNote", () => {
    it("updates and returns the note", async () => {
      const row = makeMockNoteRow({ title: "Updated" });
      mockPrisma.note.findUnique.mockResolvedValue({ content: "Some content" });
      mockPrisma.note.update.mockResolvedValue(row);

      const result = await updateNote(TEST_USER_ID, "note-1", { title: "Updated" });

      expect(result).toEqual(row);
      // Title change updates frontmatter in content
      expect(mockPrisma.note.update).toHaveBeenCalledWith({
        where: { id: "note-1", userId: TEST_USER_ID, deletedAt: null },
        data: { title: "Updated", content: "---\ntitle: Updated\n---\nSome content" },
      });
    });

    it("only includes provided fields in update data", async () => {
      const row = makeMockNoteRow();
      mockPrisma.note.update.mockResolvedValue(row);

      await updateNote(TEST_USER_ID, "note-1", { content: "new content" });

      // Content-only change doesn't trigger metadata-to-frontmatter sync
      expect(mockPrisma.note.update).toHaveBeenCalledWith({
        where: { id: "note-1", userId: TEST_USER_ID, deletedAt: null },
        data: { content: "new content" },
      });
    });

    it("returns null when note not found (P2025)", async () => {
      mockPrisma.note.update.mockRejectedValue(makeP2025Error());

      const result = await updateNote(TEST_USER_ID, "nonexistent", { title: "Nope" });
      expect(result).toBeNull();
    });

    it("re-throws non-P2025 errors", async () => {
      mockPrisma.note.update.mockRejectedValue(new Error("DB connection failed"));

      await expect(
        updateNote(TEST_USER_ID, "note-1", { title: "Fail" }),
      ).rejects.toThrow("DB connection failed");
    });

    it("includes summary field when provided", async () => {
      const row = makeMockNoteRow({ summary: "A summary" });
      mockPrisma.note.findUnique.mockResolvedValue({ content: "Some content" });
      mockPrisma.note.update.mockResolvedValue(row);

      await updateNote(TEST_USER_ID, "note-1", { summary: "A summary" });

      // Summary change updates frontmatter description in content
      expect(mockPrisma.note.update).toHaveBeenCalledWith({
        where: { id: "note-1", userId: TEST_USER_ID, deletedAt: null },
        data: { summary: "A summary", content: "---\ndescription: A summary\n---\nSome content" },
      });
    });

    it("allows setting summary to null", async () => {
      const row = makeMockNoteRow({ summary: null });
      mockPrisma.note.findUnique.mockResolvedValue({ content: "Some content" });
      mockPrisma.note.update.mockResolvedValue(row);

      await updateNote(TEST_USER_ID, "note-1", { summary: null });

      // Clearing summary removes description from frontmatter
      expect(mockPrisma.note.update).toHaveBeenCalledWith({
        where: { id: "note-1", userId: TEST_USER_ID, deletedAt: null },
        data: { summary: null, content: "---\n---\nSome content" },
      });
    });
  });

  describe("softDeleteNote", () => {
    it("returns true when soft-deleted", async () => {
      mockPrisma.note.update.mockResolvedValue({});

      const result = await softDeleteNote(TEST_USER_ID, "note-1");
      expect(result).toBe(true);
      expect(mockPrisma.note.update).toHaveBeenCalledWith({
        where: { id: "note-1", userId: TEST_USER_ID, deletedAt: null },
        data: { deletedAt: expect.any(Date), favorite: false },
      });
    });

    it("returns false when not found (P2025)", async () => {
      mockPrisma.note.update.mockRejectedValue(makeP2025Error());

      const result = await softDeleteNote(TEST_USER_ID, "nonexistent");
      expect(result).toBe(false);
    });

    it("re-throws non-P2025 errors", async () => {
      mockPrisma.note.update.mockRejectedValue(new Error("DB connection failed"));

      await expect(softDeleteNote(TEST_USER_ID, "note-1")).rejects.toThrow(
        "DB connection failed",
      );
    });
  });

  describe("restoreNote", () => {
    it("restores and returns the note", async () => {
      const row = makeMockNoteRow({ deletedAt: null });
      mockPrisma.note.update.mockResolvedValue(row);

      const result = await restoreNote(TEST_USER_ID, "note-1");

      expect(result).toEqual(row);
      expect(mockPrisma.note.update).toHaveBeenCalledWith({
        where: { id: "note-1", userId: TEST_USER_ID },
        data: { deletedAt: null },
      });
    });

    it("returns null when not found (P2025)", async () => {
      mockPrisma.note.update.mockRejectedValue(makeP2025Error());

      const result = await restoreNote(TEST_USER_ID, "nonexistent");
      expect(result).toBeNull();
    });

    it("re-throws non-P2025 errors", async () => {
      mockPrisma.note.update.mockRejectedValue(new Error("DB connection failed"));

      await expect(restoreNote(TEST_USER_ID, "note-1")).rejects.toThrow(
        "DB connection failed",
      );
    });
  });

  describe("permanentDeleteNote", () => {
    it("returns true when permanently deleted", async () => {
      mockPrisma.note.delete.mockResolvedValue({});

      const result = await permanentDeleteNote(TEST_USER_ID, "note-1");
      expect(result).toBe(true);
      expect(mockPrisma.note.delete).toHaveBeenCalledWith({
        where: { id: "note-1", userId: TEST_USER_ID },
      });
    });

    it("returns false when not found (P2025)", async () => {
      mockPrisma.note.delete.mockRejectedValue(makeP2025Error());

      const result = await permanentDeleteNote(TEST_USER_ID, "nonexistent");
      expect(result).toBe(false);
    });

    it("re-throws non-P2025 errors", async () => {
      mockPrisma.note.delete.mockRejectedValue(new Error("DB connection failed"));

      await expect(permanentDeleteNote(TEST_USER_ID, "note-1")).rejects.toThrow(
        "DB connection failed",
      );
    });
  });

  describe("purgeOldTrash", () => {
    it("deletes notes older than 30 days by default", async () => {
      mockPrisma.note.deleteMany.mockResolvedValue({ count: 3 });

      const result = await purgeOldTrash();

      expect(result).toBe(3);
      expect(mockPrisma.note.deleteMany).toHaveBeenCalledWith({
        where: {
          deletedAt: { lt: expect.any(Date) },
        },
      });
    });

    it("uses custom days parameter", async () => {
      mockPrisma.note.deleteMany.mockResolvedValue({ count: 0 });

      await purgeOldTrash(7);

      expect(mockPrisma.note.deleteMany).toHaveBeenCalledWith({
        where: {
          deletedAt: { lt: expect.any(Date) },
        },
      });
    });

    it("returns 0 when no notes to purge", async () => {
      mockPrisma.note.deleteMany.mockResolvedValue({ count: 0 });

      const result = await purgeOldTrash();
      expect(result).toBe(0);
    });
  });

  describe("createFolder", () => {
    it("creates a root folder with auto-incremented sortOrder", async () => {
      mockPrisma.folder.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } });
      mockPrisma.folder.create.mockResolvedValue({
        id: "folder-1",
        userId: TEST_USER_ID,
        name: "work",
        parentId: null,
        sortOrder: 3,
        createdAt: new Date(),
      });

      const result = await createFolder(TEST_USER_ID, "work");

      expect(result.name).toBe("work");
      // Root folder → no parent lookup, isLocalFile defaults to false.
      expect(mockPrisma.folder.create).toHaveBeenCalledWith({
        data: {
          userId: TEST_USER_ID,
          name: "work",
          parentId: null,
          sortOrder: 3,
          isLocalFile: false,
        },
      });
    });

    it("creates a nested folder with parentId (non-managed parent)", async () => {
      mockPrisma.folder.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
      // Phase A.1: root-ancestor walk via recursive CTE. Mock returns
      // the root's flag directly.
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ isLocalFile: false }]);
      mockPrisma.folder.create.mockResolvedValue({
        id: "folder-2",
        userId: TEST_USER_ID,
        name: "projects",
        parentId: "folder-1",
        sortOrder: 1,
        createdAt: new Date(),
      });

      const result = await createFolder(TEST_USER_ID, "projects", "folder-1");

      expect(result.parentId).toBe("folder-1");
      expect(mockPrisma.folder.create).toHaveBeenCalledWith({
        data: {
          userId: TEST_USER_ID,
          name: "projects",
          parentId: "folder-1",
          sortOrder: 1,
          isLocalFile: false,
        },
      });
    });

    it("inherits isLocalFile=true from a managed-locally root ancestor", async () => {
      mockPrisma.folder.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ isLocalFile: true }]);
      mockPrisma.folder.create.mockResolvedValue({
        id: "folder-3",
        userId: TEST_USER_ID,
        name: "new-subdir",
        parentId: "managed-root",
        sortOrder: 1,
        isLocalFile: true,
        createdAt: new Date(),
      });

      await createFolder(TEST_USER_ID, "new-subdir", "managed-root");

      expect(mockPrisma.folder.create).toHaveBeenCalledWith({
        data: {
          userId: TEST_USER_ID,
          name: "new-subdir",
          parentId: "managed-root",
          sortOrder: 1,
          isLocalFile: true,
        },
      });
    });

    it("defaults to isLocalFile=false when the root ancestor isn't found (user mismatch or missing parent)", async () => {
      mockPrisma.folder.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
      // Recursive CTE returns nothing because the WHERE clause filters
      // by userId — cross-user parent references can't leak the flag.
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
      mockPrisma.folder.create.mockResolvedValue({
        id: "folder-4",
        userId: TEST_USER_ID,
        name: "attempt",
        parentId: "other-user-folder",
        sortOrder: 1,
        createdAt: new Date(),
      });

      await createFolder(TEST_USER_ID, "attempt", "other-user-folder");

      expect(mockPrisma.folder.create).toHaveBeenCalledWith({
        data: {
          userId: TEST_USER_ID,
          name: "attempt",
          parentId: "other-user-folder",
          sortOrder: 1,
          isLocalFile: false,
        },
      });
    });
  });

  describe("listFolders", () => {
    it("returns folder tree with counts", async () => {
      mockPrisma.folder.findMany.mockResolvedValue([
        { id: "f1", userId: TEST_USER_ID, name: "work", parentId: null, sortOrder: 0, createdAt: new Date() },
        { id: "f2", userId: TEST_USER_ID, name: "projects", parentId: "f1", sortOrder: 0, createdAt: new Date() },
      ]);
      mockPrisma.note.groupBy.mockResolvedValue([
        { folderId: "f1", _count: { id: 2 } },
        { folderId: "f2", _count: { id: 3 } },
      ]);

      const result = await listFolders(TEST_USER_ID);

      expect(result).toHaveLength(1); // Only root
      expect(result[0].name).toBe("work");
      expect(result[0].count).toBe(2);
      expect(result[0].totalCount).toBe(5); // 2 + 3 from child
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].name).toBe("projects");
      expect(result[0].children[0].count).toBe(3);
    });

    it("returns empty array when no folders", async () => {
      mockPrisma.folder.findMany.mockResolvedValue([]);
      mockPrisma.note.groupBy.mockResolvedValue([]);

      const result = await listFolders(TEST_USER_ID);
      expect(result).toEqual([]);
    });

    it("includes empty folders with count 0", async () => {
      mockPrisma.folder.findMany.mockResolvedValue([
        { id: "f1", userId: TEST_USER_ID, name: "empty", parentId: null, sortOrder: 0, createdAt: new Date() },
      ]);
      mockPrisma.note.groupBy.mockResolvedValue([]);

      const result = await listFolders(TEST_USER_ID);

      expect(result[0].count).toBe(0);
      expect(result[0].totalCount).toBe(0);
    });
  });

  describe("renameFolderById", () => {
    it("renames a folder by ID", async () => {
      mockPrisma.folder.update.mockResolvedValue({
        id: "f1",
        userId: TEST_USER_ID,
        name: "new-name",
        parentId: null,
        sortOrder: 0,
        createdAt: new Date(),
      });

      const result = await renameFolderById(TEST_USER_ID, "f1", "new-name");

      expect(result.name).toBe("new-name");
      expect(mockPrisma.folder.update).toHaveBeenCalledWith({
        where: { id: "f1", userId: TEST_USER_ID },
        data: { name: "new-name" },
      });
    });
  });

  describe("moveFolder", () => {
    it("moves folder to new parent (same boundary — no flag flip)", async () => {
      // 1. getSelfAndDescendantIds (circular check) — no descendants
      // 2. folder.findUnique for current flag — unmanaged
      // 3. resolveRootIsLocalFile for target — unmanaged
      // 4. folder.aggregate for sortOrder
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([])                       // descendants empty
        .mockResolvedValueOnce([{ isLocalFile: false }]); // target root
      mockPrisma.folder.findUnique.mockResolvedValue({ isLocalFile: false });
      mockPrisma.folder.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
      mockPrisma.folder.update.mockResolvedValue({
        id: "f2",
        userId: TEST_USER_ID,
        name: "projects",
        parentId: "f1",
        sortOrder: 1,
        createdAt: new Date(),
      });

      const result = await moveFolder(TEST_USER_ID, "f2", "f1");

      expect(result.parentId).toBe("f1");
    });

    it("rejects circular move", async () => {
      // f2 is a descendant of itself (the query returns f2)
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ id: "f3" }]);

      // moveFolder(userId, "f1", "f3") — f3 is a descendant of f1
      await expect(moveFolder(TEST_USER_ID, "f1", "f3")).rejects.toThrow(
        "Cannot move folder into its own descendant",
      );
    });

    it("throws CrossBoundaryMoveError when managed/unmanaged boundary is crossed without confirmation", async () => {
      // Three $queryRawUnsafe calls in order:
      //   1. getDescendantIds (circular check)
      //   2. resolveRootIsLocalFile (target root walk)
      //   3. getDescendantIds (affected ids)
      // getSelfAndDescendantIds prepends folderId, so 1 descendant row →
      // 2 total affected folders.
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([])                        // no circular
        .mockResolvedValueOnce([{ isLocalFile: true }])   // target managed
        .mockResolvedValueOnce([{ id: "folder-1a" }]);    // descendant
      mockPrisma.folder.findUnique.mockResolvedValue({ isLocalFile: false });
      mockPrisma.note.count.mockResolvedValue(5);

      let caught: unknown;
      try {
        await moveFolder(TEST_USER_ID, "folder-1", "managed-root");
      } catch (e) {
        caught = e;
      }
      const err = caught as {
        code?: string;
        direction?: string;
        affectedFolderCount?: number;
        affectedNoteCount?: number;
      };
      expect(err.code).toBe("cross_boundary_move");
      expect(err.direction).toBe("toManaged");
      expect(err.affectedFolderCount).toBe(2);
      expect(err.affectedNoteCount).toBe(5);
    });

    it("confirmCrossBoundary=true flips the subtree's isLocalFile alongside the parent change", async () => {
      // Four $queryRawUnsafe calls in order:
      //   1. getDescendantIds (circular check)
      //   2. resolveRootIsLocalFile (target root walk)
      //   3. getDescendantIds (affected ids for the tx)
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([])                        // no circular
        .mockResolvedValueOnce([{ isLocalFile: true }])   // target managed
        .mockResolvedValueOnce([{ id: "folder-1a" }]);    // descendant
      mockPrisma.folder.findUnique.mockResolvedValue({ isLocalFile: false });
      mockPrisma.folder.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
      // Scope the $transaction override to this single test to avoid
      // bleeding into sibling tests.
      mockPrisma.$transaction.mockImplementationOnce(
        async (fn: (tx: unknown) => unknown) => fn(mockPrisma),
      );
      mockPrisma.folder.update.mockResolvedValue({
        id: "folder-1",
        userId: TEST_USER_ID,
        name: "x",
        parentId: "managed-root",
        sortOrder: 1,
        isLocalFile: false,
        createdAt: new Date(),
      });
      mockPrisma.folder.updateMany.mockResolvedValue({ count: 2 });

      const result = await moveFolder(
        TEST_USER_ID,
        "folder-1",
        "managed-root",
        undefined,
        true,
      );

      expect(result.isLocalFile).toBe(true);
      const updateManyCall = mockPrisma.folder.updateMany.mock.calls[0][0];
      expect(updateManyCall.data.isLocalFile).toBe(true);
      expect(updateManyCall.where.id.in).toEqual(["folder-1", "folder-1a"]);
    });
  });

  describe("reorderFolders", () => {
    it("updates sortOrder for each folder in a transaction", async () => {
      mockPrisma.folder.update.mockResolvedValue({});

      await reorderFolders(TEST_USER_ID, [
        { id: "f1", sortOrder: 1 },
        { id: "f2", sortOrder: 0 },
      ]);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  describe("deleteFolderById", () => {
    it("move-up mode: re-files children to parent and hard-deletes the folder with a tombstone", async () => {
      mockPrisma.folder.findUnique.mockResolvedValue({
        id: "f1",
        userId: TEST_USER_ID,
        name: "work",
        parentId: "parent-id",
        sortOrder: 0,
        isLocalFile: false,
        createdAt: new Date(),
        deletedAt: null,
      });
      mockPrisma.folder.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.note.updateMany.mockResolvedValue({ count: 3 });
      mockPrisma.folder.delete.mockResolvedValue({});

      const result = await deleteFolderById(TEST_USER_ID, "f1", "move-up");

      expect(result).toBe(3);
      // Children re-parented
      expect(mockPrisma.folder.updateMany).toHaveBeenCalledWith({
        where: { parentId: "f1", deletedAt: null },
        data: { parentId: "parent-id" },
      });
      // Notes re-filed
      expect(mockPrisma.note.updateMany).toHaveBeenCalledWith({
        where: { userId: TEST_USER_ID, folderId: "f1", deletedAt: null },
        data: { folderId: "parent-id", folder: null },
      });
      // Folder hard-deleted (not soft)
      expect(mockPrisma.folder.delete).toHaveBeenCalledWith({ where: { id: "f1" } });
      // Single tombstone for the folder
      expect(mockPrisma.entityTombstone.upsert).toHaveBeenCalledTimes(1);
    });

    it("recursive mode: hard-deletes descendants + notes and emits tombstones", async () => {
      mockPrisma.folder.findUnique.mockResolvedValue({
        id: "f1",
        userId: TEST_USER_ID,
        name: "work",
        parentId: null,
        sortOrder: 0,
        isLocalFile: false,
        createdAt: new Date(),
      });
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ id: "f2" }, { id: "f3" }]);
      // Notes in the subtree that will be captured for tombstones
      mockPrisma.note.findMany.mockResolvedValue([
        { id: "n1" },
        { id: "n2" },
        { id: "n3" },
        { id: "n4" },
        { id: "n5" },
      ]);
      mockPrisma.note.deleteMany.mockResolvedValue({ count: 5 });
      mockPrisma.folder.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.folder.delete.mockResolvedValue({});

      const result = await deleteFolderById(TEST_USER_ID, "f1", "recursive");

      expect(result).toBe(5);
      // Notes are hard-deleted, not unfiled
      expect(mockPrisma.note.deleteMany).toHaveBeenCalledWith({
        where: { userId: TEST_USER_ID, folderId: { in: ["f1", "f2", "f3"] } },
      });
      // Tombstones upserted for every folder + every note in the subtree
      // (8 total: 3 folders + 5 notes)
      expect(mockPrisma.entityTombstone.upsert).toHaveBeenCalledTimes(8);
    });

    it("returns 0 when folder not found", async () => {
      mockPrisma.folder.findUnique.mockResolvedValue(null);

      const result = await deleteFolderById(TEST_USER_ID, "nonexistent");
      expect(result).toBe(0);
    });
  });

  describe("getDescendantIds", () => {
    it("returns descendant folder IDs", async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        { id: "f2" },
        { id: "f3" },
      ]);

      const result = await getDescendantIds("f1");

      expect(result).toEqual(["f2", "f3"]);
    });

    it("returns empty array when no descendants", async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      const result = await getDescendantIds("f1");
      expect(result).toEqual([]);
    });
  });

  describe("listNotes with folderId", () => {
    it("filters by folderId including descendant folders", async () => {
      // Mock getDescendantIds to return child folders
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ id: "f2" }, { id: "f3" }]);
      mockPrisma.note.findMany.mockResolvedValue([]);
      mockPrisma.note.count.mockResolvedValue(0);

      await listNotes(TEST_USER_ID, { folderId: "f1" });

      expect(mockPrisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: TEST_USER_ID, deletedAt: null, folderId: { in: ["f1", "f2", "f3"] } },
        }),
      );
    });

    it("filters by folderId with no descendants", async () => {
      // Mock getDescendantIds to return no children
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
      mockPrisma.note.findMany.mockResolvedValue([]);
      mockPrisma.note.count.mockResolvedValue(0);

      await listNotes(TEST_USER_ID, { folderId: "f1" });

      expect(mockPrisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: TEST_USER_ID, deletedAt: null, folderId: { in: ["f1"] } },
        }),
      );
    });
  });

  describe("renameFolder (legacy)", () => {
    it("renames all notes in folder and updates folders table", async () => {
      mockPrisma.note.updateMany.mockResolvedValue({ count: 3 });
      mockPrisma.folder.findFirst.mockResolvedValue({ id: "f1", userId: TEST_USER_ID, name: "old-name" });
      mockPrisma.folder.update.mockResolvedValue({});

      const result = await renameFolder(TEST_USER_ID, "old-name", "new-name");

      expect(result).toBe(3);
      expect(mockPrisma.note.updateMany).toHaveBeenCalledWith({
        where: { userId: TEST_USER_ID, folder: "old-name", deletedAt: null },
        data: { folder: "new-name" },
      });
    });
  });

  describe("deleteFolder (legacy)", () => {
    it("unfiles all notes in folder and soft-deletes from folders table", async () => {
      mockPrisma.note.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.folder.findFirst.mockResolvedValue({ id: "f1", userId: TEST_USER_ID, name: "work" });
      mockPrisma.folder.update.mockResolvedValue({});

      const result = await deleteFolder(TEST_USER_ID, "work");

      expect(result).toBe(2);
      expect(mockPrisma.note.updateMany).toHaveBeenCalledWith({
        where: { userId: TEST_USER_ID, folder: "work", deletedAt: null },
        data: { folder: null },
      });
      expect(mockPrisma.folder.findFirst).toHaveBeenCalledWith({
        where: { userId: TEST_USER_ID, name: "work", deletedAt: null },
      });
      expect(mockPrisma.folder.update).toHaveBeenCalledWith({
        where: { id: "f1" },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });

  describe("listNotes with search (FTS)", () => {
    it("uses $queryRawUnsafe for full-text search", async () => {
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([
          { ...makeMockNoteRow(), headline: "test <mark>match</mark>" },
        ]);

      const result = await listNotes(TEST_USER_ID, { search: "match" });

      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
      expect(result.total).toBe(1);
      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].headline).toBe("test <mark>match</mark>");
    });

    it("includes folder filter in FTS query", async () => {
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([]);

      await listNotes(TEST_USER_ID, { search: "hello", folder: "work" });

      // Both count and data queries should include folder param
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
      const countCall = mockPrisma.$queryRawUnsafe.mock.calls[0];
      expect(countCall[0]).toContain('"folder"');
      expect(countCall[1]).toBe("hello");
      expect(countCall[2]).toBe(TEST_USER_ID);
      expect(countCall[3]).toBe("work");
    });

    it("includes tags filter in FTS query", async () => {
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([]);

      await listNotes(TEST_USER_ID, { search: "hello", tags: ["js", "react"] });

      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
      const countCall = mockPrisma.$queryRawUnsafe.mock.calls[0];
      expect(countCall[0]).toContain('"tags"');
      expect(countCall[1]).toBe("hello");
      expect(countCall[2]).toBe(TEST_USER_ID);
      expect(countCall[3]).toBe(JSON.stringify(["js", "react"]));
    });
  });

  describe("listNotes with tags filter (no search)", () => {
    it("passes tags to Prisma where clause", async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);
      mockPrisma.note.count.mockResolvedValue(0);

      await listNotes(TEST_USER_ID, { tags: ["todo"] });

      expect(mockPrisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tags: { array_contains: ["todo"] },
          }),
        }),
      );
    });
  });

  describe("listTags", () => {
    it("returns tag list from raw query", async () => {
      const mockTags = [
        { name: "js", count: 5 },
        { name: "react", count: 3 },
      ];
      mockPrisma.$queryRawUnsafe.mockResolvedValue(mockTags);

      const result = await listTags(TEST_USER_ID);

      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalled();
      expect(result).toEqual(mockTags);
    });
  });

  describe("renameTag", () => {
    it("renames tag in all matching notes", async () => {
      mockPrisma.note.findMany.mockResolvedValue([
        { id: "n1", tags: ["old-tag", "other"] },
        { id: "n2", tags: ["old-tag"] },
      ]);
      mockPrisma.note.update.mockResolvedValue({});

      const result = await renameTag(TEST_USER_ID, "old-tag", "new-tag");

      expect(result).toBe(2);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it("deduplicates when newName already exists in tags", async () => {
      mockPrisma.note.findMany.mockResolvedValue([
        { id: "n1", tags: ["old-tag", "new-tag"] },
      ]);
      mockPrisma.note.update.mockResolvedValue({});

      await renameTag(TEST_USER_ID, "old-tag", "new-tag");

      // The transaction should receive update with deduplicated tags
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it("returns 0 when no notes have the tag", async () => {
      mockPrisma.note.findMany.mockResolvedValue([
        { id: "n1", tags: ["other"] },
      ]);

      const result = await renameTag(TEST_USER_ID, "nonexistent", "new-tag");

      expect(result).toBe(0);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("removeTag", () => {
    it("removes tag from all matching notes", async () => {
      mockPrisma.note.findMany.mockResolvedValue([
        { id: "n1", tags: ["remove-me", "keep"] },
        { id: "n2", tags: ["remove-me"] },
      ]);
      mockPrisma.note.update.mockResolvedValue({});

      const result = await removeTag(TEST_USER_ID, "remove-me");

      expect(result).toBe(2);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it("returns 0 when no notes have the tag", async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);

      const result = await removeTag(TEST_USER_ID, "nonexistent");

      expect(result).toBe(0);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("listNotes with semantic search mode", () => {
    it("uses vector similarity query for semantic mode", async () => {
      mockGenerateQueryEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([
          { ...makeMockNoteRow(), headline: "0.8542" },
        ]);

      const result = await listNotes(TEST_USER_ID, { search: "machine learning", searchMode: "semantic" });

      expect(mockGenerateQueryEmbedding).toHaveBeenCalledWith("machine learning");
      expect(result.total).toBe(1);
      expect(result.notes).toHaveLength(1);
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
      const dataCall = mockPrisma.$queryRawUnsafe.mock.calls[1][0];
      expect(dataCall).toContain("embedding");
      expect(dataCall).toContain("vector");
    });
  });

  describe("listNotes with hybrid search mode", () => {
    it("combines keyword and semantic scores", async () => {
      mockGenerateQueryEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: 2 }])
        .mockResolvedValueOnce([
          { ...makeMockNoteRow({ id: "n1" }), headline: "test <mark>result</mark>" },
          { ...makeMockNoteRow({ id: "n2" }), headline: "another <mark>result</mark>" },
        ]);

      const result = await listNotes(TEST_USER_ID, { search: "test query", searchMode: "hybrid" });

      expect(mockGenerateQueryEmbedding).toHaveBeenCalledWith("test query");
      expect(result.total).toBe(2);
      expect(result.notes).toHaveLength(2);
      const dataCall = mockPrisma.$queryRawUnsafe.mock.calls[1][0];
      expect(dataCall).toContain("hybrid_score");
      expect(dataCall).toContain("ts_rank");
      expect(dataCall).toContain("embedding");
    });
  });

  describe("listNotes search mode delegation", () => {
    it("defaults to keyword search when no mode specified", async () => {
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([]);

      await listNotes(TEST_USER_ID, { search: "hello" });

      const countCall = mockPrisma.$queryRawUnsafe.mock.calls[0][0];
      expect(countCall).toContain("plainto_tsquery");
      expect(countCall).not.toContain("embedding");
    });

    it("uses keyword search when mode is keyword", async () => {
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([]);

      await listNotes(TEST_USER_ID, { search: "hello", searchMode: "keyword" });

      const countCall = mockPrisma.$queryRawUnsafe.mock.calls[0][0];
      expect(countCall).toContain("plainto_tsquery");
    });
  });

  describe("getDashboardData", () => {
    it("returns recentlyEdited, favorites, and audioNotes", async () => {
      const now = new Date();
      const mockNotes = [makeMockNoteRow({
        id: "note-1",
        title: "Test",
        content: "",
        folder: null,
        folderId: null,
        tags: [],
        summary: null,
        favorite: false,
        sortOrder: 0,
        favoriteSortOrder: 0,
        isLocalFile: false,
        audioMode: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        userId: TEST_USER_ID,
        embeddingUpdatedAt: null,
        embedding: null,
      })];

      mockPrisma.note.findMany
        .mockResolvedValueOnce(mockNotes) // recentlyEdited
        .mockResolvedValueOnce([]) // favorites
        .mockResolvedValueOnce([]); // audioNotes

      const result = await getDashboardData(TEST_USER_ID);

      expect(result.recentlyEdited).toHaveLength(1);
      expect(result.favorites).toHaveLength(0);
      expect(result.audioNotes).toHaveLength(0);
      expect(mockPrisma.note.findMany).toHaveBeenCalledTimes(3);
    });

    it("queries recentlyEdited with correct params", async () => {
      mockPrisma.note.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await getDashboardData(TEST_USER_ID);

      expect(mockPrisma.note.findMany).toHaveBeenNthCalledWith(1, {
        where: { userId: TEST_USER_ID, deletedAt: null },
        orderBy: { updatedAt: "desc" },
        take: 10,
      });
    });

    it("queries favorites with correct params", async () => {
      mockPrisma.note.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await getDashboardData(TEST_USER_ID);

      expect(mockPrisma.note.findMany).toHaveBeenNthCalledWith(2, {
        where: { userId: TEST_USER_ID, favorite: true, deletedAt: null },
        orderBy: { updatedAt: "desc" },
        take: 10,
      });
    });

    it("queries audioNotes with correct params", async () => {
      mockPrisma.note.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await getDashboardData(TEST_USER_ID);

      expect(mockPrisma.note.findMany).toHaveBeenNthCalledWith(3, {
        where: { userId: TEST_USER_ID, audioMode: { not: null }, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
    });

    it("returns populated lists when data exists", async () => {
      const recentNotes = [
        makeMockNoteRow({ id: "r1" }),
        makeMockNoteRow({ id: "r2" }),
      ];
      const favNotes = [
        makeMockNoteRow({ id: "f1", favorite: true }),
      ];
      const audioNotes = [
        makeMockNoteRow({ id: "a1", audioMode: "meeting" }),
        makeMockNoteRow({ id: "a2", audioMode: "voice_memo" }),
      ];

      mockPrisma.note.findMany
        .mockResolvedValueOnce(recentNotes)
        .mockResolvedValueOnce(favNotes)
        .mockResolvedValueOnce(audioNotes);

      const result = await getDashboardData(TEST_USER_ID);

      expect(result.recentlyEdited).toHaveLength(2);
      expect(result.favorites).toHaveLength(1);
      expect(result.audioNotes).toHaveLength(2);
    });
  });
});
