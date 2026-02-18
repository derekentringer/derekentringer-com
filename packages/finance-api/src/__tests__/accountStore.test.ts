import crypto from "crypto";

process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { initEncryptionKey } from "../lib/encryption.js";
import { createMockPrisma } from "./helpers/mockPrisma.js";
import { encryptAccountForCreate } from "../lib/mappers.js";
import { AccountType } from "@derekentringer/shared";

let mockPrisma: ReturnType<typeof createMockPrisma>;

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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeP2025Error(): Error {
  const e = new Error("Record not found") as any;
  e.code = "P2025";
  return e;
}

describe("accountStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-setup $transaction after clearAllMocks
    (mockPrisma as any).$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
  });

  describe("createAccount", () => {
    it("encrypts data and returns decrypted account", async () => {
      const acct = mockPrisma.account as any;
      acct.create.mockImplementation(async (args: any) => ({
        id: "acc-new",
        ...args.data,
        isActive: args.data.isActive ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const result = await createAccount({
        name: "My Checking",
        type: AccountType.Checking,
        institution: "Chase",
        currentBalance: 1000,
      });

      expect(result.id).toBe("acc-new");
      expect(result.name).toBe("My Checking");
      expect(result.currentBalance).toBe(1000);
      expect(result.isActive).toBe(true);
      expect(acct.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("getAccount", () => {
    it("returns decrypted account when found", async () => {
      const acct = mockPrisma.account as any;
      acct.findUnique.mockResolvedValue(makeMockRow());

      const result = await getAccount("acc-1");

      expect(result).not.toBeNull();
      expect(result!.name).toBe("Test");
      expect(result!.currentBalance).toBe(500);
    });

    it("returns null when not found", async () => {
      const acct = mockPrisma.account as any;
      acct.findUnique.mockResolvedValue(null);

      const result = await getAccount("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("listAccounts", () => {
    it("returns all accounts sorted by name after decryption", async () => {
      const acct = mockPrisma.account as any;
      const rowB = makeMockRow({ id: "acc-b" });
      const rowA = makeMockRow({ id: "acc-a" });
      // Override names so we can verify sort order
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
      // Return in reverse order from DB
      acct.findMany.mockResolvedValue([
        { ...rowB, ...encZ, id: "acc-z" },
        { ...rowA, ...encA, id: "acc-a" },
      ]);

      const result = await listAccounts();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Alpha");
      expect(result[1].name).toBe("Zulu");
      // Should NOT use orderBy since names are encrypted
      expect(acct.findMany).toHaveBeenCalledWith({ where: {} });
    });

    it("filters by isActive", async () => {
      const acct = mockPrisma.account as any;
      acct.findMany.mockResolvedValue([]);

      await listAccounts({ isActive: true });

      expect(acct.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });
  });

  describe("updateAccount", () => {
    it("updates and returns decrypted account", async () => {
      const acct = mockPrisma.account as any;
      const row = makeMockRow();
      acct.update.mockImplementation(async (args: any) => ({
        ...row,
        ...args.data,
        updatedAt: new Date(),
      }));

      const result = await updateAccount("acc-1", { name: "Updated" });

      expect(result).not.toBeNull();
      expect(result!.name).toBe("Updated");
    });

    it("returns null when account not found (P2025)", async () => {
      const acct = mockPrisma.account as any;
      acct.update.mockRejectedValue(makeP2025Error());

      const result = await updateAccount("nonexistent", { name: "Nope" });
      expect(result).toBeNull();
    });

    it("creates balance snapshot when currentBalance changes", async () => {
      const acct = mockPrisma.account as any;
      const bal = mockPrisma.balance as any;
      const row = makeMockRow(); // currentBalance encrypted from 500
      acct.findUnique.mockResolvedValue({ currentBalance: row.currentBalance });
      acct.update.mockImplementation(async (args: any) => ({
        ...row,
        ...args.data,
        updatedAt: new Date(),
      }));
      bal.create.mockResolvedValue({});

      await updateAccount("acc-1", { currentBalance: 2000 });

      expect(bal.create).toHaveBeenCalledTimes(1);
    });

    it("does not create balance snapshot when balance is unchanged", async () => {
      const acct = mockPrisma.account as any;
      const bal = mockPrisma.balance as any;
      const row = makeMockRow(); // currentBalance encrypted from 500
      acct.findUnique.mockResolvedValue({ currentBalance: row.currentBalance });
      acct.update.mockImplementation(async (args: any) => ({
        ...row,
        ...args.data,
        updatedAt: new Date(),
      }));

      await updateAccount("acc-1", { currentBalance: 500 });

      expect(bal.create).not.toHaveBeenCalled();
    });

    it("does not create balance snapshot without balance change", async () => {
      const acct = mockPrisma.account as any;
      const bal = mockPrisma.balance as any;
      const row = makeMockRow();
      acct.update.mockImplementation(async (args: any) => ({
        ...row,
        ...args.data,
        updatedAt: new Date(),
      }));

      await updateAccount("acc-1", { name: "Renamed" });

      expect(bal.create).not.toHaveBeenCalled();
    });

    it("uses $transaction for atomicity", async () => {
      const acct = mockPrisma.account as any;
      const row = makeMockRow();
      acct.update.mockImplementation(async (args: any) => ({
        ...row,
        ...args.data,
        updatedAt: new Date(),
      }));

      await updateAccount("acc-1", { name: "Transactional" });

      expect((mockPrisma as any).$transaction).toHaveBeenCalledTimes(1);
    });

    it("re-throws non-P2025 errors", async () => {
      const acct = mockPrisma.account as any;
      acct.update.mockRejectedValue(new Error("DB connection failed"));

      await expect(
        updateAccount("acc-1", { name: "Fail" }),
      ).rejects.toThrow("DB connection failed");
    });
  });

  describe("deleteAccount", () => {
    it("returns true when deleted", async () => {
      const acct = mockPrisma.account as any;
      acct.delete.mockResolvedValue({});

      const result = await deleteAccount("acc-1");
      expect(result).toBe(true);
    });

    it("returns false when not found (P2025)", async () => {
      const acct = mockPrisma.account as any;
      acct.delete.mockRejectedValue(makeP2025Error());

      const result = await deleteAccount("nonexistent");
      expect(result).toBe(false);
    });

    it("re-throws non-P2025 errors", async () => {
      const acct = mockPrisma.account as any;
      acct.delete.mockRejectedValue(new Error("DB connection failed"));

      await expect(deleteAccount("acc-1")).rejects.toThrow(
        "DB connection failed",
      );
    });
  });
});
