import bcrypt from "bcryptjs";

const TEST_PASSWORD = "testpassword123";
const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync(TEST_PASSWORD, 10);
process.env.JWT_SECRET = "test-jwt-secret-for-ai-routes-min32ch";
process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret-for-ai-min32ch";
process.env.CORS_ORIGIN = "http://localhost:3005";

import { describe, it, expect, afterAll, afterEach, vi, beforeAll } from "vitest";
import { createMockPrisma } from "./helpers/mockPrisma.js";
import type { MockPrisma } from "./helpers/mockPrisma.js";

let mockPrisma: MockPrisma;

beforeAll(() => {
  mockPrisma = createMockPrisma();
});

const mockGenerateCompletion = vi.fn();
const mockGenerateSummary = vi.fn();
const mockSuggestTags = vi.fn();

vi.mock("../services/aiService.js", () => ({
  generateCompletion: (...args: unknown[]) => mockGenerateCompletion(...args),
  generateSummary: (...args: unknown[]) => mockGenerateSummary(...args),
  suggestTags: (...args: unknown[]) => mockSuggestTags(...args),
}));

import { buildApp } from "../app.js";

describe("AI routes", () => {
  const app = buildApp({ disableRateLimit: true });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function getAccessToken(): Promise<string> {
    mockPrisma.refreshToken.create.mockResolvedValue({});

    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { username: "admin", password: TEST_PASSWORD },
    });
    return res.json().accessToken;
  }

  function makeMockNoteRow(overrides: Record<string, unknown> = {}) {
    return {
      id: VALID_UUID,
      title: "Test Note",
      content: "Some content here",
      folder: null,
      tags: ["existing-tag"],
      summary: null,
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...overrides,
    };
  }

  // --- POST /ai/complete ---

  describe("POST /ai/complete", () => {
    it("returns SSE stream (200)", async () => {
      const token = await getAccessToken();
      mockGenerateCompletion.mockImplementation(async function* () {
        yield "Hello";
        yield " world";
      });

      const res = await app.inject({
        method: "POST",
        url: "/ai/complete",
        headers: { authorization: `Bearer ${token}` },
        payload: { context: "Some context text" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("text/event-stream");
      expect(res.body).toContain("data:");
      expect(res.body).toContain("[DONE]");
    });

    it("returns 400 with missing context", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "POST",
        url: "/ai/complete",
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/ai/complete",
        payload: { context: "test" },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // --- POST /ai/summarize ---

  describe("POST /ai/summarize", () => {
    it("generates summary and updates note (200)", async () => {
      const token = await getAccessToken();
      const noteRow = makeMockNoteRow();
      mockPrisma.note.findUnique.mockResolvedValue(noteRow);
      mockPrisma.note.update.mockResolvedValue({
        ...noteRow,
        summary: "A test summary.",
      });
      mockGenerateSummary.mockResolvedValue("A test summary.");

      const res = await app.inject({
        method: "POST",
        url: "/ai/summarize",
        headers: { authorization: `Bearer ${token}` },
        payload: { noteId: VALID_UUID },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.summary).toBe("A test summary.");
      expect(mockGenerateSummary).toHaveBeenCalledWith(
        "Test Note",
        "Some content here",
      );
    });

    it("returns 404 if note not found", async () => {
      const token = await getAccessToken();
      mockPrisma.note.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "POST",
        url: "/ai/summarize",
        headers: { authorization: `Bearer ${token}` },
        payload: { noteId: VALID_UUID },
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 400 with invalid UUID", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "POST",
        url: "/ai/summarize",
        headers: { authorization: `Bearer ${token}` },
        payload: { noteId: "invalid-id" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/ai/summarize",
        payload: { noteId: VALID_UUID },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // --- POST /ai/tags ---

  describe("POST /ai/tags", () => {
    it("returns suggested tags (200)", async () => {
      const token = await getAccessToken();
      const noteRow = makeMockNoteRow();
      mockPrisma.note.findUnique.mockResolvedValue(noteRow);
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        { name: "existing-tag", count: 1 },
      ]);
      mockSuggestTags.mockResolvedValue(["javascript", "react"]);

      const res = await app.inject({
        method: "POST",
        url: "/ai/tags",
        headers: { authorization: `Bearer ${token}` },
        payload: { noteId: VALID_UUID },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.tags).toEqual(["javascript", "react"]);
      expect(mockSuggestTags).toHaveBeenCalledWith(
        "Test Note",
        "Some content here",
        ["existing-tag"],
      );
    });

    it("returns 404 if note not found", async () => {
      const token = await getAccessToken();
      mockPrisma.note.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "POST",
        url: "/ai/tags",
        headers: { authorization: `Bearer ${token}` },
        payload: { noteId: VALID_UUID },
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 400 with invalid UUID", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "POST",
        url: "/ai/tags",
        headers: { authorization: `Bearer ${token}` },
        payload: { noteId: "invalid-id" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/ai/tags",
        payload: { noteId: VALID_UUID },
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
