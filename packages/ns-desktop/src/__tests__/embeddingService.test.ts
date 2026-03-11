import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockExecute = vi.fn();

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn().mockResolvedValue({
      select: (...args: unknown[]) => mockSelect(...args),
      execute: (...args: unknown[]) => mockExecute(...args),
    }),
  },
}));

vi.mock("../api/ai.ts", () => ({
  requestEmbedding: vi.fn(),
}));

import {
  cosineSimilarity,
  getEmbedding,
  upsertEmbedding,
  deleteEmbedding,
  getAllEmbeddings,
  getEmbeddingStatus,
} from "../lib/embeddingService.ts";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it("returns 0 for empty vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("returns 0 for zero vectors", () => {
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });
});

describe("getEmbedding", () => {
  it("returns parsed embedding when found", async () => {
    mockSelect.mockResolvedValue([{ embedding: "[1,2,3]" }]);
    const result = await getEmbedding("note-1");
    expect(result).toEqual([1, 2, 3]);
    expect(mockSelect).toHaveBeenCalledWith(
      "SELECT embedding FROM note_embeddings WHERE note_id = $1",
      ["note-1"],
    );
  });

  it("returns null when not found", async () => {
    mockSelect.mockResolvedValue([]);
    const result = await getEmbedding("note-missing");
    expect(result).toBeNull();
  });
});

describe("upsertEmbedding", () => {
  it("executes INSERT ON CONFLICT UPDATE", async () => {
    mockExecute.mockResolvedValue({});
    await upsertEmbedding("note-1", [0.1, 0.2]);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO note_embeddings"),
      expect.arrayContaining(["note-1", "[0.1,0.2]"]),
    );
  });
});

describe("deleteEmbedding", () => {
  it("executes DELETE", async () => {
    mockExecute.mockResolvedValue({});
    await deleteEmbedding("note-1");
    expect(mockExecute).toHaveBeenCalledWith(
      "DELETE FROM note_embeddings WHERE note_id = $1",
      ["note-1"],
    );
  });
});

describe("getAllEmbeddings", () => {
  it("maps rows correctly", async () => {
    mockSelect.mockResolvedValue([
      { note_id: "a", embedding: "[1,2]" },
      { note_id: "b", embedding: "[3,4]" },
    ]);
    const result = await getAllEmbeddings();
    expect(result).toEqual([
      { noteId: "a", embedding: [1, 2] },
      { noteId: "b", embedding: [3, 4] },
    ]);
  });
});

describe("getEmbeddingStatus", () => {
  it("returns correct counts", async () => {
    mockSelect
      .mockResolvedValueOnce([{ count: 3 }]) // pending
      .mockResolvedValueOnce([{ count: 10 }]); // embedded
    const status = await getEmbeddingStatus();
    expect(status.pendingCount).toBe(3);
    expect(status.totalWithEmbeddings).toBe(10);
  });
});
