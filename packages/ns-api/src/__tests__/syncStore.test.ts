process.env.JWT_SECRET = "test-jwt-secret-for-sync-tests-min32chars";
process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret-for-tests-min32";
process.env.CORS_ORIGIN = "http://localhost:3005";

import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { createMockPrisma } from "./helpers/mockPrisma.js";
import type { MockPrisma } from "./helpers/mockPrisma.js";

let mockPrisma: MockPrisma;

beforeAll(() => {
  mockPrisma = createMockPrisma();
});

import {
  getSyncCursor,
  upsertSyncCursor,
  getNotesChangedSince,
  getFoldersChangedSince,
} from "../store/syncStore.js";

const TEST_USER_ID = "user-1";
const TEST_DEVICE_ID = "device-abc";

describe("syncStore", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("getSyncCursor", () => {
    it("returns null when no cursor exists", async () => {
      mockPrisma.syncCursor.findUnique.mockResolvedValue(null);

      const result = await getSyncCursor(TEST_USER_ID, TEST_DEVICE_ID);

      expect(result).toBeNull();
      expect(mockPrisma.syncCursor.findUnique).toHaveBeenCalledWith({
        where: { userId_deviceId: { userId: TEST_USER_ID, deviceId: TEST_DEVICE_ID } },
      });
    });

    it("returns Date when cursor exists", async () => {
      const lastSyncedAt = new Date("2026-03-01T12:00:00Z");
      mockPrisma.syncCursor.findUnique.mockResolvedValue({
        userId: TEST_USER_ID,
        deviceId: TEST_DEVICE_ID,
        lastSyncedAt,
      });

      const result = await getSyncCursor(TEST_USER_ID, TEST_DEVICE_ID);

      expect(result).toEqual(lastSyncedAt);
      expect(result).toBeInstanceOf(Date);
    });
  });

  describe("upsertSyncCursor", () => {
    it("creates a new cursor", async () => {
      const lastSyncedAt = new Date("2026-03-01T12:00:00Z");
      mockPrisma.syncCursor.upsert.mockResolvedValue({
        userId: TEST_USER_ID,
        deviceId: TEST_DEVICE_ID,
        lastSyncedAt,
      });

      await upsertSyncCursor(TEST_USER_ID, TEST_DEVICE_ID, lastSyncedAt);

      expect(mockPrisma.syncCursor.upsert).toHaveBeenCalledWith({
        where: { userId_deviceId: { userId: TEST_USER_ID, deviceId: TEST_DEVICE_ID } },
        create: { userId: TEST_USER_ID, deviceId: TEST_DEVICE_ID, lastSyncedAt },
        update: { lastSyncedAt },
      });
    });

    it("updates an existing cursor", async () => {
      const updatedAt = new Date("2026-03-05T18:30:00Z");
      mockPrisma.syncCursor.upsert.mockResolvedValue({
        userId: TEST_USER_ID,
        deviceId: TEST_DEVICE_ID,
        lastSyncedAt: updatedAt,
      });

      await upsertSyncCursor(TEST_USER_ID, TEST_DEVICE_ID, updatedAt);

      expect(mockPrisma.syncCursor.upsert).toHaveBeenCalledWith({
        where: { userId_deviceId: { userId: TEST_USER_ID, deviceId: TEST_DEVICE_ID } },
        create: { userId: TEST_USER_ID, deviceId: TEST_DEVICE_ID, lastSyncedAt: updatedAt },
        update: { lastSyncedAt: updatedAt },
      });
    });
  });

  describe("getNotesChangedSince", () => {
    it("returns notes updated after since date", async () => {
      const since = new Date("2026-03-01T00:00:00Z");
      const mockNotes = [
        {
          id: "note-1",
          userId: TEST_USER_ID,
          title: "Note 1",
          content: "Content 1",
          folder: null,
          tags: [],
          summary: null,
          sortOrder: 0,
          favoriteSortOrder: 0,
          createdAt: new Date("2026-02-15T00:00:00Z"),
          updatedAt: new Date("2026-03-02T10:00:00Z"),
          deletedAt: null,
        },
        {
          id: "note-2",
          userId: TEST_USER_ID,
          title: "Note 2",
          content: "Content 2",
          folder: "work",
          tags: ["tag1"],
          summary: null,
          sortOrder: 1,
          favoriteSortOrder: 0,
          createdAt: new Date("2026-02-20T00:00:00Z"),
          updatedAt: new Date("2026-03-03T14:00:00Z"),
          deletedAt: null,
        },
      ];
      mockPrisma.note.findMany.mockResolvedValue(mockNotes);

      const result = await getNotesChangedSince(TEST_USER_ID, since);

      expect(result).toEqual(mockNotes);
      expect(result).toHaveLength(2);
      expect(mockPrisma.note.findMany).toHaveBeenCalledWith({
        where: {
          userId: TEST_USER_ID,
          updatedAt: { gt: since },
        },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: 100,
      });
    });

    it("returns empty array when no changes exist", async () => {
      const since = new Date("2026-03-10T00:00:00Z");
      mockPrisma.note.findMany.mockResolvedValue([]);

      const result = await getNotesChangedSince(TEST_USER_ID, since);

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
      expect(mockPrisma.note.findMany).toHaveBeenCalledWith({
        where: {
          userId: TEST_USER_ID,
          updatedAt: { gt: since },
        },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: 100,
      });
    });
  });

  describe("getFoldersChangedSince", () => {
    it("returns folders updated after since date", async () => {
      const since = new Date("2026-03-01T00:00:00Z");
      const mockFolders = [
        {
          id: "folder-1",
          userId: TEST_USER_ID,
          name: "work",
          parentId: null,
          sortOrder: 0,
          createdAt: new Date("2026-02-10T00:00:00Z"),
          updatedAt: new Date("2026-03-04T09:00:00Z"),
        },
        {
          id: "folder-2",
          userId: TEST_USER_ID,
          name: "personal",
          parentId: null,
          sortOrder: 1,
          createdAt: new Date("2026-02-12T00:00:00Z"),
          updatedAt: new Date("2026-03-05T11:00:00Z"),
        },
      ];
      mockPrisma.folder.findMany.mockResolvedValue(mockFolders);

      const result = await getFoldersChangedSince(TEST_USER_ID, since);

      expect(result).toEqual(mockFolders);
      expect(result).toHaveLength(2);
      expect(mockPrisma.folder.findMany).toHaveBeenCalledWith({
        where: {
          userId: TEST_USER_ID,
          updatedAt: { gt: since },
        },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: 100,
      });
    });

    it("returns empty array when no changes exist", async () => {
      const since = new Date("2026-03-10T00:00:00Z");
      mockPrisma.folder.findMany.mockResolvedValue([]);

      const result = await getFoldersChangedSince(TEST_USER_ID, since);

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
      expect(mockPrisma.folder.findMany).toHaveBeenCalledWith({
        where: {
          userId: TEST_USER_ID,
          updatedAt: { gt: since },
        },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: 100,
      });
    });
  });
});
