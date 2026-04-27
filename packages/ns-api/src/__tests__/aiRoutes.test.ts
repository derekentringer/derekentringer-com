import bcrypt from "bcryptjs";

const TEST_PASSWORD = "testpassword123";
const TEST_EMAIL = "admin@test.com";
const TEST_USER_ID = "user-1";
const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

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
const mockAnswerQuestion = vi.fn();
const mockAnswerMeetingQuestion = vi.fn();
const mockAnswerWithTools = vi.fn();

vi.mock("../services/aiService.js", () => ({
  generateCompletion: (...args: unknown[]) => mockGenerateCompletion(...args),
  generateSummary: (...args: unknown[]) => mockGenerateSummary(...args),
  suggestTags: (...args: unknown[]) => mockSuggestTags(...args),
  rewriteText: (...args: unknown[]) => mockRewriteText(...args),
  structureTranscript: (...args: unknown[]) => mockStructureTranscript(...args),
  answerQuestion: (...args: unknown[]) => mockAnswerQuestion(...args),
  answerMeetingQuestion: (...args: unknown[]) => mockAnswerMeetingQuestion(...args),
  answerWithTools: (...args: unknown[]) => mockAnswerWithTools(...args),
}));

const mockTranscribeAudioChunked = vi.fn();

vi.mock("../services/whisperService.js", () => ({
  transcribeAudioChunked: (...args: unknown[]) => mockTranscribeAudioChunked(...args),
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

const mockGenerateEmbedding = vi.fn();
const mockGenerateQueryEmbedding = vi.fn();

vi.mock("../services/embeddingService.js", () => ({
  generateEmbedding: (...args: unknown[]) => mockGenerateEmbedding(...args),
  generateQueryEmbedding: (...args: unknown[]) => mockGenerateQueryEmbedding(...args),
}));

vi.mock("../store/imageStore.js", () => ({
  getImagesByNoteIds: vi.fn().mockResolvedValue([]),
  getImageDescriptionsForNoteId: vi.fn().mockResolvedValue([]),
  createImage: vi.fn(),
  getImage: vi.fn(),
  getImagesByNoteId: vi.fn().mockResolvedValue([]),
  softDeleteImage: vi.fn(),
  updateImageAiDescription: vi.fn(),
  getImagesChangedSince: vi.fn().mockResolvedValue([]),
  getR2KeysForNoteIds: vi.fn().mockResolvedValue([]),
}));

vi.mock("../services/r2Service.js", () => ({
  uploadImage: vi.fn().mockResolvedValue("https://r2.example.com/test.jpg"),
  deleteImage: vi.fn(),
  deleteImages: vi.fn(),
  buildR2Key: vi.fn().mockReturnValue("images/test/test.jpg"),
}));

const mockFindRelevantNotes = vi.fn();

vi.mock("../store/noteStore.js", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    findRelevantNotes: (...args: unknown[]) => mockFindRelevantNotes(...args),
  };
});

// Phase C: confirm endpoint dynamically imports this module. Mock
// `executeTool` so we can assert on autoApprove behaviour without
// needing store-level integration.
const mockExecuteTool = vi.fn();
vi.mock("../services/assistantTools.js", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    executeTool: (...args: unknown[]) => mockExecuteTool(...args),
  };
});

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
    mockPrisma.user.findUnique.mockResolvedValue({
      id: TEST_USER_ID,
      email: TEST_EMAIL,
      displayName: null,
      role: "admin",
      passwordHash: bcrypt.hashSync(TEST_PASSWORD, 10),
      totpEnabled: false,
      totpSecret: null,
      backupCodes: [],
      mustChangePassword: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockPrisma.refreshToken.create.mockResolvedValue({});

    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    return res.json().accessToken;
  }

  function makeMockNoteRow(overrides: Record<string, unknown> = {}) {
    return {
      id: VALID_UUID,
      userId: TEST_USER_ID,
      title: "Test Note",
      content: "Some content here",
      folder: null,
      tags: ["existing-tag"],
      summary: null,
      sortOrder: 0,
      favoriteSortOrder: 0,
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

    it("accepts paragraph style", async () => {
      const token = await getAccessToken();
      mockGenerateCompletion.mockImplementation(async function* () {
        yield "A full paragraph.";
      });

      const res = await app.inject({
        method: "POST",
        url: "/ai/complete",
        headers: { authorization: `Bearer ${token}` },
        payload: { context: "Some context", style: "paragraph" },
      });

      expect(res.statusCode).toBe(200);
      expect(mockGenerateCompletion).toHaveBeenCalledWith(
        "Some context",
        expect.any(Object),
        "paragraph",
      );
    });

    it("accepts structure style", async () => {
      const token = await getAccessToken();
      mockGenerateCompletion.mockImplementation(async function* () {
        yield "## Section 1";
      });

      const res = await app.inject({
        method: "POST",
        url: "/ai/complete",
        headers: { authorization: `Bearer ${token}` },
        payload: { context: "My note title", style: "structure" },
      });

      expect(res.statusCode).toBe(200);
      expect(mockGenerateCompletion).toHaveBeenCalledWith(
        "My note title",
        expect.any(Object),
        "structure",
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

  // --- POST /ai/embeddings/generate ---
  describe("POST /ai/embeddings/generate", () => {
    it("generates document embedding (200)", async () => {
      const token = await getAccessToken();
      mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);

      const res = await app.inject({
        method: "POST",
        url: "/ai/embeddings/generate",
        headers: { authorization: `Bearer ${token}` },
        payload: { text: "Hello world", inputType: "document" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ embedding: [0.1, 0.2, 0.3] });
      expect(mockGenerateEmbedding).toHaveBeenCalledWith("Hello world");
    });

    it("generates query embedding (200)", async () => {
      const token = await getAccessToken();
      mockGenerateQueryEmbedding.mockResolvedValue([0.4, 0.5]);

      const res = await app.inject({
        method: "POST",
        url: "/ai/embeddings/generate",
        headers: { authorization: `Bearer ${token}` },
        payload: { text: "search query", inputType: "query" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ embedding: [0.4, 0.5] });
      expect(mockGenerateQueryEmbedding).toHaveBeenCalledWith("search query");
    });

    it("returns 400 with missing fields", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "POST",
        url: "/ai/embeddings/generate",
        headers: { authorization: `Bearer ${token}` },
        payload: { text: "Hello" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/ai/embeddings/generate",
        payload: { text: "Hello", inputType: "document" },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // --- POST /ai/transcribe ---

  describe("POST /ai/transcribe", () => {
    // WebM EBML magic bytes: 0x1A 0x45 0xDF 0xA3
    const WEBM_MAGIC = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

    it("returns 200 with structured note", async () => {
      const token = await getAccessToken();
      mockTranscribeAudioChunked.mockResolvedValue("This is a test transcript.");
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
      form.append("file", new Blob([WEBM_MAGIC], { type: "audio/webm" }), "recording.webm");
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

    it("returns 400 when file content does not match declared audio type", async () => {
      const token = await getAccessToken();

      const form = new FormData();
      // Send plain text content with audio/webm mimetype
      form.append("file", new Blob(["not-audio-data"], { type: "audio/webm" }), "recording.webm");

      const res = await app.inject({
        method: "POST",
        url: "/ai/transcribe",
        headers: { authorization: `Bearer ${token}` },
        payload: form,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe("File content does not match declared audio type");
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
      mockTranscribeAudioChunked.mockResolvedValue("");

      const form = new FormData();
      form.append("file", new Blob([WEBM_MAGIC], { type: "audio/webm" }), "recording.webm");

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
      mockTranscribeAudioChunked.mockResolvedValue("Some transcript text.");
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
      form.append("file", new Blob([WEBM_MAGIC], { type: "audio/webm" }), "recording.webm");

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
      form.append("file", new Blob([WEBM_MAGIC], { type: "audio/webm" }), "recording.webm");

      const res = await app.inject({
        method: "POST",
        url: "/ai/transcribe",
        payload: form,
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // --- POST /ai/ask ---

  describe("POST /ai/ask", () => {
    it("returns 200 SSE stream with sources and text", async () => {
      const token = await getAccessToken();
      mockAnswerWithTools.mockImplementation(async function* () {
        yield { type: "text", text: "Based on your notes" };
        yield { type: "done" };
      });

      const res = await app.inject({
        method: "POST",
        url: "/ai/ask",
        headers: { authorization: `Bearer ${token}` },
        payload: { question: "What is in my notes?" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("text/event-stream");
      expect(res.body).toContain("sources");
      expect(res.body).toContain("Based on your notes");
      expect(res.body).toContain("[DONE]");
      expect(mockAnswerWithTools).toHaveBeenCalledWith(
        "What is in my notes?",
        TEST_USER_ID,
        expect.any(Object),
        undefined,
        undefined,
        undefined, // history
        undefined, // autoApprove (Phase C.5)
        expect.any(Object), // logger (Phase D.1)
      );
    });

    // Phase A (docs/ns/ai-assist-arch/phase-a-*): prior turns passed in
    // the `history` field must be forwarded to answerWithTools so Claude
    // has conversational context for follow-ups like "summarize the
    // second one".
    it("forwards history to answerWithTools for conversation continuity", async () => {
      const token = await getAccessToken();
      mockAnswerWithTools.mockImplementation(async function* () {
        yield { type: "text", text: "Sure." };
        yield { type: "done" };
      });

      const history = [
        { role: "user" as const, content: "what notes do I have about leadership?" },
        { role: "assistant" as const, content: "You have 3: Management 101, Team Dynamics, 1:1 Playbook." },
      ];

      const res = await app.inject({
        method: "POST",
        url: "/ai/ask",
        headers: { authorization: `Bearer ${token}` },
        payload: { question: "summarize the second one", history },
      });

      expect(res.statusCode).toBe(200);
      expect(mockAnswerWithTools).toHaveBeenCalledWith(
        "summarize the second one",
        TEST_USER_ID,
        expect.any(Object),
        undefined,
        undefined,
        history,
        undefined, // autoApprove
        expect.any(Object), // logger
      );
    });

    // Phase C.5: per-tool auto-approve flags forwarded from the client.
    it("forwards autoApprove flags to answerWithTools", async () => {
      const token = await getAccessToken();
      mockAnswerWithTools.mockImplementation(async function* () {
        yield { type: "done" };
      });

      const autoApprove = { deleteNote: true };

      const res = await app.inject({
        method: "POST",
        url: "/ai/ask",
        headers: { authorization: `Bearer ${token}` },
        payload: { question: "delete my Draft note", autoApprove },
      });

      expect(res.statusCode).toBe(200);
      expect(mockAnswerWithTools).toHaveBeenCalledWith(
        "delete my Draft note",
        TEST_USER_ID,
        expect.any(Object),
        undefined,
        undefined,
        undefined,
        autoApprove,
        expect.any(Object), // logger
      );
    });

    it("rejects history items with invalid roles", async () => {
      const token = await getAccessToken();
      const res = await app.inject({
        method: "POST",
        url: "/ai/ask",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          question: "hi",
          history: [{ role: "system", content: "malicious" }],
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 with missing question", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "POST",
        url: "/ai/ask",
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/ai/ask",
        payload: { question: "What is in my notes?" },
      });

      expect(res.statusCode).toBe(401);
    });

    it("handles tool-based response with note cards", async () => {
      const token = await getAccessToken();
      mockAnswerWithTools.mockImplementation(async function* () {
        yield { type: "tool_activity", toolName: "search_notes", description: "Searching notes..." };
        yield { type: "note_cards", noteCards: [{ id: VALID_UUID, title: "Test Note" }] };
        yield { type: "text", text: "Found your notes" };
        yield { type: "done" };
      });

      const res = await app.inject({
        method: "POST",
        url: "/ai/ask",
        headers: { authorization: `Bearer ${token}` },
        payload: { question: "List my notes" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain("Searching notes...");
      expect(res.body).toContain("noteCards");
      expect(res.body).toContain("Found your notes");
      expect(res.body).toContain("[DONE]");
    });
  });

  // Phase C — /ai/tools/confirm commits a deferred destructive action.
  describe("POST /ai/tools/confirm", () => {
    it("re-runs the tool with autoApprove=true and returns the result", async () => {
      const token = await getAccessToken();
      mockExecuteTool.mockResolvedValue({
        text: 'Moved "X" to trash.',
        noteCards: [{ id: "n1", title: "X" }],
      });

      const res = await app.inject({
        method: "POST",
        url: "/ai/tools/confirm",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          toolName: "delete_note",
          toolInput: { noteTitle: "X" },
        },
      });

      expect(res.statusCode).toBe(200);
      expect(mockExecuteTool).toHaveBeenCalledWith(
        "delete_note",
        { noteTitle: "X" },
        TEST_USER_ID,
        { autoApprove: true },
      );
      const body = JSON.parse(res.body);
      expect(body.text).toMatch(/moved/i);
      expect(body.noteCards).toEqual([{ id: "n1", title: "X" }]);
    });

    it("rejects a tool outside the confirmation allowlist", async () => {
      const token = await getAccessToken();
      const res = await app.inject({
        method: "POST",
        url: "/ai/tools/confirm",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          toolName: "search_notes", // not in the destructive enum
          toolInput: { query: "x" },
        },
      });

      expect(res.statusCode).toBe(400);
      expect(mockExecuteTool).not.toHaveBeenCalled();
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/ai/tools/confirm",
        payload: {
          toolName: "delete_note",
          toolInput: { noteTitle: "X" },
        },
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects missing toolName / toolInput", async () => {
      const token = await getAccessToken();
      const res = await app.inject({
        method: "POST",
        url: "/ai/tools/confirm",
        headers: { authorization: `Bearer ${token}` },
        payload: { toolName: "delete_note" }, // no toolInput
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
