import { describe, it, expect, vi, beforeEach } from "vitest";

// Set env vars before importing config
process.env.VOYAGE_API_KEY = "test-voyage-key";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { generateEmbedding, generateQueryEmbedding } from "../services/embeddingService.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("embeddingService", () => {
  it("calls Voyage API with correct model and input_type for document", async () => {
    const mockEmbedding = [0.1, 0.2, 0.3];
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ embedding: mockEmbedding }] }),
    });

    const result = await generateEmbedding("test text");

    expect(result).toEqual(mockEmbedding);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.voyageai.com/v1/embeddings",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-voyage-key",
        }),
      }),
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe("voyage-3-lite");
    expect(body.input_type).toBe("document");
  });

  it("calls with input_type query for generateQueryEmbedding", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ embedding: [0.1] }] }),
    });

    await generateQueryEmbedding("search query");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.input_type).toBe("query");
  });

  it("truncates input to 4000 chars", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ embedding: [0.1] }] }),
    });

    const longText = "a".repeat(5000);
    await generateEmbedding(longText);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.input[0]).toHaveLength(4000);
  });

  it("throws on API error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve("Rate limited"),
    });

    await expect(generateEmbedding("test")).rejects.toThrow(
      "Voyage API error (429): Rate limited",
    );
  });

  it("returns embedding array from response data", async () => {
    const expected = [0.5, 0.6, 0.7, 0.8];
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ embedding: expected }] }),
    });

    const result = await generateEmbedding("hello");
    expect(result).toEqual(expected);
  });
});
