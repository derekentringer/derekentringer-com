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
      sortOrder: 0,
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
      mockPrisma.note.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
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

    it("accepts sortBy and sortOrder query params", async () => {
      const token = await getAccessToken();
      mockPrisma.note.findMany.mockResolvedValue([]);
      mockPrisma.note.count.mockResolvedValue(0);

      const res = await app.inject({
        method: "GET",
        url: "/notes?sortBy=title&sortOrder=asc",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
    });

    it("returns 400 for invalid sortBy value", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "GET",
        url: "/notes?sortBy=invalid",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("Invalid sortBy");
    });

    it("returns 400 for invalid sortOrder value", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "GET",
        url: "/notes?sortOrder=invalid",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("Invalid sortOrder");
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/notes",
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // --- GET /notes/trash ---

  describe("GET /notes/trash", () => {
    it("returns trashed notes (200)", async () => {
      const token = await getAccessToken();
      mockPrisma.note.findMany.mockResolvedValue([
        makeMockNoteRow({ id: VALID_UUID, deletedAt: new Date() }),
      ]);
      mockPrisma.note.count.mockResolvedValue(1);

      const res = await app.inject({
        method: "GET",
        url: "/notes/trash",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.notes).toHaveLength(1);
      expect(body.total).toBe(1);
    });

    it("accepts pagination params", async () => {
      const token = await getAccessToken();
      mockPrisma.note.findMany.mockResolvedValue([]);
      mockPrisma.note.count.mockResolvedValue(0);

      const res = await app.inject({
        method: "GET",
        url: "/notes/trash?page=2&pageSize=10",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/notes/trash",
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // --- GET /notes/folders ---

  describe("GET /notes/folders", () => {
    it("returns folder list (200)", async () => {
      const token = await getAccessToken();
      mockPrisma.folder.findMany.mockResolvedValue([
        { id: "f1", name: "work", createdAt: new Date() },
      ]);
      mockPrisma.note.groupBy.mockResolvedValue([
        { folder: "work", _count: { id: 3 } },
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/notes/folders",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.folders).toHaveLength(1);
      expect(body.folders[0].name).toBe("work");
      expect(body.folders[0].count).toBe(3);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/notes/folders",
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // --- POST /notes/folders ---

  describe("POST /notes/folders", () => {
    it("creates a folder (201)", async () => {
      const token = await getAccessToken();
      mockPrisma.folder.create.mockResolvedValue({
        id: "f1",
        name: "projects",
        createdAt: new Date(),
      });

      const res = await app.inject({
        method: "POST",
        url: "/notes/folders",
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "projects" },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.name).toBe("projects");
    });

    it("returns 409 for duplicate folder", async () => {
      const token = await getAccessToken();
      const err = new Error("Unique constraint failed") as Error & { code: string };
      err.code = "P2002";
      mockPrisma.folder.create.mockRejectedValue(err);

      const res = await app.inject({
        method: "POST",
        url: "/notes/folders",
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "existing" },
      });

      expect(res.statusCode).toBe(409);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/notes/folders",
        payload: { name: "test" },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // --- PUT /notes/reorder ---

  describe("PUT /notes/reorder", () => {
    it("reorders notes (204)", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "PUT",
        url: "/notes/reorder",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          order: [
            { id: VALID_UUID, sortOrder: 1 },
            { id: VALID_UUID_2, sortOrder: 0 },
          ],
        },
      });

      expect(res.statusCode).toBe(204);
    });

    it("returns 400 with missing order", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "PUT",
        url: "/notes/reorder",
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/notes/reorder",
        payload: { order: [] },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // --- PATCH /notes/folders/:name ---

  describe("PATCH /notes/folders/:name", () => {
    it("renames a folder (200)", async () => {
      const token = await getAccessToken();
      mockPrisma.note.updateMany.mockResolvedValue({ count: 3 });

      const res = await app.inject({
        method: "PATCH",
        url: "/notes/folders/work",
        headers: { authorization: `Bearer ${token}` },
        payload: { newName: "office" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().updated).toBe(3);
    });

    it("returns 400 with missing newName", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "PATCH",
        url: "/notes/folders/work",
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/notes/folders/work",
        payload: { newName: "office" },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // --- DELETE /notes/folders/:name ---

  describe("DELETE /notes/folders/:name", () => {
    it("deletes a folder and unfiles notes (200)", async () => {
      const token = await getAccessToken();
      mockPrisma.note.updateMany.mockResolvedValue({ count: 2 });

      const res = await app.inject({
        method: "DELETE",
        url: "/notes/folders/work",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().updated).toBe(2);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/notes/folders/work",
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

  // --- PATCH /notes/:id/restore ---

  describe("PATCH /notes/:id/restore", () => {
    it("restores a trashed note (200)", async () => {
      const token = await getAccessToken();
      const row = makeMockNoteRow({ deletedAt: null });
      mockPrisma.note.update.mockResolvedValue(row);

      const res = await app.inject({
        method: "PATCH",
        url: `/notes/${VALID_UUID}/restore`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.note).toBeDefined();
      expect(body.note.deletedAt).toBeNull();
    });

    it("returns 404 if note not found", async () => {
      const token = await getAccessToken();
      const notFoundError = new Error("Not found") as Error & { code: string };
      notFoundError.code = "P2025";
      mockPrisma.note.update.mockRejectedValue(notFoundError);

      const res = await app.inject({
        method: "PATCH",
        url: `/notes/${VALID_UUID}/restore`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 400 for invalid UUID format", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "PATCH",
        url: "/notes/invalid-id/restore",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe("Invalid note ID format");
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/notes/${VALID_UUID}/restore`,
      });

      expect(res.statusCode).toBe(401);
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

    it("accepts summary field", async () => {
      const token = await getAccessToken();
      const row = makeMockNoteRow({ summary: "A note summary" });
      mockPrisma.note.update.mockResolvedValue(row);

      const res = await app.inject({
        method: "PATCH",
        url: `/notes/${VALID_UUID}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { summary: "A note summary" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().note.summary).toBe("A note summary");
    });

    it("allows setting summary to null", async () => {
      const token = await getAccessToken();
      const row = makeMockNoteRow({ summary: null });
      mockPrisma.note.update.mockResolvedValue(row);

      const res = await app.inject({
        method: "PATCH",
        url: `/notes/${VALID_UUID}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { summary: null },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().note.summary).toBeNull();
    });
  });

  // --- DELETE /notes/:id/permanent ---

  describe("DELETE /notes/:id/permanent", () => {
    it("permanently deletes a note (204)", async () => {
      const token = await getAccessToken();
      mockPrisma.note.delete.mockResolvedValue({});

      const res = await app.inject({
        method: "DELETE",
        url: `/notes/${VALID_UUID}/permanent`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(204);
    });

    it("returns 404 if note not found", async () => {
      const token = await getAccessToken();
      const notFoundError = new Error("Not found") as Error & { code: string };
      notFoundError.code = "P2025";
      mockPrisma.note.delete.mockRejectedValue(notFoundError);

      const res = await app.inject({
        method: "DELETE",
        url: `/notes/${VALID_UUID}/permanent`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().message).toBe("Note not found");
    });

    it("returns 400 for invalid UUID format", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "DELETE",
        url: "/notes/invalid-id/permanent",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe("Invalid note ID format");
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/notes/${VALID_UUID}/permanent`,
      });

      expect(res.statusCode).toBe(401);
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

  describe("GET /notes/tags", () => {
    it("returns tag list", async () => {
      const token = await getAccessToken();
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        { name: "js", count: 5 },
        { name: "react", count: 3 },
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/notes/tags",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.tags).toEqual([
        { name: "js", count: 5 },
        { name: "react", count: 3 },
      ]);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/notes/tags",
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("PATCH /notes/tags/:name", () => {
    it("renames a tag", async () => {
      const token = await getAccessToken();
      mockPrisma.note.findMany.mockResolvedValue([
        { id: "n1", tags: ["old"] },
      ]);
      mockPrisma.note.update.mockResolvedValue({});

      const res = await app.inject({
        method: "PATCH",
        url: "/notes/tags/old",
        headers: { authorization: `Bearer ${token}` },
        payload: { newName: "new" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().updated).toBe(1);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/notes/tags/old",
        payload: { newName: "new" },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("DELETE /notes/tags/:name", () => {
    it("removes a tag from all notes", async () => {
      const token = await getAccessToken();
      mockPrisma.note.findMany.mockResolvedValue([
        { id: "n1", tags: ["remove-me", "keep"] },
      ]);
      mockPrisma.note.update.mockResolvedValue({});

      const res = await app.inject({
        method: "DELETE",
        url: "/notes/tags/remove-me",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().updated).toBe(1);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/notes/tags/remove-me",
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /notes with tags filter", () => {
    it("passes tags filter to store", async () => {
      const token = await getAccessToken();
      mockPrisma.note.findMany.mockResolvedValue([]);
      mockPrisma.note.count.mockResolvedValue(0);

      const res = await app.inject({
        method: "GET",
        url: "/notes?tags=js,react",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
    });
  });
});
