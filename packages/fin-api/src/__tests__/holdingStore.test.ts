import crypto from "crypto";

process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { initEncryptionKey } from "../lib/encryption.js";
import { createMockPrisma } from "./helpers/mockPrisma.js";
import type { MockPrisma } from "./helpers/mockPrisma.js";
import { encryptHoldingForCreate } from "../lib/mappers.js";

let mockPrisma: MockPrisma;

beforeAll(() => {
  initEncryptionKey(process.env.ENCRYPTION_KEY!);
  mockPrisma = createMockPrisma();
});

import {
  createHolding,
  getHolding,
  listHoldings,
  updateHolding,
  deleteHolding,
  reorderHoldings,
  updateHoldingPrice,
  listAllHoldingsWithTickers,
} from "../store/holdingStore.js";

interface P2025Error extends Error {
  code: string;
}

function makeMockRow(overrides: Record<string, unknown> = {}) {
  const encrypted = encryptHoldingForCreate({
    accountId: "acc-1",
    name: "Test Holding",
    ticker: "TST",
    shares: 10,
    costBasis: 100,
    currentPrice: 120,
    assetClass: "stocks",
    notes: "Test note",
  });
  return {
    id: "hold-1",
    ...encrypted,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeP2025Error(): P2025Error {
  const e = new Error("Record not found") as P2025Error;
  e.code = "P2025";
  return e;
}

describe("holdingStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      async (fn: (client: MockPrisma) => Promise<unknown>) => fn(mockPrisma),
    );
  });

  describe("createHolding", () => {
    it("encrypts data and returns decrypted holding", async () => {
      mockPrisma.holding.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } });
      mockPrisma.holding.create.mockImplementation(
        async (args: { data: Record<string, unknown> }) => ({
          id: "hold-new",
          ...args.data,
          sortOrder: args.data.sortOrder ?? 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      const result = await createHolding({
        accountId: "acc-1",
        name: "Apple Inc.",
        ticker: "AAPL",
        shares: 10,
        costBasis: 150,
        currentPrice: 175,
        assetClass: "stocks",
        notes: "Long-term hold",
      });

      expect(result.id).toBe("hold-new");
      expect(result.name).toBe("Apple Inc.");
      expect(result.ticker).toBe("AAPL");
      expect(result.shares).toBe(10);
      expect(result.costBasis).toBe(150);
      expect(result.currentPrice).toBe(175);
      expect(result.assetClass).toBe("stocks");
      expect(result.notes).toBe("Long-term hold");
      expect(result.sortOrder).toBe(3); // max(2) + 1
      expect(mockPrisma.holding.create).toHaveBeenCalledTimes(1);
    });

    it("assigns sortOrder 0 when no holdings exist for account", async () => {
      mockPrisma.holding.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
      mockPrisma.holding.create.mockImplementation(
        async (args: { data: Record<string, unknown> }) => ({
          id: "hold-first",
          ...args.data,
          sortOrder: args.data.sortOrder ?? 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      const result = await createHolding({
        accountId: "acc-1",
        name: "First Holding",
        assetClass: "stocks",
      });

      expect(result.sortOrder).toBe(0);
    });

    it("computes marketValue, gainLoss, gainLossPct", async () => {
      mockPrisma.holding.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
      mockPrisma.holding.create.mockImplementation(
        async (args: { data: Record<string, unknown> }) => ({
          id: "hold-calc",
          ...args.data,
          sortOrder: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      const result = await createHolding({
        accountId: "acc-1",
        name: "Test Stock",
        shares: 10,
        costBasis: 100,
        currentPrice: 120,
        assetClass: "stocks",
      });

      expect(result.marketValue).toBe(1200);
      expect(result.gainLoss).toBe(200);
      expect(result.gainLossPct).toBe(20);
    });
  });

  describe("getHolding", () => {
    it("returns decrypted holding when found", async () => {
      mockPrisma.holding.findUnique.mockResolvedValue(makeMockRow());

      const result = await getHolding("hold-1");

      expect(result).not.toBeNull();
      expect(result!.name).toBe("Test Holding");
      expect(result!.ticker).toBe("TST");
      expect(result!.shares).toBe(10);
    });

    it("returns null when not found", async () => {
      mockPrisma.holding.findUnique.mockResolvedValue(null);

      const result = await getHolding("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("listHoldings", () => {
    it("returns holdings for an account ordered by sortOrder", async () => {
      const encA = encryptHoldingForCreate({
        accountId: "acc-1",
        name: "Holding A",
        assetClass: "stocks",
      });
      const encB = encryptHoldingForCreate({
        accountId: "acc-1",
        name: "Holding B",
        assetClass: "bonds",
      });

      mockPrisma.holding.findMany.mockResolvedValue([
        {
          id: "hold-a",
          ...encA,
          sortOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "hold-b",
          ...encB,
          sortOrder: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await listHoldings("acc-1");

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Holding A");
      expect(result[1].name).toBe("Holding B");
      expect(mockPrisma.holding.findMany).toHaveBeenCalledWith({
        where: { accountId: "acc-1" },
        orderBy: { sortOrder: "asc" },
      });
    });
  });

  describe("updateHolding", () => {
    it("updates and returns decrypted holding", async () => {
      const row = makeMockRow();
      mockPrisma.holding.update.mockImplementation(
        async (args: { data: Record<string, unknown> }) => ({
          ...row,
          ...args.data,
          updatedAt: new Date(),
        }),
      );

      const result = await updateHolding("hold-1", { name: "Updated Name" });

      expect(result).not.toBeNull();
      expect(result!.name).toBe("Updated Name");
    });

    it("returns null when holding not found (P2025)", async () => {
      mockPrisma.holding.update.mockRejectedValue(makeP2025Error());

      const result = await updateHolding("nonexistent", { name: "Nope" });
      expect(result).toBeNull();
    });

    it("re-throws non-P2025 errors", async () => {
      mockPrisma.holding.update.mockRejectedValue(new Error("DB connection failed"));

      await expect(
        updateHolding("hold-1", { name: "Fail" }),
      ).rejects.toThrow("DB connection failed");
    });
  });

  describe("deleteHolding", () => {
    it("returns true when deleted", async () => {
      mockPrisma.holding.delete.mockResolvedValue({});

      const result = await deleteHolding("hold-1");
      expect(result).toBe(true);
    });

    it("returns false when not found (P2025)", async () => {
      mockPrisma.holding.delete.mockRejectedValue(makeP2025Error());

      const result = await deleteHolding("nonexistent");
      expect(result).toBe(false);
    });

    it("re-throws non-P2025 errors", async () => {
      mockPrisma.holding.delete.mockRejectedValue(new Error("DB connection failed"));

      await expect(deleteHolding("hold-1")).rejects.toThrow("DB connection failed");
    });
  });

  describe("reorderHoldings", () => {
    it("calls $transaction with update operations", async () => {
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);
      mockPrisma.holding.update.mockResolvedValue({});

      await reorderHoldings([
        { id: "hold-a", sortOrder: 1 },
        { id: "hold-b", sortOrder: 0 },
      ]);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe("updateHoldingPrice", () => {
    it("updates currentPrice via updateHolding", async () => {
      const row = makeMockRow();
      mockPrisma.holding.update.mockImplementation(
        async (args: { data: Record<string, unknown> }) => ({
          ...row,
          ...args.data,
          updatedAt: new Date(),
        }),
      );

      const result = await updateHoldingPrice("hold-1", 200);

      expect(result).not.toBeNull();
      expect(result!.currentPrice).toBe(200);
    });
  });

  describe("listAllHoldingsWithTickers", () => {
    it("returns only holdings with tickers", async () => {
      const withTicker = encryptHoldingForCreate({
        accountId: "acc-1",
        name: "Apple",
        ticker: "AAPL",
        assetClass: "stocks",
      });
      const withoutTicker = encryptHoldingForCreate({
        accountId: "acc-1",
        name: "Employer Fund",
        assetClass: "stocks",
      });

      mockPrisma.holding.findMany.mockResolvedValue([
        {
          id: "hold-with",
          ...withTicker,
          sortOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "hold-without",
          ...withoutTicker,
          sortOrder: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await listAllHoldingsWithTickers();

      expect(result).toHaveLength(1);
      expect(result[0].ticker).toBe("AAPL");
    });
  });
});
