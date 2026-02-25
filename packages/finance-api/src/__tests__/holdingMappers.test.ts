import { describe, it, expect, beforeAll } from "vitest";
import { initEncryptionKey, encryptNumber } from "../lib/encryption.js";
import {
  decryptHolding,
  encryptHoldingForCreate,
  encryptHoldingForUpdate,
  decryptTargetAllocation,
  encryptTargetAllocationForCreate,
  decryptPriceHistory,
} from "../lib/mappers.js";
import { randomBytes } from "crypto";

const TEST_KEY = randomBytes(32).toString("hex");

beforeAll(() => {
  initEncryptionKey(TEST_KEY);
});

describe("Holding mappers", () => {
  it("encryptHoldingForCreate encrypts sensitive fields", () => {
    const input = {
      accountId: "acc-1",
      name: "Apple Inc.",
      ticker: "AAPL",
      shares: 10,
      costBasis: 150.5,
      currentPrice: 175.25,
      assetClass: "stocks",
      notes: "Long-term hold",
    };

    const encrypted = encryptHoldingForCreate(input);

    expect(encrypted.accountId).toBe("acc-1");
    expect(encrypted.name).not.toBe("Apple Inc.");
    expect(encrypted.ticker).not.toBe("AAPL");
    expect(encrypted.ticker).not.toBeNull();
    expect(encrypted.shares).not.toBe("10");
    expect(encrypted.shares).not.toBeNull();
    expect(encrypted.costBasis).not.toBe("150.5");
    expect(encrypted.currentPrice).not.toBe("175.25");
    expect(encrypted.assetClass).toBe("stocks");
    expect(encrypted.notes).not.toBe("Long-term hold");
    expect(encrypted.notes).not.toBeNull();
  });

  it("encryptHoldingForCreate handles null optional fields", () => {
    const input = {
      accountId: "acc-1",
      name: "Employer Fund",
      assetClass: "stocks",
    };

    const encrypted = encryptHoldingForCreate(input);

    expect(encrypted.ticker).toBeNull();
    expect(encrypted.shares).toBeNull();
    expect(encrypted.costBasis).toBeNull();
    expect(encrypted.currentPrice).toBeNull();
    expect(encrypted.notes).toBeNull();
  });

  it("decryptHolding round-trips with encryptHoldingForCreate", () => {
    const input = {
      accountId: "acc-1",
      name: "Vanguard S&P 500",
      ticker: "VOO",
      shares: 25.5,
      costBasis: 400,
      currentPrice: 450,
      assetClass: "stocks",
      notes: "Index fund",
    };

    const encrypted = encryptHoldingForCreate(input);
    const now = new Date();

    const row = {
      id: "hold-123",
      ...encrypted,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };

    const decrypted = decryptHolding(row);

    expect(decrypted.id).toBe("hold-123");
    expect(decrypted.accountId).toBe("acc-1");
    expect(decrypted.name).toBe("Vanguard S&P 500");
    expect(decrypted.ticker).toBe("VOO");
    expect(decrypted.shares).toBe(25.5);
    expect(decrypted.costBasis).toBe(400);
    expect(decrypted.currentPrice).toBe(450);
    expect(decrypted.assetClass).toBe("stocks");
    expect(decrypted.notes).toBe("Index fund");
    expect(decrypted.sortOrder).toBe(0);
  });

  it("decryptHolding computes marketValue, gainLoss, gainLossPct", () => {
    const input = {
      accountId: "acc-1",
      name: "Test Stock",
      ticker: "TST",
      shares: 10,
      costBasis: 100,
      currentPrice: 120,
      assetClass: "stocks",
    };

    const encrypted = encryptHoldingForCreate(input);
    const now = new Date();

    const row = {
      id: "hold-calc",
      ...encrypted,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };

    const decrypted = decryptHolding(row);

    expect(decrypted.marketValue).toBe(1200); // 10 * 120
    expect(decrypted.gainLoss).toBe(200); // 1200 - 1000
    expect(decrypted.gainLossPct).toBe(20); // (200/1000) * 100
  });

  it("decryptHolding handles missing shares/price (no computed values)", () => {
    const input = {
      accountId: "acc-1",
      name: "Employer Fund",
      assetClass: "stocks",
    };

    const encrypted = encryptHoldingForCreate(input);
    const now = new Date();

    const row = {
      id: "hold-no-calc",
      ...encrypted,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };

    const decrypted = decryptHolding(row);

    expect(decrypted.marketValue).toBeUndefined();
    expect(decrypted.gainLoss).toBeUndefined();
    expect(decrypted.gainLossPct).toBeUndefined();
  });

  it("encryptHoldingForUpdate only includes provided fields", () => {
    const data = encryptHoldingForUpdate({
      name: "Updated Name",
      currentPrice: 200,
    });

    expect(data.name).toBeDefined();
    expect(data.name).not.toBe("Updated Name");
    expect(data.currentPrice).toBeDefined();
    expect(data.ticker).toBeUndefined();
    expect(data.shares).toBeUndefined();
    expect(data.costBasis).toBeUndefined();
    expect(data.assetClass).toBeUndefined();
    expect(data.notes).toBeUndefined();
  });

  it("encryptHoldingForUpdate handles null values for nullable fields", () => {
    const data = encryptHoldingForUpdate({
      ticker: null,
      shares: null,
      costBasis: null,
      currentPrice: null,
      notes: null,
    });

    expect(data.ticker).toBeNull();
    expect(data.shares).toBeNull();
    expect(data.costBasis).toBeNull();
    expect(data.currentPrice).toBeNull();
    expect(data.notes).toBeNull();
  });
});

describe("TargetAllocation mappers", () => {
  it("round-trips target allocation", () => {
    const input = {
      accountId: "acc-1",
      assetClass: "stocks",
      targetPct: 60,
    };

    const encrypted = encryptTargetAllocationForCreate(input);
    const now = new Date();

    const row = {
      id: "ta-1",
      ...encrypted,
      createdAt: now,
      updatedAt: now,
    };

    const decrypted = decryptTargetAllocation(row);

    expect(decrypted.id).toBe("ta-1");
    expect(decrypted.accountId).toBe("acc-1");
    expect(decrypted.assetClass).toBe("stocks");
    expect(decrypted.targetPct).toBe(60);
  });

  it("handles null accountId (portfolio-wide)", () => {
    const input = {
      assetClass: "bonds",
      targetPct: 20,
    };

    const encrypted = encryptTargetAllocationForCreate(input);

    expect(encrypted.accountId).toBeNull();
  });
});

describe("PriceHistory mappers", () => {
  it("decrypts price history", () => {
    const now = new Date();

    const row = {
      id: "ph-1",
      ticker: "AAPL",
      price: encryptNumber(175.5),
      date: now,
      source: "finnhub",
      createdAt: now,
    };

    const decrypted = decryptPriceHistory(row);

    expect(decrypted.id).toBe("ph-1");
    expect(decrypted.ticker).toBe("AAPL");
    expect(decrypted.price).toBe(175.5);
    expect(decrypted.source).toBe("finnhub");
  });
});
