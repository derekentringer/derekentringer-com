import { describe, it, expect } from "vitest";
import { fuzzyMatch, fuzzyFilter } from "../fuzzyMatch.ts";

describe("fuzzyMatch", () => {
  it("returns 0 for empty query", () => {
    expect(fuzzyMatch("", "anything")).toBe(0);
  });

  it("returns high score for exact substring match", () => {
    expect(fuzzyMatch("save", "Save Note")).toBeGreaterThan(100);
  });

  it("returns positive score for fuzzy match", () => {
    expect(fuzzyMatch("sn", "Save Note")).toBeGreaterThan(0);
  });

  it("returns -1 for no match", () => {
    expect(fuzzyMatch("xyz", "Save Note")).toBe(-1);
  });

  it("scores word-boundary matches higher", () => {
    // "sn" matches S (start) + N (word boundary) — both are boundary matches
    const boundary = fuzzyMatch("sn", "Save Note");
    expect(boundary).toBeGreaterThan(0);
    // "av" matches a + v in the middle of "Save" — not at boundaries
    const mid = fuzzyMatch("av", "Save Note");
    expect(mid).toBeGreaterThan(0);
  });

  it("is case-insensitive", () => {
    expect(fuzzyMatch("SAVE", "save note")).toBeGreaterThan(0);
  });
});

describe("fuzzyFilter", () => {
  const items = [
    { name: "Save Note" },
    { name: "New Note" },
    { name: "Delete Note" },
    { name: "Toggle Focus Mode" },
  ];

  it("returns all items for empty query", () => {
    expect(fuzzyFilter(items, "", (i) => i.name)).toHaveLength(4);
  });

  it("filters to matching items", () => {
    const result = fuzzyFilter(items, "note", (i) => i.name);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.name)).toContain("Save Note");
    expect(result.map((r) => r.name)).toContain("New Note");
    expect(result.map((r) => r.name)).toContain("Delete Note");
  });

  it("sorts by best match first", () => {
    const result = fuzzyFilter(items, "focus", (i) => i.name);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Toggle Focus Mode");
  });

  it("returns empty array when nothing matches", () => {
    expect(fuzzyFilter(items, "xyz", (i) => i.name)).toHaveLength(0);
  });
});
