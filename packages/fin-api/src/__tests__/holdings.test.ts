import bcrypt from "bcryptjs";
import crypto from "crypto";

const TEST_PASSWORD = "testpassword123";
const VALID_CUID = "cm1a2b3c4d5e6f7g8h9i0j";
const VALID_CUID_2 = "cm9z8y7x6w5v4u3t2s1r0q";
const VALID_ACCOUNT_ID = "cm2b3c4d5e6f7g8h9i0j1k";

process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync(TEST_PASSWORD, 10);
process.env.JWT_SECRET = "test-jwt-secret-for-holding-tests-min32ch";
process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret-for-tests-min32";
process.env.PIN_TOKEN_SECRET = "dev-pin-secret-do-not-use-in-prod";
process.env.CORS_ORIGIN = "http://localhost:3003";
process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");

import { describe, it, expect, afterAll, afterEach, vi, beforeAll } from "vitest";
import { signPinToken } from "@derekentringer/shared/auth/pinVerify";
import { createMockPrisma } from "./helpers/mockPrisma.js";
import type { MockPrisma } from "./helpers/mockPrisma.js";
import { encryptHoldingForCreate, encryptAccountForCreate } from "../lib/mappers.js";
import { AccountType } from "@derekentringer/shared";

let mockPrisma: MockPrisma;

beforeAll(() => {
  mockPrisma = createMockPrisma();
});

import { buildApp } from "../app.js";

interface P2025Error extends Error {
  code: string;
}

