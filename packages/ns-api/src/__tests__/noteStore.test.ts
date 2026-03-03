import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { createMockPrisma } from "./helpers/mockPrisma.js";
import type { MockPrisma } from "./helpers/mockPrisma.js";

let mockPrisma: MockPrisma;

beforeAll(() => {
  mockPrisma = createMockPrisma();
});

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
  listFolders,
  reorderNotes,
  renameFolder,
  deleteFolder,
  listTags,
  renameTag,
  removeTag,
} from "../store/noteStore.js";

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
    title: "Test Note",
    content: "Some content",
    folder: "work",
    tags: ["tag1"],
    summary: null,
    sortOrder: 0,
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
      mockPrisma.note.create.mockResolvedValue(row);

      const result = await createNote({
        title: "Test Note",
        content: "Some content",
        folder: "work",
        tags: ["tag1"],
      });

      expect(result).toEqual(row);
      expect(mockPrisma.note.create).toHaveBeenCalledWith({
        data: {
          title: "Test Note",
          content: "Some content",
          folder: "work",
          tags: ["tag1"],
          sortOrder: 3,
        },
      });
    });

    it("defaults content to empty string and folder/tags to null/empty", async () => {
      const row = makeMockNoteRow({ content: "", folder: null, tags: [] });
      mockPrisma.note.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
      mockPrisma.note.create.mockResolvedValue(row);

      await createNote({ title: "Minimal" });

      expect(mockPrisma.note.create).toHaveBeenCalledWith({
        data: {
          title: "Minimal",
          content: "",
          folder: null,
          tags: [],
          sortOrder: 0,
        },
      });
    });
  });

  describe("getNote", () => {
    it("returns note when found and not deleted", async () => {
      const row = makeMockNoteRow();
      mockPrisma.note.findUnique.mockResolvedValue(row);

      const result = await getNote("note-1");

      expect(result).toEqual(row);
    });

    it("returns null when not found", async () => {
      mockPrisma.note.findUnique.mockResolvedValue(null);

      const result = await getNote("nonexistent");
      expect(result).toBeNull();
    });

    it("returns null when note is soft-deleted", async () => {
      const row = makeMockNoteRow({ deletedAt: new Date() });
      mockPrisma.note.findUnique.mockResolvedValue(row);

      const result = await getNote("note-1");
      expect(result).toBeNull();
    });
  });

  describe("listNotes", () => {
    it("returns notes and total with default pagination", async () => {
      const rows = [makeMockNoteRow({ id: "note-1" }), makeMockNoteRow({ id: "note-2" })];
      mockPrisma.note.findMany.mockResolvedValue(rows);
      mockPrisma.note.count.mockResolvedValue(2);

      const result = await listNotes();

      expect(result.notes).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(mockPrisma.note.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        orderBy: { sortOrder: "asc" },
        skip: 0,
        take: 50,
      });
    });

    it("applies folder filter", async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);
      mockPrisma.note.count.mockResolvedValue(0);

      await listNotes({ folder: "work" });

      expect(mockPrisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null, folder: "work" },
        }),
      );
    });

    it("applies search filter via FTS", async () => {
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([]);

      await listNotes({ search: "hello" });

      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
      // First call is count query, second is data query
      const countCall = mockPrisma.$queryRawUnsafe.mock.calls[0];
      expect(countCall[0]).toContain("plainto_tsquery");
      expect(countCall[1]).toBe("hello");
    });

    it("applies pagination", async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);
      mockPrisma.note.count.mockResolvedValue(0);

      await listNotes({ page: 3, pageSize: 10 });

      expect(mockPrisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        }),
      );
    });

    it("sorts by title ascending", async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);
      mockPrisma.note.count.mockResolvedValue(0);

      await listNotes({ sortBy: "title", sortOrder: "asc" });

      expect(mockPrisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { title: "asc" },
        }),
      );
    });

    it("sorts by createdAt descending", async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);
      mockPrisma.note.count.mockResolvedValue(0);

      await listNotes({ sortBy: "createdAt", sortOrder: "desc" });

      expect(mockPrisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: "desc" },
        }),
      );
    });

    it("defaults to sortOrder asc when no sort params", async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);
      mockPrisma.note.count.mockResolvedValue(0);

      await listNotes();

      expect(mockPrisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { sortOrder: "asc" },
        }),
      );
    });

    it("sorts by sortOrder", async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);
      mockPrisma.note.count.mockResolvedValue(0);

      await listNotes({ sortBy: "sortOrder", sortOrder: "asc" });

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

      const result = await listTrashedNotes();

      expect(result.notes).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(mockPrisma.note.findMany).toHaveBeenCalledWith({
        where: { deletedAt: { not: null } },
        orderBy: { deletedAt: "desc" },
        skip: 0,
        take: 50,
      });
    });

    it("applies pagination", async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);
      mockPrisma.note.count.mockResolvedValue(0);

      await listTrashedNotes({ page: 2, pageSize: 10 });

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
      mockPrisma.note.update.mockResolvedValue(row);

      const result = await updateNote("note-1", { title: "Updated" });

      expect(result).toEqual(row);
      expect(mockPrisma.note.update).toHaveBeenCalledWith({
        where: { id: "note-1", deletedAt: null },
        data: { title: "Updated" },
      });
    });

    it("only includes provided fields in update data", async () => {
      const row = makeMockNoteRow();
      mockPrisma.note.update.mockResolvedValue(row);

      await updateNote("note-1", { content: "new content" });

      expect(mockPrisma.note.update).toHaveBeenCalledWith({
        where: { id: "note-1", deletedAt: null },
        data: { content: "new content" },
      });
    });

    it("returns null when note not found (P2025)", async () => {
      mockPrisma.note.update.mockRejectedValue(makeP2025Error());

      const result = await updateNote("nonexistent", { title: "Nope" });
      expect(result).toBeNull();
    });

    it("re-throws non-P2025 errors", async () => {
      mockPrisma.note.update.mockRejectedValue(new Error("DB connection failed"));

      await expect(
        updateNote("note-1", { title: "Fail" }),
      ).rejects.toThrow("DB connection failed");
    });
  });

  describe("softDeleteNote", () => {
    it("returns true when soft-deleted", async () => {
      mockPrisma.note.update.mockResolvedValue({});

      const result = await softDeleteNote("note-1");
      expect(result).toBe(true);
      expect(mockPrisma.note.update).toHaveBeenCalledWith({
        where: { id: "note-1", deletedAt: null },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it("returns false when not found (P2025)", async () => {
      mockPrisma.note.update.mockRejectedValue(makeP2025Error());

      const result = await softDeleteNote("nonexistent");
      expect(result).toBe(false);
    });

    it("re-throws non-P2025 errors", async () => {
      mockPrisma.note.update.mockRejectedValue(new Error("DB connection failed"));

      await expect(softDeleteNote("note-1")).rejects.toThrow(
        "DB connection failed",
      );
    });
  });

  describe("restoreNote", () => {
    it("restores and returns the note", async () => {
      const row = makeMockNoteRow({ deletedAt: null });
      mockPrisma.note.update.mockResolvedValue(row);

      const result = await restoreNote("note-1");

      expect(result).toEqual(row);
      expect(mockPrisma.note.update).toHaveBeenCalledWith({
        where: { id: "note-1" },
        data: { deletedAt: null },
      });
    });

    it("returns null when not found (P2025)", async () => {
      mockPrisma.note.update.mockRejectedValue(makeP2025Error());

      const result = await restoreNote("nonexistent");
      expect(result).toBeNull();
    });

    it("re-throws non-P2025 errors", async () => {
      mockPrisma.note.update.mockRejectedValue(new Error("DB connection failed"));

      await expect(restoreNote("note-1")).rejects.toThrow(
        "DB connection failed",
      );
    });
  });

  describe("permanentDeleteNote", () => {
    it("returns true when permanently deleted", async () => {
      mockPrisma.note.delete.mockResolvedValue({});

      const result = await permanentDeleteNote("note-1");
      expect(result).toBe(true);
      expect(mockPrisma.note.delete).toHaveBeenCalledWith({
        where: { id: "note-1" },
      });
    });

    it("returns false when not found (P2025)", async () => {
      mockPrisma.note.delete.mockRejectedValue(makeP2025Error());

      const result = await permanentDeleteNote("nonexistent");
      expect(result).toBe(false);
    });

    it("re-throws non-P2025 errors", async () => {
      mockPrisma.note.delete.mockRejectedValue(new Error("DB connection failed"));

      await expect(permanentDeleteNote("note-1")).rejects.toThrow(
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

  describe("listFolders", () => {
    it("returns folder names with counts", async () => {
      mockPrisma.note.groupBy.mockResolvedValue([
        { folder: "personal", _count: { id: 3 } },
        { folder: "work", _count: { id: 5 } },
      ]);

      const result = await listFolders();

      expect(result).toEqual([
        { name: "personal", count: 3 },
        { name: "work", count: 5 },
      ]);
    });

    it("returns empty array when no folders", async () => {
      mockPrisma.note.groupBy.mockResolvedValue([]);

      const result = await listFolders();
      expect(result).toEqual([]);
    });
  });

  describe("reorderNotes", () => {
    it("updates sortOrder for each note in a transaction", async () => {
      mockPrisma.note.update.mockResolvedValue({});

      await reorderNotes([
        { id: "note-1", sortOrder: 0 },
        { id: "note-2", sortOrder: 1 },
      ]);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  describe("renameFolder", () => {
    it("renames all notes in folder and returns count", async () => {
      mockPrisma.note.updateMany.mockResolvedValue({ count: 3 });

      const result = await renameFolder("old-name", "new-name");

      expect(result).toBe(3);
      expect(mockPrisma.note.updateMany).toHaveBeenCalledWith({
        where: { folder: "old-name", deletedAt: null },
        data: { folder: "new-name" },
      });
    });
  });

  describe("deleteFolder", () => {
    it("unfiles all notes in folder and returns count", async () => {
      mockPrisma.note.updateMany.mockResolvedValue({ count: 2 });

      const result = await deleteFolder("work");

      expect(result).toBe(2);
      expect(mockPrisma.note.updateMany).toHaveBeenCalledWith({
        where: { folder: "work", deletedAt: null },
        data: { folder: null },
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

      const result = await listNotes({ search: "match" });

      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
      expect(result.total).toBe(1);
      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].headline).toBe("test <mark>match</mark>");
    });

    it("includes folder filter in FTS query", async () => {
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([]);

      await listNotes({ search: "hello", folder: "work" });

      // Both count and data queries should include folder param
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
      const countCall = mockPrisma.$queryRawUnsafe.mock.calls[0];
      expect(countCall[0]).toContain('"folder"');
      expect(countCall[1]).toBe("hello");
      expect(countCall[2]).toBe("work");
    });

    it("includes tags filter in FTS query", async () => {
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([]);

      await listNotes({ search: "hello", tags: ["js", "react"] });

      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
      const countCall = mockPrisma.$queryRawUnsafe.mock.calls[0];
      expect(countCall[0]).toContain('"tags"');
      expect(countCall[1]).toBe("hello");
      expect(countCall[2]).toBe(JSON.stringify(["js", "react"]));
    });
  });

  describe("listNotes with tags filter (no search)", () => {
    it("passes tags to Prisma where clause", async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);
      mockPrisma.note.count.mockResolvedValue(0);

      await listNotes({ tags: ["todo"] });

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

      const result = await listTags();

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

      const result = await renameTag("old-tag", "new-tag");

      expect(result).toBe(2);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it("deduplicates when newName already exists in tags", async () => {
      mockPrisma.note.findMany.mockResolvedValue([
        { id: "n1", tags: ["old-tag", "new-tag"] },
      ]);
      mockPrisma.note.update.mockResolvedValue({});

      await renameTag("old-tag", "new-tag");

      // The transaction should receive update with deduplicated tags
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it("returns 0 when no notes have the tag", async () => {
      mockPrisma.note.findMany.mockResolvedValue([
        { id: "n1", tags: ["other"] },
      ]);

      const result = await renameTag("nonexistent", "new-tag");

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

      const result = await removeTag("remove-me");

      expect(result).toBe(2);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it("returns 0 when no notes have the tag", async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);

      const result = await removeTag("nonexistent");

      expect(result).toBe(0);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
