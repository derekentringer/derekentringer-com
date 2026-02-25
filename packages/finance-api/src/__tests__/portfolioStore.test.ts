import crypto from "crypto";

process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { initEncryptionKey, encryptNumber } from "../lib/encryption.js";
import { createMockPrisma } from "./helpers/mockPrisma.js";
import type { MockPrisma } from "./helpers/mockPrisma.js";
import { encryptHoldingForCreate } from "../lib/mappers.js";

let mockPrisma: MockPrisma;

beforeAll(() => {
  initEncryptionKey(process.env.ENCRYPTION_KEY!);
  mockPrisma = createMockPrisma();
});

import {
  computeAssetAllocation,
  computePerformance,
  computeRebalanceSuggestions,
} from "../store/portfolioStore.js";

function makeHoldingRow(overrides: Record<string, unknown> = {}) {
  const encrypted = encryptHoldingForCreate({
    accountId: "acc-inv",
    name: "Test Stock",
    ticker: "TST",
    shares: 10,
    costBasis: 100,
    currentPrice: 120,
    assetClass: "stocks",
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

function makeSavingsAccountRow(balance: number) {
  return { currentBalance: encryptNumber(balance) };
}

function makeTargetAllocationRow(assetClass: string, targetPct: number) {
  return {
    id: `ta-${assetClass}`,
    accountId: null,
    assetClass,
    targetPct: encryptNumber(targetPct),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makePriceHistoryRow(ticker: string, price: number, dateStr: string) {
  return {
    id: `ph-${ticker}-${dateStr}`,
    ticker,
    price: encryptNumber(price),
    date: new Date(dateStr),
    source: "test",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("portfolioStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no holdings, no accounts, no targets, no price history
    mockPrisma.holding.findMany.mockResolvedValue([]);
    mockPrisma.account.findMany.mockResolvedValue([]);
    mockPrisma.targetAllocation.findMany.mockResolvedValue([]);
    mockPrisma.priceHistory.findMany.mockResolvedValue([]);
    mockPrisma.benchmarkHistory.findMany.mockResolvedValue([]);
  });

  describe("computeAssetAllocation", () => {
    it("includes cash from savings/HYS accounts for portfolio-wide query", async () => {
      const holding = makeHoldingRow(); // 10 shares * 120 = 1200 market value
      mockPrisma.holding.findMany.mockResolvedValue([holding]);
      mockPrisma.account.findMany.mockResolvedValue([
        makeSavingsAccountRow(5000),
        makeSavingsAccountRow(3000),
      ]);

      const result = await computeAssetAllocation();

      expect(result.totalMarketValue).toBe(1200 + 8000);
      const cashSlice = result.slices.find((s) => s.assetClass === "cash");
      expect(cashSlice).toBeDefined();
      expect(cashSlice!.marketValue).toBe(8000);
    });

    it("does NOT include cash from savings accounts when accountId is provided", async () => {
      const holding = makeHoldingRow();
      mockPrisma.holding.findMany.mockResolvedValue([holding]);

      const result = await computeAssetAllocation("acc-inv");

      expect(result.totalMarketValue).toBe(1200);
      const cashSlice = result.slices.find((s) => s.assetClass === "cash");
      expect(cashSlice).toBeUndefined();
      // Should not query accounts at all
      expect(mockPrisma.account.findMany).not.toHaveBeenCalled();
    });

    it("works without savings accounts (no cash slice added)", async () => {
      const holding = makeHoldingRow();
      mockPrisma.holding.findMany.mockResolvedValue([holding]);
      mockPrisma.account.findMany.mockResolvedValue([]);

      const result = await computeAssetAllocation();

      expect(result.totalMarketValue).toBe(1200);
      const cashSlice = result.slices.find((s) => s.assetClass === "cash");
      expect(cashSlice).toBeUndefined();
    });

    it("handles zero-balance savings (no cash slice added)", async () => {
      const holding = makeHoldingRow();
      mockPrisma.holding.findMany.mockResolvedValue([holding]);
      mockPrisma.account.findMany.mockResolvedValue([
        makeSavingsAccountRow(0),
      ]);

      const result = await computeAssetAllocation();

      expect(result.totalMarketValue).toBe(1200);
      const cashSlice = result.slices.find((s) => s.assetClass === "cash");
      expect(cashSlice).toBeUndefined();
    });
  });

  describe("computePerformance", () => {
    it("portfolio-wide: totalValue includes savings, totalCost includes savings (zero return)", async () => {
      const holding = makeHoldingRow(); // mv=1200, cost=10*100=1000
      mockPrisma.holding.findMany.mockResolvedValue([holding]);
      mockPrisma.account.findMany.mockResolvedValue([
        makeSavingsAccountRow(5000),
      ]);

      const result = await computePerformance("12m");

      expect(result.summary.totalValue).toBe(1200 + 5000);
      expect(result.summary.totalCost).toBe(1000 + 5000);
      // Return should only reflect investment gain: (6200 - 6000) / 6000
      const expectedReturnPct = Math.round(((200) / 6000) * 100 * 100) / 100;
      expect(result.summary.totalReturnPct).toBe(expectedReturnPct);
    });

    it("portfolio-wide: savings NOT in historical series data points", async () => {
      const holding = makeHoldingRow();
      mockPrisma.holding.findMany.mockResolvedValue([holding]);
      mockPrisma.account.findMany.mockResolvedValue([
        makeSavingsAccountRow(5000),
      ]);

      // Provide price history for the ticker
      mockPrisma.priceHistory.findMany.mockResolvedValue([
        makePriceHistoryRow("TST", 110, "2025-06-01"),
        makePriceHistoryRow("TST", 120, "2025-12-01"),
      ]);
      mockPrisma.benchmarkHistory.findMany.mockResolvedValue([]);

      const result = await computePerformance("12m");

      // Series values should NOT include the 5000 savings balance
      for (const point of result.series) {
        // 10 shares * price, no savings
        expect(point.portfolioValue).toBeLessThanOrEqual(1200);
      }
    });

    it("with accountId: savings excluded entirely", async () => {
      const holding = makeHoldingRow();
      mockPrisma.holding.findMany.mockResolvedValue([holding]);

      const result = await computePerformance("12m", "acc-inv");

      expect(result.summary.totalValue).toBe(1200);
      expect(result.summary.totalCost).toBe(1000);
      // Should not query accounts at all
      expect(mockPrisma.account.findMany).not.toHaveBeenCalled();
    });
  });

  describe("computeRebalanceSuggestions", () => {
    it("returns suggestions based on allocation with targets", async () => {
      const holding = makeHoldingRow(); // stocks, mv=1200
      mockPrisma.holding.findMany.mockResolvedValue([holding]);
      mockPrisma.account.findMany.mockResolvedValue([]);
      mockPrisma.targetAllocation.findMany.mockResolvedValue([
        makeTargetAllocationRow("stocks", 60),
        makeTargetAllocationRow("bonds", 40),
      ]);

      const result = await computeRebalanceSuggestions();

      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.totalMarketValue).toBe(1200);

      // stocks is at 100% with target 60%, should suggest sell
      const stocksSuggestion = result.suggestions.find(
        (s) => s.assetClass === "stocks",
      );
      expect(stocksSuggestion).toBeDefined();
      expect(stocksSuggestion!.action).toBe("sell");

      // bonds is at 0% with target 40%, should suggest buy
      const bondsSuggestion = result.suggestions.find(
        (s) => s.assetClass === "bonds",
      );
      expect(bondsSuggestion).toBeDefined();
      expect(bondsSuggestion!.action).toBe("buy");
    });
  });
});
