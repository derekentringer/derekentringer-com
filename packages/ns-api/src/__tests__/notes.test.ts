import bcrypt from "bcryptjs";

const TEST_PASSWORD = "testpassword123";
const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_UUID_2 = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync(TEST_PASSWORD, 10);
process.env.JWT_SECRET = "test-jwt-secret-for-notes-tests-min32c";
process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret-for-tests-min32";
process.env.CORS_ORIGIN = "http://localhost:3005";

import { describe, it, expect, afterAll, afterEach, vi, beforeAll } from "vitest";
import { createMockPrisma } from "./helpers/mockPrisma.js";
import type { MockPrisma } from "./helpers/mockPrisma.js";

let mockPrisma: MockPrisma;

beforeAll(() => {
  mockPrisma = createMockPrisma();
});

import { buildApp } from "../app.js";

describe("Note routes", () => {
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
      content: "Some content",
      folder: "work",
      tags: ["tag1"],
      summary: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...overrides,
    };
  }

  // --- POST /notes ---

  describe("POST /notes", () => {
    it("creates a note with valid data (201)", async () => {
      const token = await getAccessToken();
      mockPrisma.note.create.mockResolvedValue(
        makeMockNoteRow({ title: "New Note", content: "Hello", folder: null, tags: [] }),
      );

      const res = await app.inject({
        method: "POST",
        url: "/notes",
        headers: { authorization: `Bearer ${token}` },
        payload: { title: "New Note", content: "Hello" },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.note).toBeDefined();
      expect(body.note.title).toBe("New Note");
    });

    it("returns 400 with missing title", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "POST",
        url: "/notes",
        headers: { authorization: `Bearer ${token}` },
        payload: { content: "No title" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("required");
    });

    it("returns 400 with empty title", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "POST",
        url: "/notes",
        headers: { authorization: `Bearer ${token}` },
        payload: { title: "" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/notes",
        payload: { title: "No Auth" },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // --- GET /notes ---

  describe("GET /notes", () => {
    it("returns list of notes (200)", async () => {
      const token = await getAccessToken();
      mockPrisma.note.findMany.mockResolvedValue([
        makeMockNoteRow({ id: VALID_UUID }),
        makeMockNoteRow({ id: VALID_UUID_2 }),
      ]);
      mockPrisma.note.count.mockResolvedValue(2);

      const res = await app.inject({
        method: "GET",
        url: "/notes",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.notes).toHaveLength(2);
      expect(body.total).toBe(2);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/notes",
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // --- GET /notes/:id ---

  describe("GET /notes/:id", () => {
    it("returns note if found (200)", async () => {
      const token = await getAccessToken();
      mockPrisma.note.findUnique.mockResolvedValue(makeMockNoteRow());

      const res = await app.inject({
        method: "GET",
        url: `/notes/${VALID_UUID}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.note.id).toBe(VALID_UUID);
      expect(body.note.title).toBe("Test Note");
    });

    it("returns 404 if not found", async () => {
      const token = await getAccessToken();
      mockPrisma.note.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "GET",
        url: `/notes/${VALID_UUID_2}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().message).toBe("Note not found");
    });

    it("returns 400 for invalid UUID format", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "GET",
        url: "/notes/invalid-id",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe("Invalid note ID format");
    });
  });

  // --- PATCH /notes/:id ---

  describe("PATCH /notes/:id", () => {
    it("updates note fields (200)", async () => {
      const token = await getAccessToken();
      const row = makeMockNoteRow({ title: "Updated Title" });
      mockPrisma.note.update.mockResolvedValue(row);

      const res = await app.inject({
        method: "PATCH",
        url: `/notes/${VALID_UUID}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { title: "Updated Title" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.note.title).toBe("Updated Title");
    });

    it("returns 404 if not found (P2025)", async () => {
      const token = await getAccessToken();
      const notFoundError = new Error("Not found") as Error & { code: string };
      notFoundError.code = "P2025";
      mockPrisma.note.update.mockRejectedValue(notFoundError);

      const res = await app.inject({
        method: "PATCH",
        url: `/notes/${VALID_UUID}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { title: "Nope" },
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 400 with empty body", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "PATCH",
        url: `/notes/${VALID_UUID}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe("At least one field is required");
    });

    it("returns 400 for invalid UUID format", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "PATCH",
        url: "/notes/invalid-id",
        headers: { authorization: `Bearer ${token}` },
        payload: { title: "Test" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe("Invalid note ID format");
    });

    it("allows setting folder to null", async () => {
      const token = await getAccessToken();
      const row = makeMockNoteRow({ folder: null });
      mockPrisma.note.update.mockResolvedValue(row);

      const res = await app.inject({
        method: "PATCH",
        url: `/notes/${VALID_UUID}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { folder: null },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().note.folder).toBeNull();
    });
  });

  // --- DELETE /notes/:id ---

  describe("DELETE /notes/:id", () => {
    it("soft-deletes note (204)", async () => {
      const token = await getAccessToken();
      mockPrisma.note.update.mockResolvedValue({});

      const res = await app.inject({
        method: "DELETE",
        url: `/notes/${VALID_UUID}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(204);
    });

    it("returns 404 if not found", async () => {
      const token = await getAccessToken();
      const notFoundError = new Error("Not found") as Error & { code: string };
      notFoundError.code = "P2025";
      mockPrisma.note.update.mockRejectedValue(notFoundError);

      const res = await app.inject({
        method: "DELETE",
        url: `/notes/${VALID_UUID_2}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().message).toBe("Note not found");
    });

    it("returns 400 for invalid UUID format", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "DELETE",
        url: "/notes/invalid-id",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe("Invalid note ID format");
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/notes/${VALID_UUID}`,
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
