import { describe, it, expect, vi, beforeEach } from "vitest";

const mockApiFetch = vi.fn();

vi.mock("../api/client.ts", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  tokenManager: {
    setOnAuthFailure: vi.fn(),
    getAccessToken: vi.fn().mockReturnValue(null),
    getMsUntilExpiry: vi.fn().mockReturnValue(null),
  },
}));

import { fetchCompletion, askQuestion, summarizeNote, suggestTags, rewriteText, enableEmbeddings, disableEmbeddings, getEmbeddingStatus, transcribeAudio } from "../api/ai.ts";
import type { AskQuestionEvent } from "../api/ai.ts";

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

  describe("askQuestion", () => {
    it("yields sources event then text chunks", async () => {
      const sseData =
        'data: {"sources":[{"id":"note-1","title":"My Note"}]}\n\ndata: {"text":"Answer"}\n\ndata: {"text":" here"}\n\ndata: [DONE]\n\n';
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
      const events: AskQuestionEvent[] = [];

      for await (const event of askQuestion(
        "What is in my notes?",
        abortController.signal,
      )) {
        events.push(event);
      }

      expect(events).toEqual([
        { sources: [{ id: "note-1", title: "My Note" }] },
        { text: "Answer" },
        { text: " here" },
      ]);
      expect(mockApiFetch).toHaveBeenCalledWith("/ai/ask", {
        method: "POST",
        body: JSON.stringify({ question: "What is in my notes?" }),
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
        for await (const _event of askQuestion(
          "test question",
          abortController.signal,
        )) {
          // Should not reach here
        }
      }).rejects.toThrow("Q&A request failed: 500");
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

  describe("rewriteText", () => {
    it("returns rewritten text string", async () => {
      mockApiFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ text: "Improved version." }),
      });

      const result = await rewriteText("Original text", "rewrite");

      expect(result).toBe("Improved version.");
      expect(mockApiFetch).toHaveBeenCalledWith("/ai/rewrite", {
        method: "POST",
        body: JSON.stringify({ text: "Original text", action: "rewrite" }),
      });
    });

    it("sends correct action in request body", async () => {
      mockApiFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ text: "result" }),
      });

      await rewriteText("test text", "fix-grammar");

      expect(mockApiFetch).toHaveBeenCalledWith("/ai/rewrite", {
        method: "POST",
        body: JSON.stringify({ text: "test text", action: "fix-grammar" }),
      });
    });

    it("throws on non-ok response", async () => {
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(rewriteText("test", "rewrite")).rejects.toThrow(
        "Rewrite failed: 500",
      );
    });
  });

  describe("enableEmbeddings", () => {
    it("sends POST to /ai/embeddings/enable", async () => {
      mockApiFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ enabled: true }),
      });

      const result = await enableEmbeddings();

      expect(result).toEqual({ enabled: true });
      expect(mockApiFetch).toHaveBeenCalledWith("/ai/embeddings/enable", {
        method: "POST",
      });
    });

    it("throws on non-ok response", async () => {
      mockApiFetch.mockResolvedValue({ ok: false, status: 500 });

      await expect(enableEmbeddings()).rejects.toThrow("Enable embeddings failed: 500");
    });
  });

  describe("disableEmbeddings", () => {
    it("sends POST to /ai/embeddings/disable", async () => {
      mockApiFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ enabled: false }),
      });

      const result = await disableEmbeddings();

      expect(result).toEqual({ enabled: false });
      expect(mockApiFetch).toHaveBeenCalledWith("/ai/embeddings/disable", {
        method: "POST",
      });
    });

    it("throws on non-ok response", async () => {
      mockApiFetch.mockResolvedValue({ ok: false, status: 500 });

      await expect(disableEmbeddings()).rejects.toThrow("Disable embeddings failed: 500");
    });
  });

  describe("getEmbeddingStatus", () => {
    it("returns embedding status object", async () => {
      const status = { enabled: true, pendingCount: 3, totalWithEmbeddings: 10 };
      mockApiFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(status),
      });

      const result = await getEmbeddingStatus();

      expect(result).toEqual(status);
      expect(mockApiFetch).toHaveBeenCalledWith("/ai/embeddings/status");
    });

    it("throws on non-ok response", async () => {
      mockApiFetch.mockResolvedValue({ ok: false, status: 500 });

      await expect(getEmbeddingStatus()).rejects.toThrow("Embedding status failed: 500");
    });
  });

  describe("transcribeAudio", () => {
    it("sends FormData to correct endpoint", async () => {
      const mockNote = {
        id: "note-1",
        title: "Audio Note",
        content: "Transcribed text",
        folder: null,
        tags: ["audio"],
        summary: null,
        favorite: false,
        sortOrder: 0,
        favoriteSortOrder: 0,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
        deletedAt: null,
      };
      mockApiFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            title: "Audio Note",
            content: "Transcribed text",
            tags: ["audio"],
            note: mockNote,
          }),
      });

      const blob = new Blob(["audio-data"], { type: "audio/webm" });
      const result = await transcribeAudio(blob, "memo");

      expect(result.title).toBe("Audio Note");
      expect(result.note).toBeDefined();
      expect(mockApiFetch).toHaveBeenCalledWith("/ai/transcribe", {
        method: "POST",
        body: expect.any(FormData),
      });
    });

    it("returns parsed response", async () => {
      const mockNote = {
        id: "note-2",
        title: "Meeting",
        content: "# Meeting\n\nNotes here",
        folder: null,
        tags: ["meeting"],
        summary: null,
        favorite: false,
        sortOrder: 0,
        favoriteSortOrder: 0,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
        deletedAt: null,
      };
      mockApiFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            title: "Meeting",
            content: "# Meeting\n\nNotes here",
            tags: ["meeting"],
            note: mockNote,
          }),
      });

      const blob = new Blob(["audio-data"], { type: "audio/webm" });
      const result = await transcribeAudio(blob, "meeting");

      expect(result.title).toBe("Meeting");
      expect(result.content).toContain("Meeting");
      expect(result.tags).toEqual(["meeting"]);
      expect(result.note.id).toBe("note-2");
    });

    it("throws with server error message", async () => {
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 422,
        json: () => Promise.resolve({ message: "Transcript is empty" }),
      });

      const blob = new Blob(["audio-data"], { type: "audio/webm" });

      await expect(transcribeAudio(blob, "memo")).rejects.toThrow("Transcript is empty");
    });

    it("retries on 502 and succeeds", async () => {
      vi.useFakeTimers();
      const mockNote = {
        id: "note-1",
        title: "Retry Note",
        content: "Retried",
        folder: null,
        tags: [],
        summary: null,
        favorite: false,
        sortOrder: 0,
        favoriteSortOrder: 0,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
        deletedAt: null,
      };
      mockApiFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 502,
          json: () => Promise.resolve({ message: "Bad Gateway" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              title: "Retry Note",
              content: "Retried",
              tags: [],
              note: mockNote,
            }),
        });

      const blob = new Blob(["audio-data"], { type: "audio/webm" });
      const promise = transcribeAudio(blob, "memo");
      await vi.advanceTimersByTimeAsync(2000);
      const result = await promise;

      expect(result.title).toBe("Retry Note");
      expect(mockApiFetch).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });

    it("retries on network error and succeeds", async () => {
      vi.useFakeTimers();
      const mockNote = {
        id: "note-1",
        title: "Net Retry",
        content: "OK",
        folder: null,
        tags: [],
        summary: null,
        favorite: false,
        sortOrder: 0,
        favoriteSortOrder: 0,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
        deletedAt: null,
      };
      mockApiFetch
        .mockRejectedValueOnce(new Error("fetch failed"))
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              title: "Net Retry",
              content: "OK",
              tags: [],
              note: mockNote,
            }),
        });

      const blob = new Blob(["audio-data"], { type: "audio/webm" });
      const promise = transcribeAudio(blob, "memo");
      await vi.advanceTimersByTimeAsync(2000);
      const result = await promise;

      expect(result.title).toBe("Net Retry");
      expect(mockApiFetch).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });

    it("does not retry on 400 client error", async () => {
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: "Bad Request" }),
      });

      const blob = new Blob(["audio-data"], { type: "audio/webm" });

      await expect(transcribeAudio(blob, "memo")).rejects.toThrow("Bad Request");
      expect(mockApiFetch).toHaveBeenCalledTimes(1);
    });

    it("throws after exhausting retries", async () => {
      vi.useFakeTimers();
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 502,
        json: () => Promise.resolve({ message: "Bad Gateway" }),
      });

      const blob = new Blob(["audio-data"], { type: "audio/webm" });
      const promise = transcribeAudio(blob, "memo");
      const assertion = expect(promise).rejects.toThrow("Bad Gateway");
      await vi.advanceTimersByTimeAsync(10000);

      await assertion;
      expect(mockApiFetch).toHaveBeenCalledTimes(3);
      vi.useRealTimers();
    });
  });
});
