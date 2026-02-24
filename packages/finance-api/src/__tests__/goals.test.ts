import bcrypt from "bcryptjs";
import crypto from "crypto";

const TEST_PASSWORD = "testpassword123";
const VALID_CUID = "cm1a2b3c4d5e6f7g8h9i0j";
const VALID_CUID_2 = "cm9z8y7x6w5v4u3t2s1r0q";

process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync(TEST_PASSWORD, 10);
process.env.JWT_SECRET = "test-jwt-secret-for-goal-tests-min32ch";
process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret-for-tests-min32";
process.env.CORS_ORIGIN = "http://localhost:3003";
process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");

import { describe, it, expect, afterAll, afterEach, vi, beforeAll } from "vitest";
import { createMockPrisma } from "./helpers/mockPrisma.js";
import type { MockPrisma } from "./helpers/mockPrisma.js";
import { encryptGoalForCreate } from "../lib/mappers.js";

let mockPrisma: MockPrisma;

beforeAll(() => {
  mockPrisma = createMockPrisma();
});

import { buildApp } from "../app.js";

interface P2025Error extends Error {
  code: string;
}

describe("Goal routes", () => {
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

  function makeMockGoalRow(overrides: Record<string, unknown> = {}) {
    const encrypted = encryptGoalForCreate({
      name: "Test Goal",
      type: "savings",
      targetAmount: 5000,
    });

    return {
      id: VALID_CUID,
      ...encrypted,
      isActive: true,
      isCompleted: false,
      completedAt: null,
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  // --- POST /goals ---

  describe("POST /goals", () => {
    it("creates a goal with valid data (201)", async () => {
      const token = await getAccessToken();
      mockPrisma.goal.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
      mockPrisma.goal.create.mockImplementation(
        async (args: { data: Record<string, unknown> }) => ({
          id: "goal-new",
          ...args.data,
          isActive: true,
          isCompleted: false,
          completedAt: null,
          sortOrder: args.data.sortOrder ?? 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      const res = await app.inject({
        method: "POST",
        url: "/goals",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: "Emergency Fund",
          type: "savings",
          targetAmount: 10000,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.goal).toBeDefined();
      expect(body.goal.name).toBe("Emergency Fund");
      expect(body.goal.type).toBe("savings");
      expect(body.goal.targetAmount).toBe(10000);
      expect(body.goal.isActive).toBe(true);
    });

    it("returns 400 with missing required fields", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "POST",
        url: "/goals",
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Incomplete" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 with invalid goal type", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "POST",
        url: "/goals",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: "Bad Type",
          type: "invalid_type",
          targetAmount: 1000,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("type must be one of");
    });

    it("returns 400 with targetAmount less than 1", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "POST",
        url: "/goals",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: "Low Target",
          type: "savings",
          targetAmount: 0,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("targetAmount must be at least 1");
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/goals",
        payload: {
          name: "No Auth",
          type: "savings",
          targetAmount: 1000,
        },
      });

      expect(res.statusCode).toBe(401);
    });

    it("creates a goal with all optional fields (201)", async () => {
      const token = await getAccessToken();
      mockPrisma.goal.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
      mockPrisma.goal.create.mockImplementation(
        async (args: { data: Record<string, unknown> }) => ({
          id: "goal-full",
          ...args.data,
          isActive: true,
          isCompleted: false,
          completedAt: null,
          sortOrder: args.data.sortOrder ?? 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      const res = await app.inject({
        method: "POST",
        url: "/goals",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: "Debt Payoff",
          type: "debt_payoff",
          targetAmount: 8000,
          targetDate: "2027-01-01",
          priority: 1,
          accountIds: ["acc-1"],
          extraPayment: 200,
          notes: "Focus on credit card",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.goal.name).toBe("Debt Payoff");
      expect(body.goal.type).toBe("debt_payoff");
      expect(body.goal.targetDate).toBe("2027-01-01");
      expect(body.goal.extraPayment).toBe(200);
      expect(body.goal.notes).toBe("Focus on credit card");
    });

    it("creates a goal with monthlyContribution (201)", async () => {
      const token = await getAccessToken();
      mockPrisma.goal.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
      mockPrisma.goal.create.mockImplementation(
        async (args: { data: Record<string, unknown> }) => ({
          id: "goal-mc",
          ...args.data,
          isActive: true,
          isCompleted: false,
          completedAt: null,
          sortOrder: args.data.sortOrder ?? 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      const res = await app.inject({
        method: "POST",
        url: "/goals",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: "Savings with Contribution",
          type: "savings",
          targetAmount: 10000,
          monthlyContribution: 500,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.goal.name).toBe("Savings with Contribution");
      expect(body.goal.monthlyContribution).toBe(500);
    });
  });

  // --- GET /goals ---

  describe("GET /goals", () => {
    it("returns list of goals (200)", async () => {
      const token = await getAccessToken();
      mockPrisma.goal.findMany.mockResolvedValue([
        makeMockGoalRow({ id: VALID_CUID }),
        makeMockGoalRow({ id: VALID_CUID_2 }),
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/goals",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.goals).toHaveLength(2);
    });

    it("filters by active status", async () => {
      const token = await getAccessToken();
      mockPrisma.goal.findMany.mockResolvedValue([makeMockGoalRow()]);

      await app.inject({
        method: "GET",
        url: "/goals?active=true",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(mockPrisma.goal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        }),
      );
    });

    it("filters by type", async () => {
      const token = await getAccessToken();
      mockPrisma.goal.findMany.mockResolvedValue([]);

      await app.inject({
        method: "GET",
        url: "/goals?type=debt_payoff",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(mockPrisma.goal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: "debt_payoff" }),
        }),
      );
    });
  });

  // --- GET /goals/:id ---

  describe("GET /goals/:id", () => {
    it("returns goal if found (200)", async () => {
      const token = await getAccessToken();
      mockPrisma.goal.findUnique.mockResolvedValue(makeMockGoalRow());

      const res = await app.inject({
        method: "GET",
        url: `/goals/${VALID_CUID}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.goal.id).toBe(VALID_CUID);
      expect(body.goal.name).toBe("Test Goal");
    });

    it("returns 404 if not found", async () => {
      const token = await getAccessToken();
      mockPrisma.goal.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "GET",
        url: `/goals/${VALID_CUID_2}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().message).toBe("Goal not found");
    });

    it("returns 400 for invalid ID format", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "GET",
        url: "/goals/invalid-id",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe("Invalid goal ID format");
    });
  });

  // --- PATCH /goals/:id ---

  describe("PATCH /goals/:id", () => {
    it("updates goal fields (200)", async () => {
      const token = await getAccessToken();
      const row = makeMockGoalRow();
      mockPrisma.goal.update.mockImplementation(
        async (args: { data: Record<string, unknown> }) => ({
          ...row,
          ...args.data,
          updatedAt: new Date(),
        }),
      );

      const res = await app.inject({
        method: "PATCH",
        url: `/goals/${VALID_CUID}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Updated Goal" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.goal.name).toBe("Updated Goal");
    });

    it("returns 404 if not found", async () => {
      const token = await getAccessToken();
      const notFoundError = new Error("Not found") as P2025Error;
      notFoundError.code = "P2025";
      mockPrisma.goal.update.mockRejectedValue(notFoundError);

      const res = await app.inject({
        method: "PATCH",
        url: `/goals/${VALID_CUID_2}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Nope" },
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 400 with empty body", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "PATCH",
        url: `/goals/${VALID_CUID}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 with invalid goal type", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "PATCH",
        url: `/goals/${VALID_CUID}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { type: "bad_type" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("type must be one of");
    });

    it("returns 400 with negative targetAmount", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "PATCH",
        url: `/goals/${VALID_CUID}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { targetAmount: -1 },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("targetAmount must be at least 0");
    });

    it("returns 400 for invalid ID format", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "PATCH",
        url: "/goals/invalid-id",
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Test" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe("Invalid goal ID format");
    });
  });

  // --- DELETE /goals/:id ---

  describe("DELETE /goals/:id", () => {
    it("deletes goal (204)", async () => {
      const token = await getAccessToken();
      mockPrisma.goal.delete.mockResolvedValue({});

      const res = await app.inject({
        method: "DELETE",
        url: `/goals/${VALID_CUID}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(204);
    });

    it("returns 404 if not found", async () => {
      const token = await getAccessToken();
      const notFoundError = new Error("Not found") as P2025Error;
      notFoundError.code = "P2025";
      mockPrisma.goal.delete.mockRejectedValue(notFoundError);

      const res = await app.inject({
        method: "DELETE",
        url: `/goals/${VALID_CUID_2}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 400 for invalid ID format", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "DELETE",
        url: "/goals/invalid-id",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe("Invalid goal ID format");
    });
  });

  // --- PUT /goals/reorder ---

  describe("PUT /goals/reorder", () => {
    it("reorders goals (204)", async () => {
      const token = await getAccessToken();
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);
      mockPrisma.goal.update.mockResolvedValue({});

      const res = await app.inject({
        method: "PUT",
        url: "/goals/reorder",
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
        url: "/goals/reorder",
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // --- CUID validation ---

  describe("CUID ID format validation", () => {
    it("GET /:id returns 400 for invalid ID format", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "GET",
        url: "/goals/invalid-id",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe("Invalid goal ID format");
    });

    it("PATCH /:id returns 400 for invalid ID format", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "PATCH",
        url: "/goals/invalid-id",
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Test" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe("Invalid goal ID format");
    });

    it("DELETE /:id returns 400 for invalid ID format", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "DELETE",
        url: "/goals/invalid-id",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe("Invalid goal ID format");
    });
  });
});
