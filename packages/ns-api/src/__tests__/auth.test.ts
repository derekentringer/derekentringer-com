import bcrypt from "bcryptjs";

const TEST_PASSWORD = "testpassword123";

process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync(TEST_PASSWORD, 10);
process.env.JWT_SECRET = "test-jwt-secret-for-auth-tests-min32chars";
process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret-for-tests-min32";
process.env.CORS_ORIGIN = "http://localhost:3005";

import { describe, it, expect, afterAll, afterEach, vi, beforeAll } from "vitest";
import { createMockPrisma } from "./helpers/mockPrisma.js";
import type { MockPrisma } from "./helpers/mockPrisma.js";

let mockPrisma: MockPrisma;

beforeAll(() => {
  mockPrisma = createMockPrisma();
});

import { buildApp } from "../app.js";

describe("Auth routes", () => {
  const app = buildApp({ disableRateLimit: true });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function setupTokenMocks() {
    mockPrisma.refreshToken.create.mockResolvedValue({});
    mockPrisma.refreshToken.delete.mockResolvedValue({});
    mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
  }

  function setupTokenLookup(token: string, userId: string) {
    mockPrisma.refreshToken.findUnique.mockImplementation(
      async (args: { where: { token: string } }) => {
        if (args.where.token === token) {
          return {
            id: "mock-id",
            token,
            userId,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          };
        }
        return null;
      },
    );
  }

  // --- Login ---

  describe("POST /auth/login", () => {
    it("returns 200, accessToken, and user with valid credentials", async () => {
      setupTokenMocks();

      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { username: "admin", password: TEST_PASSWORD },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.accessToken).toBeDefined();
      expect(body.expiresIn).toBe(900);
      expect(body.user).toBeDefined();
      expect(body.user.id).toBe("admin-001");
      expect(body.user.username).toBe("admin");
    });

    it("sets refreshToken cookie (no body token)", async () => {
      setupTokenMocks();

      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { username: "admin", password: TEST_PASSWORD },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      // ns-api does NOT return refreshToken in body (no mobile support)
      expect(body.refreshToken).toBeUndefined();

      const cookies = res.cookies;
      const refreshCookie = cookies.find(
        (c: { name: string }) => c.name === "refreshToken",
      );
      expect(refreshCookie).toBeDefined();
    });

    it("returns 401 with wrong password", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { username: "admin", password: "wrongpassword" },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.message).toBe("Invalid credentials");
    });

    it("returns 401 with wrong username", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { username: "wronguser", password: TEST_PASSWORD },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.message).toBe("Invalid credentials");
    });

    it("returns 400 with missing body fields", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.message).toContain("required");
    });
  });

  // --- Refresh ---

  describe("POST /auth/refresh", () => {
    it("returns new accessToken with valid refresh cookie", async () => {
      setupTokenMocks();

      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { username: "admin", password: TEST_PASSWORD },
      });

      const cookies = loginRes.cookies;
      const refreshCookie = cookies.find(
        (c: { name: string }) => c.name === "refreshToken",
      );
      expect(refreshCookie).toBeDefined();

      const storedToken = mockPrisma.refreshToken.create.mock.calls[0][0].data.token;
      setupTokenLookup(storedToken, "admin-001");

      const refreshRes = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        cookies: { refreshToken: refreshCookie!.value },
      });

      expect(refreshRes.statusCode).toBe(200);
      const body = refreshRes.json();
      expect(body.accessToken).toBeDefined();
      expect(body.expiresIn).toBe(900);
    });

    it("returns 401 without refresh cookie", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/refresh",
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.message).toBe("No refresh token provided");
    });

    it("returns 401 with invalid refresh cookie", async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        cookies: { refreshToken: "invalid-token" },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.message).toBe("Invalid or expired refresh token");
    });
  });

  // --- Logout ---

  describe("POST /auth/logout", () => {
    it("clears refresh token and returns success", async () => {
      setupTokenMocks();

      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { username: "admin", password: TEST_PASSWORD },
      });

      const { accessToken } = loginRes.json();
      const cookies = loginRes.cookies;
      const refreshCookie = cookies.find(
        (c: { name: string }) => c.name === "refreshToken",
      );

      const logoutRes = await app.inject({
        method: "POST",
        url: "/auth/logout",
        headers: { authorization: `Bearer ${accessToken}` },
        cookies: { refreshToken: refreshCookie!.value },
      });

      expect(logoutRes.statusCode).toBe(200);
      const body = logoutRes.json();
      expect(body.message).toBe("Logged out successfully");
    });

    it("returns 401 without auth token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/logout",
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // --- Revoke All Sessions ---

  describe("POST /auth/sessions/revoke-all", () => {
    it("revokes all sessions and returns count", async () => {
      setupTokenMocks();
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 3 });

      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { username: "admin", password: TEST_PASSWORD },
      });

      const { accessToken } = loginRes.json();

      const res = await app.inject({
        method: "POST",
        url: "/auth/sessions/revoke-all",
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.revokedCount).toBe(3);
      expect(body.message).toContain("3");
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/sessions/revoke-all",
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns count 0 when no sessions exist", async () => {
      setupTokenMocks();
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { username: "admin", password: TEST_PASSWORD },
      });

      const { accessToken } = loginRes.json();

      const res = await app.inject({
        method: "POST",
        url: "/auth/sessions/revoke-all",
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.revokedCount).toBe(0);
    });
  });
});