function makeMockAccountRow(type: AccountType = AccountType.Investment) {
  const encrypted = encryptAccountForCreate({
    name: "Test Account",
    type,
  });
  return {
    id: VALID_ACCOUNT_ID,
    ...encrypted,
    sortOrder: 0,
    isActive: true,
    isFavorite: false,
    excludeFromIncomeSources: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeMockHoldingRow(overrides: Record<string, unknown> = {}) {
  const encrypted = encryptHoldingForCreate({
    accountId: VALID_ACCOUNT_ID,
    name: "Test Holding",
    ticker: "TST",
    shares: 10,
    costBasis: 100,
    currentPrice: 120,
    assetClass: "stocks",
    notes: "Test note",
  });

  return {
    id: VALID_CUID,
    ...encrypted,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("Holding routes", () => {
  const app = buildApp({ disableRateLimit: true });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      async (fn: (client: MockPrisma) => Promise<unknown>) => fn(mockPrisma),
    );
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

  function getPinToken(): string {
    return signPinToken({ sub: "admin-001", type: "pin" }, "dev-pin-secret-do-not-use-in-prod");
  }

  // --- POST /holdings ---

  describe("POST /holdings", () => {
    it("creates a holding with valid data (201)", async () => {
      const token = await getAccessToken();
      mockPrisma.account.findUnique.mockResolvedValue(makeMockAccountRow());
      mockPrisma.holding.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
      mockPrisma.holding.create.mockImplementation(
        async (args: { data: Record<string, unknown> }) => ({
          id: "hold-new",
          ...args.data,
          sortOrder: args.data.sortOrder ?? 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      const res = await app.inject({
        method: "POST",
        url: "/holdings",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          accountId: VALID_ACCOUNT_ID,
          name: "Apple Inc.",
          ticker: "AAPL",
          shares: 10,
          costBasis: 150,
          currentPrice: 175,
          assetClass: "stocks",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.holding).toBeDefined();
      expect(body.holding.name).toBe("Apple Inc.");
      expect(body.holding.ticker).toBe("AAPL");
      expect(body.holding.assetClass).toBe("stocks");
    });

    it("returns 400 with missing required fields", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "POST",
        url: "/holdings",
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Incomplete" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 with invalid accountId format", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "POST",
        url: "/holdings",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          accountId: "invalid-id",
          name: "Bad Account",
          assetClass: "stocks",
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe("Invalid accountId format");
    });

    it("returns 400 with invalid assetClass", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "POST",
        url: "/holdings",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          accountId: VALID_ACCOUNT_ID,
          name: "Bad Class",
          assetClass: "invalid_class",
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("assetClass must be one of");
    });

    it("returns 400 when account is not investment type", async () => {
      const token = await getAccessToken();
      mockPrisma.account.findUnique.mockResolvedValue(makeMockAccountRow(AccountType.Checking));

      const res = await app.inject({
        method: "POST",
        url: "/holdings",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          accountId: VALID_ACCOUNT_ID,
          name: "Wrong Type",
          assetClass: "stocks",
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe("Account is not an investment account");
    });

    it("returns 400 with negative shares", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "POST",
        url: "/holdings",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          accountId: VALID_ACCOUNT_ID,
          name: "Negative Shares",
          assetClass: "stocks",
          shares: -5,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("shares must be a non-negative number");
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/holdings",
        payload: {
          accountId: VALID_ACCOUNT_ID,
          name: "No Auth",
          assetClass: "stocks",
        },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // --- GET /holdings ---

  describe("GET /holdings", () => {
    it("returns list of holdings for an account (200)", async () => {
      const token = await getAccessToken();
      mockPrisma.holding.findMany.mockResolvedValue([
        makeMockHoldingRow({ id: VALID_CUID }),
        makeMockHoldingRow({ id: VALID_CUID_2 }),
      ]);

      const res = await app.inject({
        method: "GET",
        url: `/holdings?accountId=${VALID_ACCOUNT_ID}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.holdings).toHaveLength(2);
    });

    it("returns 400 without accountId", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "GET",
        url: "/holdings",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("accountId");
    });

    it("returns 400 with invalid accountId", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "GET",
        url: "/holdings?accountId=bad-id",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // --- GET /holdings/:id ---

  describe("GET /holdings/:id", () => {
    it("returns holding if found (200)", async () => {
      const token = await getAccessToken();
      mockPrisma.holding.findUnique.mockResolvedValue(makeMockHoldingRow());

      const res = await app.inject({
        method: "GET",
        url: `/holdings/${VALID_CUID}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.holding.id).toBe(VALID_CUID);
      expect(body.holding.name).toBe("Test Holding");
    });

    it("returns 404 if not found", async () => {
      const token = await getAccessToken();
      mockPrisma.holding.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "GET",
        url: `/holdings/${VALID_CUID_2}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().message).toBe("Holding not found");
    });

    it("returns 400 for invalid ID format", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "GET",
        url: "/holdings/invalid-id",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe("Invalid holding ID format");
    });
  });

  // --- PATCH /holdings/:id ---

  describe("PATCH /holdings/:id", () => {
    it("updates holding fields (200)", async () => {
      const token = await getAccessToken();
      const row = makeMockHoldingRow();
      mockPrisma.holding.update.mockImplementation(
        async (args: { data: Record<string, unknown> }) => ({
          ...row,
          ...args.data,
          updatedAt: new Date(),
        }),
      );

      const res = await app.inject({
        method: "PATCH",
        url: `/holdings/${VALID_CUID}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Updated Holding" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.holding.name).toBe("Updated Holding");
    });

    it("returns 404 if not found", async () => {
      const token = await getAccessToken();
      const notFoundError = new Error("Not found") as P2025Error;
      notFoundError.code = "P2025";
      mockPrisma.holding.update.mockRejectedValue(notFoundError);

      const res = await app.inject({
        method: "PATCH",
        url: `/holdings/${VALID_CUID_2}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Nope" },
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 400 with empty body", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "PATCH",
        url: `/holdings/${VALID_CUID}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 with invalid assetClass", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "PATCH",
        url: `/holdings/${VALID_CUID}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { assetClass: "bad_class" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("assetClass must be one of");
    });

    it("returns 400 with negative shares", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "PATCH",
        url: `/holdings/${VALID_CUID}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { shares: -1 },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("shares must be a non-negative number");
    });

    it("allows null for nullable fields", async () => {
      const token = await getAccessToken();
      const row = makeMockHoldingRow();
      mockPrisma.holding.update.mockImplementation(
        async (args: { data: Record<string, unknown> }) => ({
          ...row,
          ...args.data,
          updatedAt: new Date(),
        }),
      );

      const res = await app.inject({
        method: "PATCH",
        url: `/holdings/${VALID_CUID}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { ticker: null, shares: null, costBasis: null, currentPrice: null, notes: null },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      // decryptOptionalField returns undefined for null DB values
      expect(body.holding.ticker).toBeUndefined();
      expect(body.holding.shares).toBeUndefined();
    });

    it("returns 400 for invalid ID format", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "PATCH",
        url: "/holdings/invalid-id",
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Test" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe("Invalid holding ID format");
    });
  });

  // --- DELETE /holdings/:id ---

  describe("DELETE /holdings/:id", () => {
    it("deletes holding (204)", async () => {
      const token = await getAccessToken();
      mockPrisma.holding.delete.mockResolvedValue({});

      const res = await app.inject({
        method: "DELETE",
        url: `/holdings/${VALID_CUID}`,
        headers: { authorization: `Bearer ${token}`, "x-pin-token": getPinToken() },
      });

      expect(res.statusCode).toBe(204);
    });

    it("returns 403 without PIN token", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "DELETE",
        url: `/holdings/${VALID_CUID}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().message).toBe("PIN verification required");
    });

    it("returns 404 if not found", async () => {
      const token = await getAccessToken();
      const notFoundError = new Error("Not found") as P2025Error;
      notFoundError.code = "P2025";
      mockPrisma.holding.delete.mockRejectedValue(notFoundError);

      const res = await app.inject({
        method: "DELETE",
        url: `/holdings/${VALID_CUID_2}`,
        headers: { authorization: `Bearer ${token}`, "x-pin-token": getPinToken() },
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 400 for invalid ID format", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "DELETE",
        url: "/holdings/invalid-id",
        headers: { authorization: `Bearer ${token}`, "x-pin-token": getPinToken() },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe("Invalid holding ID format");
    });
  });

  // --- PUT /holdings/reorder ---

  describe("PUT /holdings/reorder", () => {
    it("reorders holdings (204)", async () => {
      const token = await getAccessToken();
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);
      mockPrisma.holding.update.mockResolvedValue({});

      const res = await app.inject({
        method: "PUT",
        url: "/holdings/reorder",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          order: [
            { id: VALID_CUID, sortOrder: 1 },
            { id: VALID_CUID_2, sortOrder: 0 },
          ],
        },
      });

      expect(res.statusCode).toBe(204);
    });

    it("returns 400 with missing order field", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "PUT",
        url: "/holdings/reorder",
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // --- GET /holdings/quote/:ticker ---

  describe("GET /holdings/quote/:ticker", () => {
    it("returns 400 for invalid ticker format", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "GET",
        url: "/holdings/quote/!!!",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe("Invalid ticker format");
    });
  });
});
