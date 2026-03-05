process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD_HASH = "unused";
process.env.JWT_SECRET = "test-jwt-secret-for-link-store-min32c";
process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret-for-link-min32ch";
process.env.CORS_ORIGIN = "http://localhost:3005";

import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { createMockPrisma } from "./helpers/mockPrisma.js";
import type { MockPrisma } from "./helpers/mockPrisma.js";
import {
  extractWikiLinks,
  syncNoteLinks,
  getBacklinks,
  listNoteTitles,
} from "../store/linkStore.js";

let mockPrisma: MockPrisma;

beforeAll(() => {
  mockPrisma = createMockPrisma();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("extractWikiLinks", () => {
  it("extracts a single wiki link", () => {
    expect(extractWikiLinks("Check [[My Note]] here")).toEqual(["My Note"]);
  });

  it("extracts multiple wiki links", () => {
    expect(
      extractWikiLinks("See [[Note A]] and [[Note B]] for details"),
    ).toEqual(["Note A", "Note B"]);
  });

  it("deduplicates case-insensitively", () => {
    const result = extractWikiLinks("[[Hello]] and [[hello]] and [[HELLO]]");
    expect(result).toEqual(["Hello"]);
  });

  it("returns empty array when no links", () => {
    expect(extractWikiLinks("No links here")).toEqual([]);
  });

  it("trims whitespace in link text", () => {
    expect(extractWikiLinks("[[  My Note  ]]")).toEqual(["My Note"]);
  });

  it("handles empty brackets", () => {
    expect(extractWikiLinks("[[]]")).toEqual([]);
  });

  it("handles whitespace-only brackets", () => {
    expect(extractWikiLinks("[[   ]]")).toEqual([]);
  });

  it("does not match nested brackets", () => {
    // [[a[b]c]] should not match because inner brackets break the pattern
    expect(extractWikiLinks("[[a[b]c]]")).toEqual([]);
  });
});

describe("syncNoteLinks", () => {
  it("deletes old links and creates new ones", async () => {
    mockPrisma.noteLink.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      { id: "target-1", title: "Target Note" },
    ]);
    mockPrisma.noteLink.createMany.mockResolvedValue({ count: 1 });

    await syncNoteLinks("source-1", "See [[Target Note]] for info");

    expect(mockPrisma.noteLink.deleteMany).toHaveBeenCalledWith({
      where: { sourceNoteId: "source-1" },
    });
    expect(mockPrisma.noteLink.createMany).toHaveBeenCalledWith({
      data: [
        {
          sourceNoteId: "source-1",
          targetNoteId: "target-1",
          linkText: "Target Note",
        },
      ],
    });
  });

  it("skips self-links", async () => {
    mockPrisma.noteLink.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      { id: "source-1", title: "Self Note" },
    ]);
    mockPrisma.noteLink.createMany.mockResolvedValue({ count: 0 });

    await syncNoteLinks("source-1", "See [[Self Note]] here");

    // createMany should not be called since the only link is a self-link
    expect(mockPrisma.noteLink.createMany).not.toHaveBeenCalled();
  });

  it("does nothing when no links found", async () => {
    mockPrisma.noteLink.deleteMany.mockResolvedValue({ count: 0 });

    await syncNoteLinks("source-1", "No links here");

    expect(mockPrisma.noteLink.deleteMany).toHaveBeenCalled();
    expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(mockPrisma.noteLink.createMany).not.toHaveBeenCalled();
  });
});

describe("getBacklinks", () => {
  it("returns backlinks from non-deleted source notes", async () => {
    mockPrisma.noteLink.findMany.mockResolvedValue([
      {
        id: "link-1",
        sourceNoteId: "src-1",
        targetNoteId: "target-1",
        linkText: "My Note",
        sourceNote: { id: "src-1", title: "Source Note", deletedAt: null },
      },
    ]);

    const result = await getBacklinks("target-1");

    expect(result).toEqual([
      { noteId: "src-1", noteTitle: "Source Note", linkText: "My Note" },
    ]);
  });

  it("filters out deleted source notes", async () => {
    mockPrisma.noteLink.findMany.mockResolvedValue([
      {
        id: "link-1",
        sourceNoteId: "src-1",
        targetNoteId: "target-1",
        linkText: "My Note",
        sourceNote: { id: "src-1", title: "Deleted Note", deletedAt: new Date() },
      },
    ]);

    const result = await getBacklinks("target-1");

    expect(result).toEqual([]);
  });

  it("returns empty array when no backlinks", async () => {
    mockPrisma.noteLink.findMany.mockResolvedValue([]);

    const result = await getBacklinks("target-1");

    expect(result).toEqual([]);
  });
});

describe("listNoteTitles", () => {
  it("returns note titles", async () => {
    mockPrisma.note.findMany.mockResolvedValue([
      { id: "1", title: "Alpha" },
      { id: "2", title: "Beta" },
    ]);

    const result = await listNoteTitles();

    expect(result).toEqual([
      { id: "1", title: "Alpha" },
      { id: "2", title: "Beta" },
    ]);
  });
});
