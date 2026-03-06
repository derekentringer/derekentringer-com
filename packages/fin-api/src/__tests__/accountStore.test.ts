import crypto from "crypto";

process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { initEncryptionKey } from "../lib/encryption.js";
import { createMockPrisma } from "./helpers/mockPrisma.js";
import type { MockPrisma } from "./helpers/mockPrisma.js";
import { encryptAccountForCreate } from "../lib/mappers.js";
import { AccountType } from "@derekentringer/shared";

const TEST_USER_ID = "test-user-1";

let mockPrisma: MockPrisma;

beforeAll(() => {
  initEncryptionKey(process.env.ENCRYPTION_KEY!);
  mockPrisma = createMockPrisma();
});

import {
  createAccount,
  getAccount,
  listAccounts,
  updateAccount,
  deleteAccount,
} from "../store/accountStore.js";

function makeMockRow(overrides: Record<string, unknown> = {}) {
  const encrypted = encryptAccountForCreate({
    name: "Test",
    type: AccountType.Checking,
    institution: "Bank",
    currentBalance: 500,
  });
  return {
    id: "acc-1",
    ...encrypted,
    isActive: true,
    isFavorite: false,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}


describe("accountStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-setup $transaction after clearAllMocks
    mockPrisma.$transaction.mockImplementation(
      async (fn: (client: MockPrisma) => Promise<unknown>) => fn(mockPrisma),
    );
  });

  describe("createAccount", () => {
    it("encrypts data and returns decrypted account", async () => {
      mockPrisma.account.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } });
      mockPrisma.account.create.mockImplementation(
        async (args: { data: Record<string, unknown> }) => ({
          id: "acc-new",
          ...args.data,
          isActive: args.data.isActive ?? true,
          isFavorite: args.data.isFavorite ?? false,
          sortOrder: args.data.sortOrder ?? 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      const result = await createAccount(TEST_USER_ID, {
        name: "My Checking",
        type: AccountType.Checking,
        institution: "Chase",
        currentBalance: 1000,
      });

      expect(result.id).toBe("acc-new");
      expect(result.name).toBe("My Checking");
      expect(result.currentBalance).toBe(1000);
      expect(result.isActive).toBe(true);
      expect(mockPrisma.account.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("getAccount", () => {
    it("returns decrypted account when found", async () => {
      mockPrisma.account.findUnique.mockResolvedValue(makeMockRow({ userId: TEST_USER_ID }));

      const result = await getAccount(TEST_USER_ID, "acc-1");

      expect(result).not.toBeNull();
      expect(result!.name).toBe("Test");
      expect(result!.currentBalance).toBe(500);
    });

    it("returns null when not found", async () => {
      mockPrisma.account.findUnique.mockResolvedValue(null);

      const result = await getAccount(TEST_USER_ID, "nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("listAccounts", () => {
    it("returns all accounts ordered by sortOrder from DB", async () => {
      const rowA = makeMockRow({ id: "acc-a", sortOrder: 0 });
      const rowB = makeMockRow({ id: "acc-b", sortOrder: 1 });
      // Override names so we can verify order is preserved from DB
      const encA = encryptAccountForCreate({
        name: "Alpha",
        type: AccountType.Checking,
        institution: "Bank",
        currentBalance: 100,
      });
      const encZ = encryptAccountForCreate({
        name: "Zulu",
        type: AccountType.Checking,
        institution: "Bank",
        currentBalance: 200,
      });
      // Return in sortOrder from DB
      mockPrisma.account.findMany.mockResolvedValue([
        { ...rowA, ...encA, id: "acc-a" },
        { ...rowB, ...encZ, id: "acc-z" },
      ]);

      const result = await listAccounts(TEST_USER_ID);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Alpha");
      expect(result[1].name).toBe("Zulu");
      expect(mockPrisma.account.findMany).toHaveBeenCalledWith({
        where: { userId: TEST_USER_ID },
        orderBy: { sortOrder: "asc" },
      });
    });

    it("filters by isActive", async () => {
      mockPrisma.account.findMany.mockResolvedValue([]);

      await listAccounts(TEST_USER_ID, { isActive: true });

      expect(mockPrisma.account.findMany).toHaveBeenCalledWith({
        where: { userId: TEST_USER_ID, isActive: true },
        orderBy: { sortOrder: "asc" },
      });
    });
  });

  describe("updateAccount", () => {
    it("updates and returns decrypted account", async () => {
      const row = makeMockRow();
      mockPrisma.account.findUnique.mockResolvedValue({ ...row, userId: TEST_USER_ID });
      mockPrisma.account.update.mockImplementation(
        async (args: { data: Record<string, unknown> }) => ({
          ...row,
          ...args.data,
          updatedAt: new Date(),
        }),
      );

      const result = await updateAccount(TEST_USER_ID, "acc-1", { name: "Updated" });

      expect(result).not.toBeNull();
      expect(result!.name).toBe("Updated");
    });

    it("returns null when account not found (P2025)", async () => {
      mockPrisma.account.findUnique.mockResolvedValue(null);

      const result = await updateAccount(TEST_USER_ID, "nonexistent", { name: "Nope" });
      expect(result).toBeNull();
    });

    it("creates balance snapshot when currentBalance changes", async () => {
      const row = makeMockRow(); // currentBalance encrypted from 500
      mockPrisma.account.findUnique.mockResolvedValue({ ...row, userId: TEST_USER_ID });
      mockPrisma.account.update.mockImplementation(
        async (args: { data: Record<string, unknown> }) => ({
          ...row,
          ...args.data,
          updatedAt: new Date(),
        }),
      );
      mockPrisma.balance.create.mockResolvedValue({});

      await updateAccount(TEST_USER_ID, "acc-1", { currentBalance: 2000 });

      expect(mockPrisma.balance.create).toHaveBeenCalledTimes(1);
    });

    it("does not create balance snapshot when balance is unchanged", async () => {
      const row = makeMockRow(); // currentBalance encrypted from 500
      mockPrisma.account.findUnique.mockResolvedValue({ ...row, userId: TEST_USER_ID });
      mockPrisma.account.update.mockImplementation(
        async (args: { data: Record<string, unknown> }) => ({
          ...row,
          ...args.data,
          updatedAt: new Date(),
        }),
      );

      await updateAccount(TEST_USER_ID, "acc-1", { currentBalance: 500 });

      expect(mockPrisma.balance.create).not.toHaveBeenCalled();
    });

    it("does not create balance snapshot without balance change", async () => {
      const row = makeMockRow();
      mockPrisma.account.findUnique.mockResolvedValue({ ...row, userId: TEST_USER_ID });
      mockPrisma.account.update.mockImplementation(
        async (args: { data: Record<string, unknown> }) => ({
          ...row,
          ...args.data,
          updatedAt: new Date(),
        }),
      );

      await updateAccount(TEST_USER_ID, "acc-1", { name: "Renamed" });

      expect(mockPrisma.balance.create).not.toHaveBeenCalled();
    });

    it("uses $transaction for atomicity", async () => {
      const row = makeMockRow();
      mockPrisma.account.findUnique.mockResolvedValue({ ...row, userId: TEST_USER_ID });
      mockPrisma.account.update.mockImplementation(
        async (args: { data: Record<string, unknown> }) => ({
          ...row,
          ...args.data,
          updatedAt: new Date(),
        }),
      );

      await updateAccount(TEST_USER_ID, "acc-1", { name: "Transactional" });

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it("re-throws non-P2025 errors", async () => {
      const row = makeMockRow();
      mockPrisma.account.findUnique.mockResolvedValue({ ...row, userId: TEST_USER_ID });
      mockPrisma.account.update.mockRejectedValue(new Error("DB connection failed"));

      await expect(
        updateAccount(TEST_USER_ID, "acc-1", { name: "Fail" }),
      ).rejects.toThrow("DB connection failed");
    });
  });

  describe("deleteAccount", () => {
    it("returns true when deleted", async () => {
      mockPrisma.account.findUnique.mockResolvedValue({ id: "acc-1", userId: TEST_USER_ID });
      mockPrisma.account.delete.mockResolvedValue({});

      const result = await deleteAccount(TEST_USER_ID, "acc-1");
      expect(result).toBe(true);
    });

    it("returns false when not found (P2025)", async () => {
      mockPrisma.account.findUnique.mockResolvedValue(null);

      const result = await deleteAccount(TEST_USER_ID, "nonexistent");
      expect(result).toBe(false);
    });

    it("re-throws non-P2025 errors", async () => {
      mockPrisma.account.findUnique.mockResolvedValue({ id: "acc-1", userId: TEST_USER_ID });
      mockPrisma.account.delete.mockRejectedValue(new Error("DB connection failed"));

      await expect(deleteAccount(TEST_USER_ID, "acc-1")).rejects.toThrow(
        "DB connection failed",
      );
    });
  });
});
