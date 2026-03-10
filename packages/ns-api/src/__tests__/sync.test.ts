process.env.JWT_SECRET = "test-jwt-secret-for-sync-tests-min32chars";
process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret-for-tests-min32";
process.env.CORS_ORIGIN = "http://localhost:3005";

import { describe, it, expect, afterAll, afterEach, vi, beforeAll } from "vitest";
import { createMockPrisma, type MockPrisma } from "./helpers/mockPrisma.js";

let mockPrisma: MockPrisma;
beforeAll(() => {
  mockPrisma = createMockPrisma();
});

import { buildApp } from "../app.js";
import jwt from "jsonwebtoken";

const app = buildApp({ disableRateLimit: true });
const TEST_USER_ID = "user-1";

function authHeader() {
  const token = jwt.sign({ sub: TEST_USER_ID }, process.env.JWT_SECRET!);
  return { Authorization: `Bearer ${token}` };
}

function makeMockNoteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "note-1",
    userId: TEST_USER_ID,
    title: "Test",
    content: "Content",
    folder: null,
    folderId: null,
    tags: [],
    summary: null,
    favorite: false,
    sortOrder: 0,
    favoriteSortOrder: 0,
    embedding: null,
    embeddingUpdatedAt: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-02"),
    deletedAt: null,
    ...overrides,
  };
}

function makeMockFolderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "folder-1",
    userId: TEST_USER_ID,
    name: "Work",
    parentId: null,
    sortOrder: 0,
    favorite: false,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-02"),
    deletedAt: null,
    ...overrides,
  };
}

