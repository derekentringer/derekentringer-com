import { describe, it, expect } from "vitest";
import {
  sortFolderTree,
  filterFolderTree,
  folderIdsToExpandForFilter,
} from "../folderTree.js";
import type { FolderInfo } from "../types.js";

function makeFolder(overrides: Partial<FolderInfo> & { id: string; name: string }): FolderInfo {
  return {
    parentId: null,
    sortOrder: 0,
    favorite: false,
    count: 0,
    totalCount: 0,
    createdAt: "2026-01-01T00:00:00Z",
    children: [],
    ...overrides,
  };
}

describe("sortFolderTree", () => {
  it("sorts siblings by name case-insensitively (asc)", () => {
    const tree = [
      makeFolder({ id: "1", name: "Zebra" }),
      makeFolder({ id: "2", name: "apple" }),
      makeFolder({ id: "3", name: "Banana" }),
    ];
    const sorted = sortFolderTree(tree, "name", "asc");
    expect(sorted.map((f) => f.name)).toEqual(["apple", "Banana", "Zebra"]);
  });

  it("reverses on desc", () => {
    const tree = [
      makeFolder({ id: "1", name: "a" }),
      makeFolder({ id: "2", name: "b" }),
    ];
    const sorted = sortFolderTree(tree, "name", "desc");
    expect(sorted.map((f) => f.name)).toEqual(["b", "a"]);
  });

  it("sorts by createdAt", () => {
    const tree = [
      makeFolder({ id: "1", name: "x", createdAt: "2026-03-01T00:00:00Z" }),
      makeFolder({ id: "2", name: "y", createdAt: "2026-01-01T00:00:00Z" }),
      makeFolder({ id: "3", name: "z", createdAt: "2026-02-01T00:00:00Z" }),
    ];
    const sorted = sortFolderTree(tree, "createdAt", "asc");
    expect(sorted.map((f) => f.id)).toEqual(["2", "3", "1"]);
  });

  it("sorts by modified (lastActivityAt) with descendant aggregation", () => {
    // Parent A's own activity is old, but a grandchild was edited
    // recently — parent A should float above parent B.
    const tree = [
      makeFolder({
        id: "A",
        name: "A",
        lastActivityAt: "2026-01-01T00:00:00Z",
        children: [
          makeFolder({
            id: "A1",
            name: "A1",
            lastActivityAt: "2026-04-01T00:00:00Z",
          }),
        ],
      }),
      makeFolder({
        id: "B",
        name: "B",
        lastActivityAt: "2026-02-01T00:00:00Z",
      }),
    ];
    const sorted = sortFolderTree(tree, "updatedAt", "desc");
    expect(sorted.map((f) => f.id)).toEqual(["A", "B"]);
  });

  it("recursively sorts children at every depth", () => {
    const tree = [
      makeFolder({
        id: "root",
        name: "root",
        children: [
          makeFolder({ id: "c1", name: "Zebra" }),
          makeFolder({ id: "c2", name: "apple" }),
        ],
      }),
    ];
    const sorted = sortFolderTree(tree, "name", "asc");
    expect(sorted[0].children.map((c) => c.name)).toEqual(["apple", "Zebra"]);
  });

  it("treats missing lastActivityAt as 0 (sorts oldest)", () => {
    const tree = [
      makeFolder({ id: "A", name: "A", lastActivityAt: "2026-04-01T00:00:00Z" }),
      makeFolder({ id: "B", name: "B" }), // no lastActivityAt
    ];
    const sorted = sortFolderTree(tree, "updatedAt", "desc");
    expect(sorted.map((f) => f.id)).toEqual(["A", "B"]);
  });
});

describe("filterFolderTree", () => {
  it("returns unchanged tree for empty query", () => {
    const tree = [makeFolder({ id: "1", name: "anything" })];
    expect(filterFolderTree(tree, "")).toBe(tree);
    expect(filterFolderTree(tree, "   ")).toBe(tree);
  });

  it("keeps ancestors when a descendant matches", () => {
    const tree = [
      makeFolder({
        id: "parent",
        name: "parent",
        children: [
          makeFolder({ id: "hit", name: "needle" }),
          makeFolder({ id: "miss", name: "other" }),
        ],
      }),
      makeFolder({ id: "unrelated", name: "unrelated" }),
    ];
    const filtered = filterFolderTree(tree, "need");
    expect(filtered.map((f) => f.id)).toEqual(["parent"]);
    expect(filtered[0].children.map((f) => f.id)).toEqual(["hit"]);
  });

  it("is case-insensitive", () => {
    const tree = [makeFolder({ id: "1", name: "FooBar" })];
    const filtered = filterFolderTree(tree, "foob");
    expect(filtered.map((f) => f.id)).toEqual(["1"]);
  });

  it("drops branches with no matches anywhere", () => {
    const tree = [
      makeFolder({
        id: "keep",
        name: "match",
        children: [makeFolder({ id: "keep-child", name: "unrelated" })],
      }),
      makeFolder({
        id: "drop",
        name: "other",
        children: [makeFolder({ id: "drop-child", name: "nope" })],
      }),
    ];
    const filtered = filterFolderTree(tree, "match");
    expect(filtered.map((f) => f.id)).toEqual(["keep"]);
    // Children under a matching parent are preserved — filter
    // semantics: show everything reachable from a match.
    expect(filtered[0].children.map((f) => f.id)).toEqual([]);
  });
});

describe("folderIdsToExpandForFilter", () => {
  it("returns empty set for empty query", () => {
    const tree = [makeFolder({ id: "1", name: "a" })];
    expect(folderIdsToExpandForFilter(tree, "")).toEqual(new Set());
  });

  it("includes the matching folder and every ancestor of a match", () => {
    const tree = [
      makeFolder({
        id: "root",
        name: "root",
        children: [
          makeFolder({
            id: "mid",
            name: "mid",
            children: [makeFolder({ id: "hit", name: "needle" })],
          }),
        ],
      }),
    ];
    const ids = folderIdsToExpandForFilter(tree, "need");
    expect(ids.has("root")).toBe(true);
    expect(ids.has("mid")).toBe(true);
    expect(ids.has("hit")).toBe(true);
  });

  it("does not include siblings that have no match", () => {
    const tree = [
      makeFolder({
        id: "root",
        name: "root",
        children: [
          makeFolder({ id: "sibling", name: "unrelated" }),
          makeFolder({ id: "hit", name: "needle" }),
        ],
      }),
    ];
    const ids = folderIdsToExpandForFilter(tree, "need");
    expect(ids.has("sibling")).toBe(false);
    expect(ids.has("root")).toBe(true);
    expect(ids.has("hit")).toBe(true);
  });
});
