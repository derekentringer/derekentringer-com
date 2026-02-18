import bcrypt from "bcryptjs";
import crypto from "crypto";

const TEST_PASSWORD = "testpassword123";

process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync(TEST_PASSWORD, 10);
process.env.JWT_SECRET = "test-jwt-secret-for-account-tests-min32c";
process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret-for-tests-min32";
process.env.CORS_ORIGIN = "http://localhost:3003";
process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");

import { describe, it, expect, afterAll, afterEach, vi, beforeAll } from "vitest";
import { createMockPrisma } from "./helpers/mockPrisma.js";
import { encryptAccountForCreate } from "../lib/mappers.js";
import { AccountType } from "@derekentringer/shared";

let mockPrisma: ReturnType<typeof createMockPrisma>;

beforeAll(() => {
  mockPrisma = createMockPrisma();
});

import { buildApp } from "../app.js";

describe("Account routes", () => {
  const app = buildApp({ disableRateLimit: true });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Re-setup $transaction after clearAllMocks
    (mockPrisma as any).$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
  });

  async function getAccessToken(): Promise<string> {
    const rt = mockPrisma.refreshToken as any;
    rt.create.mockResolvedValue({});

    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { username: "admin", password: TEST_PASSWORD },
    });
    return res.json().accessToken;
  }

  function makeMockAccountRow(overrides: Record<string, unknown> = {}) {
    const encrypted = encryptAccountForCreate({
      name: "Test Account",
      type: AccountType.Checking,
      institution: "Test Bank",
      currentBalance: 1000,
    });

    return {
      id: "acc-123",
      ...encrypted,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  // --- POST /accounts ---

  describe("POST /accounts", () => {
    it("creates an account with valid data (201)", async () => {
      const token = await getAccessToken();
      const acct = mockPrisma.account as any;
      acct.create.mockImplementation(async (args: any) => ({
        id: "acc-new",
        ...args.data,
        isActive: args.data.isActive ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const res = await app.inject({
        method: "POST",
        url: "/accounts",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: "My Checking",
          type: "checking",
          institution: "Chase",
          currentBalance: 5000,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.account).toBeDefined();
      expect(body.account.name).toBe("My Checking");
      expect(body.account.type).toBe("checking");
      expect(body.account.institution).toBe("Chase");
      expect(body.account.currentBalance).toBe(5000);
      expect(body.account.isActive).toBe(true);
    });

    it("returns 400 with missing required fields", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "POST",
        url: "/accounts",
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Incomplete" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("required");
    });

    it("returns 400 with invalid account type", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "POST",
        url: "/accounts",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: "Bad Type",
          type: "invalid_type",
          institution: "Bank",
          currentBalance: 100,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("Invalid account type");
    });

    it("returns 400 with non-numeric currentBalance", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "POST",
        url: "/accounts",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: "Bad Balance",
          type: "checking",
          institution: "Bank",
          currentBalance: "not_a_number",
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("currentBalance must be a finite number");
    });

    it("returns 400 with non-numeric interestRate", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "POST",
        url: "/accounts",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: "Bad Rate",
          type: "high_yield_savings",
          institution: "Bank",
          currentBalance: 100,
          interestRate: "bad",
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("interestRate must be a finite number");
    });

    it("returns 400 with string fields exceeding max length", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "POST",
        url: "/accounts",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: "A".repeat(256),
          type: "checking",
          institution: "Bank",
          currentBalance: 100,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("must not exceed");
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/accounts",
        payload: {
          name: "No Auth",
          type: "checking",
          institution: "Bank",
          currentBalance: 0,
        },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // --- GET /accounts ---

  describe("GET /accounts", () => {
    it("returns list of accounts (200)", async () => {
      const token = await getAccessToken();
      const acct = mockPrisma.account as any;
      acct.findMany.mockResolvedValue([
        makeMockAccountRow({ id: "acc-1" }),
        makeMockAccountRow({ id: "acc-2" }),
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/accounts",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.accounts).toHaveLength(2);
    });

    it("filters by active status", async () => {
      const token = await getAccessToken();
      const acct = mockPrisma.account as any;
      acct.findMany.mockResolvedValue([makeMockAccountRow()]);

      await app.inject({
        method: "GET",
        url: "/accounts?active=true",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(acct.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true },
        }),
      );
    });
  });

  // --- GET /accounts/:id ---

  describe("GET /accounts/:id", () => {
    it("returns account if found (200)", async () => {
      const token = await getAccessToken();
      const acct = mockPrisma.account as any;
      acct.findUnique.mockResolvedValue(makeMockAccountRow());

      const res = await app.inject({
        method: "GET",
        url: "/accounts/acc-123",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.account.id).toBe("acc-123");
      expect(body.account.name).toBe("Test Account");
    });

    it("returns 404 if not found", async () => {
      const token = await getAccessToken();
      const acct = mockPrisma.account as any;
      acct.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "GET",
        url: "/accounts/nonexistent",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().message).toBe("Account not found");
    });
  });

  // --- PATCH /accounts/:id ---

  describe("PATCH /accounts/:id", () => {
    it("updates account fields (200)", async () => {
      const token = await getAccessToken();
      const acct = mockPrisma.account as any;
      const row = makeMockAccountRow();
      acct.update.mockImplementation(async (args: any) => ({
        ...row,
        ...args.data,
        updatedAt: new Date(),
      }));

      const res = await app.inject({
        method: "PATCH",
        url: "/accounts/acc-123",
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Updated Name" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.account.name).toBe("Updated Name");
    });

    it("returns 404 if not found", async () => {
      const token = await getAccessToken();
      const acct = mockPrisma.account as any;
      const notFoundError = new Error("Not found") as any;
      notFoundError.code = "P2025";
      acct.update.mockRejectedValue(notFoundError);

      const res = await app.inject({
        method: "PATCH",
        url: "/accounts/nonexistent",
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Nope" },
      });

      expect(res.statusCode).toBe(404);
    });

    it("creates Balance snapshot when currentBalance changes", async () => {
      const token = await getAccessToken();
      const acct = mockPrisma.account as any;
      const bal = mockPrisma.balance as any;
      const row = makeMockAccountRow(); // currentBalance encrypted from 1000
      acct.findUnique.mockResolvedValue({ currentBalance: row.currentBalance });
      acct.update.mockImplementation(async (args: any) => ({
        ...row,
        ...args.data,
        updatedAt: new Date(),
      }));
      bal.create.mockResolvedValue({});

      await app.inject({
        method: "PATCH",
        url: "/accounts/acc-123",
        headers: { authorization: `Bearer ${token}` },
        payload: { currentBalance: 9999 },
      });

      expect(bal.create).toHaveBeenCalledTimes(1);
      const balData = bal.create.mock.calls[0][0].data;
      expect(balData.accountId).toBe("acc-123");
      expect(balData.balance).toBeDefined();
      expect(balData.date).toBeDefined();
    });

    it("returns 400 with invalid account type", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "PATCH",
        url: "/accounts/acc-123",
        headers: { authorization: `Bearer ${token}` },
        payload: { type: "bad_type" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 with empty body", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "PATCH",
        url: "/accounts/acc-123",
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("at least one recognized field");
    });

    it("returns 400 with non-numeric currentBalance", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "PATCH",
        url: "/accounts/acc-123",
        headers: { authorization: `Bearer ${token}` },
        payload: { currentBalance: "bad" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("currentBalance must be a finite number");
    });

    it("returns 400 with string fields exceeding max length", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "PATCH",
        url: "/accounts/acc-123",
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "A".repeat(256) },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("must not exceed");
    });
  });

  // --- DELETE /accounts/:id ---

  describe("DELETE /accounts/:id", () => {
    it("deletes account (204)", async () => {
      const token = await getAccessToken();
      const acct = mockPrisma.account as any;
      acct.delete.mockResolvedValue({});

      const res = await app.inject({
        method: "DELETE",
        url: "/accounts/acc-123",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(204);
    });

    it("returns 404 if not found", async () => {
      const token = await getAccessToken();
      const acct = mockPrisma.account as any;
      const notFoundError = new Error("Not found") as any;
      notFoundError.code = "P2025";
      acct.delete.mockRejectedValue(notFoundError);

      const res = await app.inject({
        method: "DELETE",
        url: "/accounts/nonexistent",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
