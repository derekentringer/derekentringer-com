import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Anthropic SDK
const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: mockCreate,
      };
    },
  };
});

vi.mock("../config.js", () => ({
  loadConfig: () => ({
    anthropicApiKey: "test-key",
  }),
}));

import {
  generateCompletion,
  generateSummary,
  suggestTags,
  resetClient,
} from "../services/aiService.js";

beforeEach(() => {
  vi.clearAllMocks();
  resetClient();
});

describe("aiService", () => {
  describe("generateCompletion", () => {
    function mockStreamResponse(events: unknown[]) {
      mockCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          for (const event of events) {
            yield event;
          }
        },
      });
    }

    it("yields streamed text chunks", async () => {
      mockStreamResponse([
        { type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } },
        { type: "content_block_delta", delta: { type: "text_delta", text: " world" } },
      ]);

      const chunks: string[] = [];
      for await (const chunk of generateCompletion("test context")) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(["Hello", " world"]);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "claude-sonnet-4-20250514",
          max_tokens: 200,
          temperature: 0.7,
          stream: true,
        }),
      );
    });

    it("stops when signal is aborted", async () => {
      const abortController = new AbortController();

      mockCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: "content_block_delta",
            delta: { type: "text_delta", text: "First" },
          };
          abortController.abort();
          yield {
            type: "content_block_delta",
            delta: { type: "text_delta", text: "Second" },
          };
        },
      });

      const chunks: string[] = [];
      for await (const chunk of generateCompletion(
        "test",
        abortController.signal,
      )) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(["First"]);
    });

    it("skips non-text-delta events", async () => {
      mockStreamResponse([
        { type: "message_start", message: {} },
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "text" },
        },
        { type: "message_stop" },
      ]);

      const chunks: string[] = [];
      for await (const chunk of generateCompletion("test")) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(["text"]);
    });
  });

  describe("generateSummary", () => {
    it("returns summary text", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: "This is a summary." }],
      });

      const result = await generateSummary("Title", "Content here");

      expect(result).toBe("This is a summary.");
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "claude-sonnet-4-20250514",
          max_tokens: 150,
          temperature: 0.3,
        }),
      );
    });

    it("returns empty string for non-text response", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "tool_use", id: "t1" }],
      });

      const result = await generateSummary("Title", "Content");
      expect(result).toBe("");
    });

    it("trims whitespace from response", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: "  Summary with spaces  " }],
      });

      const result = await generateSummary("Title", "Content");
      expect(result).toBe("Summary with spaces");
    });
  });

  describe("suggestTags", () => {
    it("parses JSON array from response", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: '["javascript", "react"]' }],
      });

      const result = await suggestTags("Title", "Content", ["existing"]);

      expect(result).toEqual(["javascript", "react"]);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "claude-sonnet-4-20250514",
          max_tokens: 100,
          temperature: 0.3,
        }),
      );
    });

    it("includes existing tags in system prompt", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: '["tag1"]' }],
      });

      await suggestTags("Title", "Content", ["existing1", "existing2"]);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining("existing1"),
        }),
      );
    });

    it("returns empty array on invalid JSON", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: "not valid json" }],
      });

      const result = await suggestTags("Title", "Content", []);
      expect(result).toEqual([]);
    });

    it("filters non-string values from array", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: '["valid", 123, null, "also-valid"]' }],
      });

      const result = await suggestTags("Title", "Content", []);
      expect(result).toEqual(["valid", "also-valid"]);
    });

    it("returns empty array for non-text response", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "tool_use", id: "t1" }],
      });

      const result = await suggestTags("Title", "Content", []);
      expect(result).toEqual([]);
    });
  });
});
