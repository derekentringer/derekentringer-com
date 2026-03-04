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
  rewriteText,
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

    it("uses different system prompts for different styles", async () => {
      mockStreamResponse([]);

      // Test "continue" style (default)
      for await (const _chunk of generateCompletion("test", undefined, "continue")) {
        // consume
      }
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining("Continue the user's markdown text naturally"),
        }),
      );

      mockCreate.mockClear();
      mockStreamResponse([]);

      // Test "markdown" style
      for await (const _chunk of generateCompletion("test", undefined, "markdown")) {
        // consume
      }
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining("markdown formatting assistant"),
        }),
      );

      mockCreate.mockClear();
      mockStreamResponse([]);

      // Test "brief" style
      for await (const _chunk of generateCompletion("test", undefined, "brief")) {
        // consume
      }
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining("just a few words"),
        }),
      );
    });

    it("brief style uses lower max_tokens", async () => {
      mockStreamResponse([]);

      for await (const _chunk of generateCompletion("test", undefined, "brief")) {
        // consume
      }

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 50,
        }),
      );
    });

    it("defaults to continue style", async () => {
      mockStreamResponse([]);

      for await (const _chunk of generateCompletion("test")) {
        // consume
      }

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 200,
          system: expect.stringContaining("Continue the user's markdown text naturally"),
        }),
      );
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

  describe("rewriteText", () => {
    it("returns rewritten text", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: "Rewritten version." }],
      });

      const result = await rewriteText("Original text", "rewrite");

      expect(result).toBe("Rewritten version.");
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "claude-sonnet-4-20250514",
          max_tokens: 500,
          temperature: 0.3,
        }),
      );
    });

    it("uses correct system prompt for each action", async () => {
      const actionPromptPairs: [string, string][] = [
        ["rewrite", "Rewrite the user's text"],
        ["concise", "Make the user's text more concise"],
        ["fix-grammar", "Fix any grammar"],
        ["to-list", "Convert the user's text into a markdown bulleted list"],
        ["expand", "Expand the user's text"],
        ["summarize", "Summarize the user's text"],
      ];

      for (const [action, promptSnippet] of actionPromptPairs) {
        mockCreate.mockClear();
        mockCreate.mockResolvedValue({
          content: [{ type: "text", text: "result" }],
        });

        await rewriteText("test", action as "rewrite" | "concise" | "fix-grammar" | "to-list" | "expand" | "summarize");

        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            system: expect.stringContaining(promptSnippet),
          }),
        );
      }
    });

    it("uses correct max_tokens per action", async () => {
      const actionMaxTokens: Record<string, number> = {
        rewrite: 500,
        concise: 300,
        "fix-grammar": 500,
        "to-list": 500,
        expand: 800,
        summarize: 200,
      };

      for (const [action, maxTokens] of Object.entries(actionMaxTokens)) {
        mockCreate.mockClear();
        mockCreate.mockResolvedValue({
          content: [{ type: "text", text: "result" }],
        });

        await rewriteText("test", action as "rewrite" | "concise" | "fix-grammar" | "to-list" | "expand" | "summarize");

        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            max_tokens: maxTokens,
          }),
        );
      }
    });

    it("returns empty string for non-text response", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "tool_use", id: "t1" }],
      });

      const result = await rewriteText("test", "rewrite");
      expect(result).toBe("");
    });

    it("trims whitespace from response", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: "  Trimmed result  " }],
      });

      const result = await rewriteText("test", "concise");
      expect(result).toBe("Trimmed result");
    });
  });
});
