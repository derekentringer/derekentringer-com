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

import { fetchCompletion, summarizeNote, suggestTags, rewriteText, requestEmbedding, requestQueryEmbedding, transcribeAudio, askQuestion, type AskQuestionEvent } from "../api/ai.ts";

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

  describe("rewriteText", () => {
    it("returns rewritten text on success", async () => {
      mockApiFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ text: "Rewritten content here." }),
      });

      const result = await rewriteText("Original text", "concise");

      expect(result).toBe("Rewritten content here.");
    });

    it("throws on non-ok response", async () => {
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(rewriteText("text", "rewrite")).rejects.toThrow(
        "Rewrite failed: 500",
      );
    });

    it("sends correct text and action in request body", async () => {
      mockApiFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ text: "result" }),
      });

      await rewriteText("Some text to rewrite", "fix-grammar");

      expect(mockApiFetch).toHaveBeenCalledWith("/ai/rewrite", {
        method: "POST",
        body: JSON.stringify({ text: "Some text to rewrite", action: "fix-grammar" }),
      });
    });
  });

  describe("requestEmbedding", () => {
    it("returns embedding array", async () => {
      mockApiFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ embedding: [0.1, 0.2, 0.3] }),
      });

      const result = await requestEmbedding("test text");

      expect(result).toEqual([0.1, 0.2, 0.3]);
      expect(mockApiFetch).toHaveBeenCalledWith("/ai/embeddings/generate", {
        method: "POST",
        body: JSON.stringify({ text: "test text", inputType: "document" }),
      });
    });

    it("throws on non-ok response", async () => {
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(requestEmbedding("test")).rejects.toThrow("Embedding failed: 500");
    });
  });

  describe("requestQueryEmbedding", () => {
    it("sends query inputType and returns embedding", async () => {
      mockApiFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ embedding: [0.4, 0.5] }),
      });

      const result = await requestQueryEmbedding("search query");

      expect(result).toEqual([0.4, 0.5]);
      expect(mockApiFetch).toHaveBeenCalledWith("/ai/embeddings/generate", {
        method: "POST",
        body: JSON.stringify({ text: "search query", inputType: "query" }),
      });
    });
  });

  describe("transcribeAudio", () => {
    it("sends FormData and returns transcribe result", async () => {
      const mockResult = {
        title: "Meeting Notes",
        content: "Discussion about Q4 goals.",
        tags: ["meeting"],
        note: { id: "note-1", title: "Meeting Notes" },
      };

      mockApiFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResult),
      });

      const blob = new Blob(["audio-data"], { type: "audio/webm" });
      const result = await transcribeAudio(blob, "meeting");

      expect(result).toEqual(mockResult);
      expect(mockApiFetch).toHaveBeenCalledWith("/ai/transcribe", {
        method: "POST",
        body: expect.any(FormData),
      });

      const formData = mockApiFetch.mock.calls[0][1].body as FormData;
      expect(formData.get("mode")).toBe("meeting");
      expect(formData.get("file")).toBeInstanceOf(File);
    });

    it("throws server message on error response", async () => {
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: "Audio too short" }),
      });

      const blob = new Blob(["audio"], { type: "audio/webm" });
      await expect(transcribeAudio(blob, "memo")).rejects.toThrow("Audio too short");
    });

    it("throws default message when server JSON parsing fails", async () => {
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error("not json")),
      });

      const blob = new Blob(["audio"], { type: "audio/webm" });
      await expect(transcribeAudio(blob, "verbatim")).rejects.toThrow("Transcribe failed: 500");
    });
  });

  describe("askQuestion", () => {
    it("yields text events from SSE stream", async () => {
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
      const events: AskQuestionEvent[] = [];

      for await (const event of askQuestion("What is React?", abortController.signal)) {
        events.push(event);
      }

      expect(events).toEqual([{ text: "Hello" }, { text: " world" }]);
      expect(mockApiFetch).toHaveBeenCalledWith("/ai/ask", {
        method: "POST",
        body: JSON.stringify({ question: "What is React?" }),
        signal: abortController.signal,
      });
    });

    it("yields source events", async () => {
      const sseData =
        'data: {"sources":[{"id":"n1","title":"Note 1"}]}\n\ndata: {"text":"Answer"}\n\ndata: [DONE]\n\n';
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

      for await (const event of askQuestion("test", abortController.signal)) {
        events.push(event);
      }

      expect(events).toEqual([
        { sources: [{ id: "n1", title: "Note 1" }] },
        { text: "Answer" },
      ]);
    });

    it("throws on non-ok response", async () => {
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const abortController = new AbortController();

      await expect(async () => {
        for await (const _event of askQuestion("test", abortController.signal)) {
          // Should not reach here
        }
      }).rejects.toThrow("Q&A request failed: 500");
    });
  });
});
