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
const mockRewriteText = vi.fn();
const mockStructureTranscript = vi.fn();

vi.mock("../services/aiService.js", () => ({
  generateCompletion: (...args: unknown[]) => mockGenerateCompletion(...args),
  generateSummary: (...args: unknown[]) => mockGenerateSummary(...args),
  suggestTags: (...args: unknown[]) => mockSuggestTags(...args),
  rewriteText: (...args: unknown[]) => mockRewriteText(...args),
  structureTranscript: (...args: unknown[]) => mockStructureTranscript(...args),
}));

const mockTranscribeAudio = vi.fn();

vi.mock("../services/whisperService.js", () => ({
  transcribeAudio: (...args: unknown[]) => mockTranscribeAudio(...args),
}));

const mockSetEmbeddingEnabled = vi.fn();
const mockIsEmbeddingEnabled = vi.fn();

vi.mock("../store/settingStore.js", () => ({
  setEmbeddingEnabled: (...args: unknown[]) => mockSetEmbeddingEnabled(...args),
  isEmbeddingEnabled: () => mockIsEmbeddingEnabled(),
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}));

const mockProcessAllPendingEmbeddings = vi.fn();

vi.mock("../services/embeddingProcessor.js", () => ({
  processAllPendingEmbeddings: () => mockProcessAllPendingEmbeddings(),
  startEmbeddingProcessor: () => ({ stop: () => {} }),
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

    it("accepts style parameter", async () => {
      const token = await getAccessToken();
      mockGenerateCompletion.mockImplementation(async function* () {
        yield "Hello";
      });

      const res = await app.inject({
        method: "POST",
        url: "/ai/complete",
        headers: { authorization: `Bearer ${token}` },
        payload: { context: "Some context", style: "brief" },
      });

      expect(res.statusCode).toBe(200);
      expect(mockGenerateCompletion).toHaveBeenCalledWith(
        "Some context",
        expect.any(Object),
        "brief",
      );
    });

    it("style is optional and defaults to continue", async () => {
      const token = await getAccessToken();
      mockGenerateCompletion.mockImplementation(async function* () {
        yield "text";
      });

      const res = await app.inject({
        method: "POST",
        url: "/ai/complete",
        headers: { authorization: `Bearer ${token}` },
        payload: { context: "Some context" },
      });

      expect(res.statusCode).toBe(200);
      expect(mockGenerateCompletion).toHaveBeenCalledWith(
        "Some context",
        expect.any(Object),
        "continue",
      );
    });

    it("returns 400 with invalid style", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "POST",
        url: "/ai/complete",
        headers: { authorization: `Bearer ${token}` },
        payload: { context: "test", style: "invalid-style" },
      });

      expect(res.statusCode).toBe(400);
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

  // --- POST /ai/rewrite ---

  describe("POST /ai/rewrite", () => {
    it("returns 200 with rewritten text", async () => {
      const token = await getAccessToken();
      mockRewriteText.mockResolvedValue("Improved text here.");

      const res = await app.inject({
        method: "POST",
        url: "/ai/rewrite",
        headers: { authorization: `Bearer ${token}` },
        payload: { text: "Some rough draft text", action: "rewrite" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.text).toBe("Improved text here.");
      expect(mockRewriteText).toHaveBeenCalledWith(
        "Some rough draft text",
        "rewrite",
      );
    });

    it("accepts all valid actions", async () => {
      const token = await getAccessToken();
      const actions = [
        "rewrite",
        "concise",
        "fix-grammar",
        "to-list",
        "expand",
        "summarize",
      ];

      for (const action of actions) {
        mockRewriteText.mockResolvedValue("result");

        const res = await app.inject({
          method: "POST",
          url: "/ai/rewrite",
          headers: { authorization: `Bearer ${token}` },
          payload: { text: "test text", action },
        });

        expect(res.statusCode).toBe(200);
      }
    });

    it("returns 400 with missing text", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "POST",
        url: "/ai/rewrite",
        headers: { authorization: `Bearer ${token}` },
        payload: { action: "rewrite" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 with missing action", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "POST",
        url: "/ai/rewrite",
        headers: { authorization: `Bearer ${token}` },
        payload: { text: "some text" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 with invalid action", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "POST",
        url: "/ai/rewrite",
        headers: { authorization: `Bearer ${token}` },
        payload: { text: "some text", action: "invalid-action" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/ai/rewrite",
        payload: { text: "some text", action: "rewrite" },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // --- POST /ai/embeddings/enable ---
  describe("POST /ai/embeddings/enable", () => {
    it("returns 200 with enabled true", async () => {
      const token = await getAccessToken();
      mockSetEmbeddingEnabled.mockResolvedValue(undefined);
      mockProcessAllPendingEmbeddings.mockResolvedValue(undefined);

      const res = await app.inject({
        method: "POST",
        url: "/ai/embeddings/enable",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ enabled: true });
      expect(mockSetEmbeddingEnabled).toHaveBeenCalledWith(true);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/ai/embeddings/enable",
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // --- POST /ai/embeddings/disable ---
  describe("POST /ai/embeddings/disable", () => {
    it("returns 200 with enabled false", async () => {
      const token = await getAccessToken();
      mockSetEmbeddingEnabled.mockResolvedValue(undefined);

      const res = await app.inject({
        method: "POST",
        url: "/ai/embeddings/disable",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ enabled: false });
      expect(mockSetEmbeddingEnabled).toHaveBeenCalledWith(false);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/ai/embeddings/disable",
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // --- GET /ai/embeddings/status ---
  describe("GET /ai/embeddings/status", () => {
    it("returns correct status shape", async () => {
      const token = await getAccessToken();
      mockIsEmbeddingEnabled.mockResolvedValue(true);
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ count: 5 }]) // pending
        .mockResolvedValueOnce([{ count: 10 }]); // embedded

      const res = await app.inject({
        method: "GET",
        url: "/ai/embeddings/status",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toEqual({
        enabled: true,
        pendingCount: 5,
        totalWithEmbeddings: 10,
      });
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/ai/embeddings/status",
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // --- POST /ai/transcribe ---

  describe("POST /ai/transcribe", () => {
    it("returns 200 with structured note", async () => {
      const token = await getAccessToken();
      mockTranscribeAudio.mockResolvedValue("This is a test transcript.");
      mockStructureTranscript.mockResolvedValue({
        title: "Test Meeting",
        content: "# Meeting Notes\n\nDiscussion points...",
        tags: ["meeting", "test"],
      });
      const noteRow = makeMockNoteRow({
        title: "Test Meeting",
        content: "# Meeting Notes\n\nDiscussion points...",
        tags: ["meeting", "test"],
      });
      mockPrisma.note.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
      mockPrisma.note.create.mockResolvedValue(noteRow);

      const form = new FormData();
      form.append("file", new Blob(["audio-data"], { type: "audio/webm" }), "recording.webm");
      form.append("mode", "meeting");

      const res = await app.inject({
        method: "POST",
        url: "/ai/transcribe",
        headers: {
          authorization: `Bearer ${token}`,
          ...Object.fromEntries(
            // Let inject handle multipart boundary
            [],
          ),
        },
        payload: form,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.title).toBe("Test Meeting");
      expect(body.content).toContain("Meeting Notes");
      expect(body.tags).toEqual(["meeting", "test"]);
      expect(body.note).toBeDefined();
      expect(body.note.id).toBe(VALID_UUID);
    });

    it("returns 400 with no file", async () => {
      const token = await getAccessToken();

      const form = new FormData();
      form.append("mode", "memo");

      const res = await app.inject({
        method: "POST",
        url: "/ai/transcribe",
        headers: { authorization: `Bearer ${token}` },
        payload: form,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe("No audio file provided");
    });

    it("returns 422 when transcript is empty", async () => {
      const token = await getAccessToken();
      mockTranscribeAudio.mockResolvedValue("");

      const form = new FormData();
      form.append("file", new Blob(["audio-data"], { type: "audio/webm" }), "recording.webm");

      const res = await app.inject({
        method: "POST",
        url: "/ai/transcribe",
        headers: { authorization: `Bearer ${token}` },
        payload: form,
      });

      expect(res.statusCode).toBe(422);
      expect(res.json().message).toBe("Transcript is empty");
    });

    it("defaults mode to memo", async () => {
      const token = await getAccessToken();
      mockTranscribeAudio.mockResolvedValue("Some transcript text.");
      mockStructureTranscript.mockResolvedValue({
        title: "Quick Note",
        content: "Some transcript text.",
        tags: [],
      });
      const noteRow = makeMockNoteRow({
        title: "Quick Note",
        content: "Some transcript text.",
        tags: [],
      });
      mockPrisma.note.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
      mockPrisma.note.create.mockResolvedValue(noteRow);

      const form = new FormData();
      form.append("file", new Blob(["audio-data"], { type: "audio/webm" }), "recording.webm");

      const res = await app.inject({
        method: "POST",
        url: "/ai/transcribe",
        headers: { authorization: `Bearer ${token}` },
        payload: form,
      });

      expect(res.statusCode).toBe(200);
      expect(mockStructureTranscript).toHaveBeenCalledWith(
        "Some transcript text.",
        "memo",
      );
    });

    it("returns 401 without auth", async () => {
      const form = new FormData();
      form.append("file", new Blob(["audio-data"], { type: "audio/webm" }), "recording.webm");

      const res = await app.inject({
        method: "POST",
        url: "/ai/transcribe",
        payload: form,
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
