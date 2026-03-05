import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { createMockPrisma } from "./helpers/mockPrisma.js";
import type { MockPrisma } from "./helpers/mockPrisma.js";

let mockPrisma: MockPrisma;

beforeAll(() => {
  mockPrisma = createMockPrisma();
});

import {
  getSetting,
  setSetting,
  isEmbeddingEnabled,
  setEmbeddingEnabled,
  getTrashRetentionDays,
  setTrashRetentionDays,
} from "../store/settingStore.js";

describe("settingStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getSetting", () => {
    it("returns value when setting exists", async () => {
      mockPrisma.setting.findUnique.mockResolvedValue({
        id: "testKey",
        value: "testValue",
        updatedAt: new Date(),
      });

      const result = await getSetting("testKey");
      expect(result).toBe("testValue");
      expect(mockPrisma.setting.findUnique).toHaveBeenCalledWith({
        where: { id: "testKey" },
      });
    });

    it("returns null when setting does not exist", async () => {
      mockPrisma.setting.findUnique.mockResolvedValue(null);

      const result = await getSetting("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("setSetting", () => {
    it("upserts the setting", async () => {
      mockPrisma.setting.upsert.mockResolvedValue({});

      await setSetting("myKey", "myValue");

      expect(mockPrisma.setting.upsert).toHaveBeenCalledWith({
        where: { id: "myKey" },
        update: { value: "myValue" },
        create: { id: "myKey", value: "myValue" },
      });
    });
  });

  describe("isEmbeddingEnabled", () => {
    it("returns false when setting does not exist", async () => {
      mockPrisma.setting.findUnique.mockResolvedValue(null);

      const result = await isEmbeddingEnabled();
      expect(result).toBe(false);
    });

    it("returns true when setting is 'true'", async () => {
      mockPrisma.setting.findUnique.mockResolvedValue({
        id: "embeddingEnabled",
        value: "true",
        updatedAt: new Date(),
      });

      const result = await isEmbeddingEnabled();
      expect(result).toBe(true);
    });

    it("returns false when setting is 'false'", async () => {
      mockPrisma.setting.findUnique.mockResolvedValue({
        id: "embeddingEnabled",
        value: "false",
        updatedAt: new Date(),
      });

      const result = await isEmbeddingEnabled();
      expect(result).toBe(false);
    });
  });

  describe("setEmbeddingEnabled", () => {
    it("sets the embeddingEnabled key to 'true'", async () => {
      mockPrisma.setting.upsert.mockResolvedValue({});

      await setEmbeddingEnabled(true);

      expect(mockPrisma.setting.upsert).toHaveBeenCalledWith({
        where: { id: "embeddingEnabled" },
        update: { value: "true" },
        create: { id: "embeddingEnabled", value: "true" },
      });
    });

    it("sets the embeddingEnabled key to 'false'", async () => {
      mockPrisma.setting.upsert.mockResolvedValue({});

      await setEmbeddingEnabled(false);

      expect(mockPrisma.setting.upsert).toHaveBeenCalledWith({
        where: { id: "embeddingEnabled" },
        update: { value: "false" },
        create: { id: "embeddingEnabled", value: "false" },
      });
    });
  });

  describe("getTrashRetentionDays", () => {
    it("returns default 30 when no setting exists", async () => {
      mockPrisma.setting.findUnique.mockResolvedValue(null);

      const result = await getTrashRetentionDays();
      expect(result).toBe(30);
    });

    it("returns parsed value when setting exists", async () => {
      mockPrisma.setting.findUnique.mockResolvedValue({
        id: "trashRetentionDays",
        value: "7",
        updatedAt: new Date(),
      });

      const result = await getTrashRetentionDays();
      expect(result).toBe(7);
    });

    it("returns default 30 for non-numeric value", async () => {
      mockPrisma.setting.findUnique.mockResolvedValue({
        id: "trashRetentionDays",
        value: "invalid",
        updatedAt: new Date(),
      });

      const result = await getTrashRetentionDays();
      expect(result).toBe(30);
    });
  });

  describe("setTrashRetentionDays", () => {
    it("stores days as string via setSetting", async () => {
      mockPrisma.setting.upsert.mockResolvedValue({});

      await setTrashRetentionDays(14);

      expect(mockPrisma.setting.upsert).toHaveBeenCalledWith({
        where: { id: "trashRetentionDays" },
        update: { value: "14" },
        create: { id: "trashRetentionDays", value: "14" },
      });
    });

    it("stores 0 for never-delete", async () => {
      mockPrisma.setting.upsert.mockResolvedValue({});

      await setTrashRetentionDays(0);

      expect(mockPrisma.setting.upsert).toHaveBeenCalledWith({
        where: { id: "trashRetentionDays" },
        update: { value: "0" },
        create: { id: "trashRetentionDays", value: "0" },
      });
    });
  });
});
