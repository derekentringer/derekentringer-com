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
  answerQuestion,
  structureTranscript,
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

    it("uses paragraph system prompt and 500 max_tokens", async () => {
      mockStreamResponse([]);

      for await (const _chunk of generateCompletion("test", undefined, "paragraph")) {
        // consume
      }
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining("Write the next full paragraph"),
          max_tokens: 500,
        }),
      );
    });

    it("uses structure system prompt and 500 max_tokens", async () => {
      mockStreamResponse([]);

      for await (const _chunk of generateCompletion("test", undefined, "structure")) {
        // consume
      }
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining("document structure assistant"),
          max_tokens: 500,
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

  describe("answerQuestion", () => {
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
        { type: "content_block_delta", delta: { type: "text_delta", text: "Based on" } },
        { type: "content_block_delta", delta: { type: "text_delta", text: " your notes" } },
      ]);

      const chunks: string[] = [];
      for await (const chunk of answerQuestion("What is X?", [
        { id: "1", title: "Note 1", content: "Content about X" },
      ])) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(["Based on", " your notes"]);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          temperature: 0.3,
          stream: true,
        }),
      );
    });

    it("includes note contexts in user message", async () => {
      mockStreamResponse([]);

      const noteContexts = [
        { id: "1", title: "First Note", content: "First content" },
        { id: "2", title: "Second Note", content: "Second content" },
      ];

      for await (const _chunk of answerQuestion("my question", noteContexts)) {
        // consume
      }

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              role: "user",
              content: expect.stringContaining("## First Note"),
            },
          ],
        }),
      );
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              role: "user",
              content: expect.stringContaining("## Second Note"),
            },
          ],
        }),
      );
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              role: "user",
              content: expect.stringContaining("Question: my question"),
            },
          ],
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
      for await (const chunk of answerQuestion(
        "question",
        [{ id: "1", title: "Note", content: "Content" }],
        abortController.signal,
      )) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(["First"]);
    });
  });

  describe("structureTranscript", () => {
    it("returns structured transcript on success", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: '{"title":"Meeting Notes","content":"## Summary\\nDiscussed X","tags":["meeting"]}' }],
      });

      const result = await structureTranscript("we discussed X", "meeting");

      expect(result).toEqual({
        title: "Meeting Notes",
        content: "## Summary\nDiscussed X",
        tags: ["meeting"],
      });
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8192,
          temperature: 0.3,
        }),
      );
    });

    it("retries on 502 and succeeds on second attempt", async () => {
      mockCreate
        .mockRejectedValueOnce(Object.assign(new Error("Bad Gateway"), { status: 502 }))
        .mockResolvedValueOnce({
          content: [{ type: "text", text: '{"title":"Notes","content":"Content","tags":[]}' }],
        });

      const result = await structureTranscript("transcript", "meeting");

      expect(result).toEqual({ title: "Notes", content: "Content", tags: [] });
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it("retries on 503 and 504", async () => {
      mockCreate
        .mockRejectedValueOnce(Object.assign(new Error("Service Unavailable"), { status: 503 }))
        .mockRejectedValueOnce(Object.assign(new Error("Gateway Timeout"), { status: 504 }))
        .mockResolvedValueOnce({
          content: [{ type: "text", text: '{"title":"OK","content":"Done","tags":["test"]}' }],
        });

      const result = await structureTranscript("transcript", "lecture");

      expect(result).toEqual({ title: "OK", content: "Done", tags: ["test"] });
      expect(mockCreate).toHaveBeenCalledTimes(3);
    });

    it("retries on 529 (overloaded)", async () => {
      mockCreate
        .mockRejectedValueOnce(Object.assign(new Error("Overloaded"), { status: 529 }))
        .mockResolvedValueOnce({
          content: [{ type: "text", text: '{"title":"Result","content":"Text","tags":[]}' }],
        });

      const result = await structureTranscript("transcript", "memo");

      expect(result).toEqual({ title: "Result", content: "Text", tags: [] });
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it("throws after exhausting retries on 502", async () => {
      mockCreate.mockRejectedValue(Object.assign(new Error("Bad Gateway"), { status: 502 }));

      await expect(structureTranscript("transcript", "meeting")).rejects.toThrow("Bad Gateway");
      expect(mockCreate).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });

    it("does not retry on non-retryable errors like 400", async () => {
      mockCreate.mockRejectedValue(Object.assign(new Error("Bad Request"), { status: 400 }));

      await expect(structureTranscript("transcript", "meeting")).rejects.toThrow("Bad Request");
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it("falls back to raw transcript on invalid JSON response", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: "not valid json" }],
      });

      const result = await structureTranscript("raw transcript", "verbatim");

      expect(result).toEqual({ title: "Audio Note", content: "raw transcript", tags: [] });
    });

    it("uses correct system prompt per mode", async () => {
      const modePromptPairs: [string, string][] = [
        ["meeting", "meeting notes assistant"],
        ["lecture", "lecture notes assistant"],
        ["memo", "note-taking assistant"],
        ["verbatim", "transcription assistant"],
      ];

      for (const [mode, promptSnippet] of modePromptPairs) {
        mockCreate.mockClear();
        mockCreate.mockResolvedValue({
          content: [{ type: "text", text: '{"title":"T","content":"C","tags":[]}' }],
        });

        await structureTranscript("test", mode as "meeting" | "lecture" | "memo" | "verbatim");

        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            system: expect.stringContaining(promptSnippet),
          }),
        );
      }
    });
  });

  describe("suggestTags retry", () => {
    it("retries on 529 and succeeds", async () => {
      mockCreate
        .mockRejectedValueOnce(Object.assign(new Error("Overloaded"), { status: 529 }))
        .mockResolvedValueOnce({
          content: [{ type: "text", text: '["tag1", "tag2"]' }],
        });

      const result = await suggestTags("Title", "Content", []);

      expect(result).toEqual(["tag1", "tag2"]);
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it("throws after exhausting retries", async () => {
      mockCreate.mockRejectedValue(Object.assign(new Error("Overloaded"), { status: 529 }));

      await expect(suggestTags("Title", "Content", [])).rejects.toThrow("Overloaded");
      expect(mockCreate).toHaveBeenCalledTimes(3);
    });

    it("does not retry on non-retryable errors", async () => {
      mockCreate.mockRejectedValue(Object.assign(new Error("Bad Request"), { status: 400 }));

      await expect(suggestTags("Title", "Content", [])).rejects.toThrow("Bad Request");
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe("answerQuestion retry", () => {
    it("retries on 529 and succeeds", async () => {
      mockCreate
        .mockRejectedValueOnce(Object.assign(new Error("Overloaded"), { status: 529 }))
        .mockResolvedValueOnce({
          [Symbol.asyncIterator]: async function* () {
            yield { type: "content_block_delta", delta: { type: "text_delta", text: "Answer" } };
          },
        });

      const chunks: string[] = [];
      for await (const chunk of answerQuestion("question", [
        { id: "1", title: "Note", content: "Content" },
      ])) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(["Answer"]);
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it("throws after exhausting retries", async () => {
      mockCreate.mockRejectedValue(Object.assign(new Error("Overloaded"), { status: 529 }));

      const chunks: string[] = [];
      await expect(async () => {
        for await (const chunk of answerQuestion("question", [
          { id: "1", title: "Note", content: "Content" },
        ])) {
          chunks.push(chunk);
        }
      }).rejects.toThrow("Overloaded");
      expect(mockCreate).toHaveBeenCalledTimes(3);
    });

    it("does not retry on non-retryable errors", async () => {
      mockCreate.mockRejectedValue(Object.assign(new Error("Bad Request"), { status: 400 }));

      await expect(async () => {
        for await (const _chunk of answerQuestion("question", [
          { id: "1", title: "Note", content: "Content" },
        ])) {
          // consume
        }
      }).rejects.toThrow("Bad Request");
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });
});
