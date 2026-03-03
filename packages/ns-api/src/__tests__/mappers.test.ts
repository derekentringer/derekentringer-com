import { describe, it, expect } from "vitest";
import { toNote } from "../lib/mappers.js";

describe("toNote", () => {
  const now = new Date("2025-06-15T12:00:00.000Z");

  function makePrismaNote(overrides: Record<string, unknown> = {}) {
    return {
      id: "note-1",
      title: "Test Note",
      content: "Some content",
      folder: "work",
      tags: ["tag1", "tag2"],
      summary: "A summary",
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      ...overrides,
    };
  }

  it("maps all fields from PrismaNote to Note", () => {
    const row = makePrismaNote();
    const result = toNote(row as Parameters<typeof toNote>[0]);

    expect(result.id).toBe("note-1");
    expect(result.title).toBe("Test Note");
    expect(result.content).toBe("Some content");
    expect(result.folder).toBe("work");
    expect(result.tags).toEqual(["tag1", "tag2"]);
    expect(result.summary).toBe("A summary");
    expect(result.createdAt).toBe(now.toISOString());
    expect(result.updatedAt).toBe(now.toISOString());
    expect(result.deletedAt).toBeNull();
  });

  it("converts deletedAt date to ISO string", () => {
    const deletedAt = new Date("2025-07-01T00:00:00.000Z");
    const row = makePrismaNote({ deletedAt });
    const result = toNote(row as Parameters<typeof toNote>[0]);

    expect(result.deletedAt).toBe(deletedAt.toISOString());
  });

  it("handles null folder and summary", () => {
    const row = makePrismaNote({ folder: null, summary: null });
    const result = toNote(row as Parameters<typeof toNote>[0]);

    expect(result.folder).toBeNull();
    expect(result.summary).toBeNull();
  });

  it("handles empty tags array", () => {
    const row = makePrismaNote({ tags: [] });
    const result = toNote(row as Parameters<typeof toNote>[0]);

    expect(result.tags).toEqual([]);
  });

  it("filters out non-string values from tags", () => {
    const row = makePrismaNote({ tags: ["valid", 123, null, "also-valid"] });
    const result = toNote(row as Parameters<typeof toNote>[0]);

    expect(result.tags).toEqual(["valid", "also-valid"]);
  });

  it("treats non-array tags as empty array", () => {
    const row = makePrismaNote({ tags: "not-an-array" });
    const result = toNote(row as Parameters<typeof toNote>[0]);

    expect(result.tags).toEqual([]);
  });
});
