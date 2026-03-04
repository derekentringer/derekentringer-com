import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { createMockPrisma } from "./helpers/mockPrisma.js";
import type { MockPrisma } from "./helpers/mockPrisma.js";

let mockPrisma: MockPrisma;

beforeAll(() => {
  mockPrisma = createMockPrisma();
});

const mockGenerateEmbedding = vi.fn();
const mockIsEmbeddingEnabled = vi.fn();

vi.mock("../services/embeddingService.js", () => ({
  generateEmbedding: (...args: unknown[]) => mockGenerateEmbedding(...args),
}));

vi.mock("../store/settingStore.js", () => ({
  isEmbeddingEnabled: () => mockIsEmbeddingEnabled(),
}));

import {
  processAllPendingEmbeddings,
  startEmbeddingProcessor,
} from "../services/embeddingProcessor.js";

describe("embeddingProcessor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("processAllPendingEmbeddings", () => {
    it("processes pending notes until none remain", async () => {
      const note1 = { id: "n1", title: "Note 1", content: "Content 1" };
      const note2 = { id: "n2", title: "Note 2", content: "Content 2" };

      // Call order: getPending(batch1) → update(n1) → update(n2) → getPending(batch2=empty)
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([note1, note2]) // getPendingNotes batch 1
        .mockResolvedValueOnce(undefined)      // updateNoteEmbedding n1
        .mockResolvedValueOnce(undefined)      // updateNoteEmbedding n2
        .mockResolvedValueOnce([]);            // getPendingNotes batch 2 (empty)

      mockGenerateEmbedding
        .mockResolvedValueOnce([0.1, 0.2])
        .mockResolvedValueOnce([0.3, 0.4]);

      // processAllPendingEmbeddings has rate-limit delays; advance fake timers
      const promise = processAllPendingEmbeddings();
      await vi.runAllTimersAsync();
      await promise;

      expect(mockGenerateEmbedding).toHaveBeenCalledTimes(2);
      expect(mockGenerateEmbedding).toHaveBeenCalledWith("Note 1\nContent 1");
      expect(mockGenerateEmbedding).toHaveBeenCalledWith("Note 2\nContent 2");
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(4);
    });

    it("handles per-note errors gracefully and continues", async () => {
      const note1 = { id: "n1", title: "Note 1", content: "Content 1" };
      const note2 = { id: "n2", title: "Note 2", content: "Content 2" };

      // Call order: getPending → (n1 fails, no update) → update(n2) → getPending(empty)
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([note1, note2]) // getPendingNotes batch 1
        .mockResolvedValueOnce(undefined)      // updateNoteEmbedding n2 (n1 fails, skips update)
        .mockResolvedValueOnce([]);            // getPendingNotes batch 2 (empty)

      mockGenerateEmbedding
        .mockRejectedValueOnce(new Error("API error"))
        .mockResolvedValueOnce([0.5, 0.6]);

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const promise = processAllPendingEmbeddings();
      await vi.runAllTimersAsync();
      await promise;

      expect(mockGenerateEmbedding).toHaveBeenCalledTimes(2);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("startEmbeddingProcessor", () => {
    it("returns handle with stop method", () => {
      mockIsEmbeddingEnabled.mockResolvedValue(false);

      const handle = startEmbeddingProcessor();
      expect(handle).toHaveProperty("stop");
      expect(typeof handle.stop).toBe("function");
      handle.stop();
    });

    it("runs processBatch on interval when enabled", async () => {
      mockIsEmbeddingEnabled.mockResolvedValue(true);
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      const handle = startEmbeddingProcessor();

      await vi.advanceTimersByTimeAsync(60_000);

      expect(mockIsEmbeddingEnabled).toHaveBeenCalled();
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalled();

      handle.stop();
    });

    it("skips processing when disabled", async () => {
      mockIsEmbeddingEnabled.mockResolvedValue(false);

      const handle = startEmbeddingProcessor();

      await vi.advanceTimersByTimeAsync(60_000);

      expect(mockIsEmbeddingEnabled).toHaveBeenCalled();
      // Should not query for pending notes
      expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();

      handle.stop();
    });
  });
});