describe("Sync routes", () => {
  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // --- GET /sync/events (SSE) ---

  describe("GET /sync/events", () => {
    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/sync/events?deviceId=device-1",
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns SSE response with connected event", async () => {
      // Use the raw HTTP approach for streaming endpoints
      const res = await new Promise<{
        statusCode: number;
        headers: Record<string, string | string[] | undefined>;
        body: string;
      }>((resolve) => {
        let body = "";
        app.inject({
          method: "GET",
          url: "/sync/events?deviceId=device-1",
          headers: authHeader(),
        }, (err, response) => {
          // app.inject resolves after the stream ends via close(),
          // but we can use the callback form for streaming
          resolve({
            statusCode: response?.statusCode ?? 0,
            headers: (response?.headers ?? {}) as Record<string, string | string[] | undefined>,
            body: response?.body ?? "",
          });
        });

        // Give the handler time to register, then close via sseHub
        setTimeout(() => {
          app.sseHub.cleanup();
        }, 100);
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("text/event-stream");
      expect(res.headers["cache-control"]).toBe("no-cache");
      expect(res.body).toContain("event: connected");
      expect(res.body).toContain("data: {}");
    });

    it("receives sync events from push notification", async () => {
      const res = await new Promise<{ body: string }>((resolve) => {
        app.inject({
          method: "GET",
          url: "/sync/events?deviceId=web-client",
          headers: authHeader(),
        }, (_err, response) => {
          resolve({ body: response?.body ?? "" });
        });

        // After connection is established, fire a notify and close
        setTimeout(() => {
          app.sseHub.notify(TEST_USER_ID, "desktop-device");
          setTimeout(() => {
            app.sseHub.cleanup();
          }, 50);
        }, 100);
      });

      expect(res.body).toContain("event: connected");
      expect(res.body).toContain("event: sync");
    });
  });

  // --- POST /sync/push ---

  describe("POST /sync/push", () => {
    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/sync/push",
        payload: { deviceId: "device-1", changes: [] },
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 400 with missing body", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/sync/push",
        headers: authHeader(),
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("Invalid request");
    });

    it("creates a new note", async () => {
      mockPrisma.note.findUnique.mockResolvedValue(null);
      mockPrisma.note.create.mockResolvedValue(makeMockNoteRow());
      mockPrisma.syncCursor.upsert.mockResolvedValue({});

      const res = await app.inject({
        method: "POST",
        url: "/sync/push",
        headers: authHeader(),
        payload: {
          deviceId: "device-1",
          changes: [
            {
              id: "note-1",
              type: "note",
              action: "create",
              data: {
                id: "note-1",
                title: "Test",
                content: "Content",
                folder: null,
                folderId: null,
                folderPath: null,
                tags: [],
                summary: null,
                favorite: false,
                sortOrder: 0,
                favoriteSortOrder: 0,
                createdAt: "2024-01-01T00:00:00.000Z",
                updatedAt: "2024-01-02T00:00:00.000Z",
                deletedAt: null,
              },
              timestamp: "2024-01-02T00:00:00.000Z",
            },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.applied).toBe(1);
      expect(body.rejected).toBe(0);
      expect(mockPrisma.note.create).toHaveBeenCalledTimes(1);
    });

    it("updates an existing note (LWW - client wins)", async () => {
      // Server note has updatedAt of Jan 2, client timestamp is Jan 3 -> client wins
      mockPrisma.note.findUnique.mockResolvedValue(
        makeMockNoteRow({ updatedAt: new Date("2024-01-02") }),
      );
      mockPrisma.note.update.mockResolvedValue(makeMockNoteRow({ title: "Updated" }));
      mockPrisma.syncCursor.upsert.mockResolvedValue({});

      const res = await app.inject({
        method: "POST",
        url: "/sync/push",
        headers: authHeader(),
        payload: {
          deviceId: "device-1",
          changes: [
            {
              id: "note-1",
              type: "note",
              action: "update",
              data: {
                id: "note-1",
                title: "Updated",
                content: "Content",
                folder: null,
                folderId: null,
                folderPath: null,
                tags: [],
                summary: null,
                favorite: false,
                sortOrder: 0,
                favoriteSortOrder: 0,
                createdAt: "2024-01-01T00:00:00.000Z",
                updatedAt: "2024-01-03T00:00:00.000Z",
                deletedAt: null,
              },
              timestamp: "2024-01-03T00:00:00.000Z",
            },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().applied).toBe(1);
      expect(mockPrisma.note.update).toHaveBeenCalledTimes(1);
    });

    it("rejects update when server is newer (LWW - server wins)", async () => {
      // Server note has updatedAt of Jan 5, client timestamp is Jan 3 -> server wins, change is rejected
      mockPrisma.note.findUnique.mockResolvedValue(
        makeMockNoteRow({ updatedAt: new Date("2024-01-05") }),
      );
      mockPrisma.syncCursor.upsert.mockResolvedValue({});

      const res = await app.inject({
        method: "POST",
        url: "/sync/push",
        headers: authHeader(),
        payload: {
          deviceId: "device-1",
          changes: [
            {
              id: "note-1",
              type: "note",
              action: "update",
              data: {
                id: "note-1",
                title: "Stale Update",
                content: "Content",
                folder: null,
                folderId: null,
                folderPath: null,
                tags: [],
                summary: null,
                favorite: false,
                sortOrder: 0,
                favoriteSortOrder: 0,
                createdAt: "2024-01-01T00:00:00.000Z",
                updatedAt: "2024-01-03T00:00:00.000Z",
                deletedAt: null,
              },
              timestamp: "2024-01-03T00:00:00.000Z",
            },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      // The change is silently skipped (applied count still 1 because the function
      // doesn't throw — it just returns early). The note.update should NOT be called.
      expect(mockPrisma.note.update).not.toHaveBeenCalled();
      // The route counts it as applied because applyNoteChange didn't throw
      expect(res.json().applied).toBe(1);
      expect(res.json().rejected).toBe(0);
    });

    it("soft-deletes a note", async () => {
      mockPrisma.note.findUnique.mockResolvedValue(makeMockNoteRow());
      mockPrisma.note.update.mockResolvedValue(
        makeMockNoteRow({ deletedAt: new Date("2024-01-03"), favorite: false }),
      );
      mockPrisma.syncCursor.upsert.mockResolvedValue({});

      const res = await app.inject({
        method: "POST",
        url: "/sync/push",
        headers: authHeader(),
        payload: {
          deviceId: "device-1",
          changes: [
            {
              id: "note-1",
              type: "note",
              action: "delete",
              data: null,
              timestamp: "2024-01-03T00:00:00.000Z",
            },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().applied).toBe(1);
      expect(mockPrisma.note.update).toHaveBeenCalledWith({
        where: { id: "note-1" },
        data: { deletedAt: expect.any(Date), favorite: false },
      });
    });

    it("creates a new folder", async () => {
      mockPrisma.folder.findUnique.mockResolvedValue(null);
      mockPrisma.folder.create.mockResolvedValue(makeMockFolderRow());
      mockPrisma.syncCursor.upsert.mockResolvedValue({});

      const res = await app.inject({
        method: "POST",
        url: "/sync/push",
        headers: authHeader(),
        payload: {
          deviceId: "device-1",
          changes: [
            {
              id: "folder-1",
              type: "folder",
              action: "create",
              data: {
                id: "folder-1",
                name: "Work",
                parentId: null,
                sortOrder: 0,
                favorite: false,
                createdAt: "2024-01-01T00:00:00.000Z",
                updatedAt: "2024-01-02T00:00:00.000Z",
                deletedAt: null,
              },
              timestamp: "2024-01-02T00:00:00.000Z",
            },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().applied).toBe(1);
      expect(mockPrisma.folder.create).toHaveBeenCalledTimes(1);
    });

    it("deletes a folder", async () => {
      mockPrisma.folder.findUnique.mockResolvedValue(makeMockFolderRow());
      mockPrisma.folder.update.mockResolvedValue(
        makeMockFolderRow({ deletedAt: new Date("2024-01-03") }),
      );
      mockPrisma.syncCursor.upsert.mockResolvedValue({});

      const res = await app.inject({
        method: "POST",
        url: "/sync/push",
        headers: authHeader(),
        payload: {
          deviceId: "device-1",
          changes: [
            {
              id: "folder-1",
              type: "folder",
              action: "delete",
              data: null,
              timestamp: "2024-01-03T00:00:00.000Z",
            },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().applied).toBe(1);
      expect(mockPrisma.folder.update).toHaveBeenCalledWith({
        where: { id: "folder-1" },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it("returns applied/rejected counts", async () => {
      // First change: valid note create
      mockPrisma.note.findUnique.mockResolvedValueOnce(null);
      mockPrisma.note.create.mockResolvedValueOnce(makeMockNoteRow());
      // Second change: invalid type causes rejection
      mockPrisma.syncCursor.upsert.mockResolvedValue({});

      const res = await app.inject({
        method: "POST",
        url: "/sync/push",
        headers: authHeader(),
        payload: {
          deviceId: "device-1",
          changes: [
            {
              id: "note-1",
              type: "note",
              action: "create",
              data: {
                id: "note-1",
                title: "Test",
                content: "Content",
                folder: null,
                folderId: null,
                folderPath: null,
                tags: [],
                summary: null,
                favorite: false,
                sortOrder: 0,
                favoriteSortOrder: 0,
                createdAt: "2024-01-01T00:00:00.000Z",
                updatedAt: "2024-01-02T00:00:00.000Z",
                deletedAt: null,
              },
              timestamp: "2024-01-02T00:00:00.000Z",
            },
            {
              id: "unknown-1",
              type: "unknown" as "note",
              action: "create",
              data: null,
              timestamp: "2024-01-02T00:00:00.000Z",
            },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.applied).toBe(1);
      expect(body.rejected).toBe(1);
      expect(body.cursor).toBeDefined();
      expect(body.cursor.deviceId).toBe("device-1");
      expect(body.cursor.lastSyncedAt).toBeDefined();
    });
  });

  // --- POST /sync/pull ---

  describe("POST /sync/pull", () => {
    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/sync/pull",
        payload: { deviceId: "device-1", since: "2024-01-01T00:00:00.000Z" },
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns changes since timestamp", async () => {
      const mockNote = makeMockNoteRow({
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-03"),
      });
      const mockFolder = makeMockFolderRow({
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-04"),
      });

      mockPrisma.note.findMany.mockResolvedValue([mockNote]);
      mockPrisma.folder.findMany.mockResolvedValue([mockFolder]);
      mockPrisma.syncCursor.upsert.mockResolvedValue({});

      const res = await app.inject({
        method: "POST",
        url: "/sync/pull",
        headers: authHeader(),
        payload: { deviceId: "device-1", since: "2024-01-02T00:00:00.000Z" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.changes).toHaveLength(2);

      const noteChange = body.changes.find(
        (c: { type: string }) => c.type === "note",
      );
      expect(noteChange).toBeDefined();
      expect(noteChange.id).toBe("note-1");
      expect(noteChange.action).toBe("update");
      expect(noteChange.data.title).toBe("Test");

      const folderChange = body.changes.find(
        (c: { type: string }) => c.type === "folder",
      );
      expect(folderChange).toBeDefined();
      expect(folderChange.id).toBe("folder-1");
      expect(folderChange.action).toBe("update");
      expect(folderChange.data.name).toBe("Work");
    });

    it("returns empty changes when no updates", async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);
      mockPrisma.folder.findMany.mockResolvedValue([]);
      mockPrisma.syncCursor.upsert.mockResolvedValue({});

      const res = await app.inject({
        method: "POST",
        url: "/sync/pull",
        headers: authHeader(),
        payload: { deviceId: "device-1", since: "2024-01-02T00:00:00.000Z" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.changes).toHaveLength(0);
      expect(body.hasMore).toBe(false);
    });

    it("returns hasMore=true when batch limit reached", async () => {
      // Generate 100 mock notes to hit the BATCH_LIMIT
      const baseTime = new Date("2024-01-03T00:00:00.000Z").getTime();
      const manyNotes = Array.from({ length: 100 }, (_, i) =>
        makeMockNoteRow({
          id: `note-${i}`,
          updatedAt: new Date(baseTime + i * 60000),
        }),
      );

      mockPrisma.note.findMany.mockResolvedValue(manyNotes);
      mockPrisma.folder.findMany.mockResolvedValue([]);
      mockPrisma.syncCursor.upsert.mockResolvedValue({});

      const res = await app.inject({
        method: "POST",
        url: "/sync/pull",
        headers: authHeader(),
        payload: { deviceId: "device-1", since: "2024-01-01T00:00:00.000Z" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.hasMore).toBe(true);
      expect(body.changes.length).toBeLessThanOrEqual(100);
    });

    it("updates sync cursor", async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);
      mockPrisma.folder.findMany.mockResolvedValue([]);
      mockPrisma.syncCursor.upsert.mockResolvedValue({});

      const res = await app.inject({
        method: "POST",
        url: "/sync/pull",
        headers: authHeader(),
        payload: { deviceId: "device-1", since: "2024-01-01T00:00:00.000Z" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.cursor).toBeDefined();
      expect(body.cursor.deviceId).toBe("device-1");
      expect(body.cursor.lastSyncedAt).toBeDefined();
      expect(mockPrisma.syncCursor.upsert).toHaveBeenCalledWith({
        where: { userId_deviceId: { userId: TEST_USER_ID, deviceId: "device-1" } },
        create: { userId: TEST_USER_ID, deviceId: "device-1", lastSyncedAt: expect.any(Date) },
        update: { lastSyncedAt: expect.any(Date) },
      });
    });
  });
});
