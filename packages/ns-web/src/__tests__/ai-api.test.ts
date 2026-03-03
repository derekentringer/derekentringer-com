import { describe, it, expect, vi, beforeEach } from "vitest";

const mockApiFetch = vi.fn();

vi.mock("../api/client.ts", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import { fetchCompletion, summarizeNote, suggestTags } from "../api/ai.ts";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AI API client", () => {
  describe("fetchCompletion", () => {
    it("yields text chunks from SSE stream", async () => {
      const sseData =
        'data: {"text":"Hello"}\n\ndata: {"text":" world"}\n\ndata: [DONE]\n\n';
      const encoder = new TextEncoder();

      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: encoder.encode(sseData),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      };

      mockApiFetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const abortController = new AbortController();
      const chunks: string[] = [];

      for await (const chunk of fetchCompletion(
        "test context",
        abortController.signal,
      )) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(["Hello", " world"]);
      expect(mockApiFetch).toHaveBeenCalledWith("/ai/complete", {
        method: "POST",
        body: JSON.stringify({ context: "test context" }),
        signal: abortController.signal,
      });
    });

    it("sends style in request body when provided", async () => {
      const sseData = 'data: {"text":"Hello"}\n\ndata: [DONE]\n\n';
      const encoder = new TextEncoder();

      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: encoder.encode(sseData),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      };

      mockApiFetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const abortController = new AbortController();
      const chunks: string[] = [];

      for await (const chunk of fetchCompletion(
        "test context",
        abortController.signal,
        "brief",
      )) {
        chunks.push(chunk);
      }

      expect(mockApiFetch).toHaveBeenCalledWith("/ai/complete", {
        method: "POST",
        body: JSON.stringify({ context: "test context", style: "brief" }),
        signal: abortController.signal,
      });
    });

    it("throws on non-ok response", async () => {
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const abortController = new AbortController();

      await expect(async () => {
        for await (const _chunk of fetchCompletion(
          "test",
          abortController.signal,
        )) {
          // Should not reach here
        }
      }).rejects.toThrow("AI completion failed: 500");
    });

    it("handles empty body gracefully", async () => {
      mockApiFetch.mockResolvedValue({
        ok: true,
        body: null,
      });

      const abortController = new AbortController();
      const chunks: string[] = [];

      for await (const chunk of fetchCompletion(
        "test",
        abortController.signal,
      )) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([]);
    });
  });

  describe("summarizeNote", () => {
    it("returns summary string", async () => {
      mockApiFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ summary: "A concise summary." }),
      });

      const result = await summarizeNote("note-1");

      expect(result).toBe("A concise summary.");
      expect(mockApiFetch).toHaveBeenCalledWith("/ai/summarize", {
        method: "POST",
        body: JSON.stringify({ noteId: "note-1" }),
      });
    });

    it("throws on non-ok response", async () => {
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 404,
      });

      await expect(summarizeNote("note-1")).rejects.toThrow(
        "Summarize failed: 404",
      );
    });
  });

  describe("suggestTags", () => {
    it("returns tags array", async () => {
      mockApiFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ tags: ["javascript", "react"] }),
      });

      const result = await suggestTags("note-1");

      expect(result).toEqual(["javascript", "react"]);
      expect(mockApiFetch).toHaveBeenCalledWith("/ai/tags", {
        method: "POST",
        body: JSON.stringify({ noteId: "note-1" }),
      });
    });

    it("throws on non-ok response", async () => {
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(suggestTags("note-1")).rejects.toThrow(
        "Tag suggestion failed: 500",
      );
    });
  });
});
