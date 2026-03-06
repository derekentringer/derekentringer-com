import bcrypt from "bcryptjs";
import crypto from "crypto";

const TEST_PASSWORD = "testpassword123";

process.env.JWT_SECRET = "test-jwt-secret-for-auth-tests-min32chars";
process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret-for-tests-min32";
process.env.CORS_ORIGIN = "http://localhost:3003";
process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");

import { describe, it, expect, afterAll, afterEach, vi, beforeAll } from "vitest";
import { createMockPrisma } from "./helpers/mockPrisma.js";
import type { MockPrisma } from "./helpers/mockPrisma.js";

// Set up mock Prisma before importing app
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

  const TEST_USER_ID = "test-user-1";
  const TEST_EMAIL = "admin@test.com";
  const TEST_PASSWORD_HASH = bcrypt.hashSync(TEST_PASSWORD, 10);

  function setupUserMock() {
    mockPrisma.user.findUnique.mockImplementation(
      async (args: { where: { email?: string; id?: string } }) => {
        if (args.where.email === TEST_EMAIL || args.where.id === TEST_USER_ID) {
          return {
            id: TEST_USER_ID,
            email: TEST_EMAIL,
            passwordHash: TEST_PASSWORD_HASH,
            displayName: "Test Admin",
            role: "admin",
            totpEnabled: false,
            totpSecret: null,
            backupCodes: "[]",
            mustChangePassword: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }
        return null;
      },
    );
  }

  // Helper: set up mock to accept token store operations
  function setupTokenMocks() {
    setupUserMock();
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
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.accessToken).toBeDefined();
      expect(body.expiresIn).toBe(900);
      expect(body.user).toBeDefined();
      expect(body.user.id).toBeDefined();
      expect(body.user.email).toBe(TEST_EMAIL);
    });

    it("returns 401 with wrong password", async () => {
      setupUserMock();

      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: TEST_EMAIL, password: "wrongpassword" },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.message).toBe("Invalid credentials");
    });

    it("returns 401 with wrong email", async () => {
      setupUserMock();

      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "wronguser", password: TEST_PASSWORD },
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

    it("returns refreshToken in body for mobile clients", async () => {
      setupTokenMocks();

      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "x-client-type": "mobile" },
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();
      expect(typeof body.refreshToken).toBe("string");
      expect(body.refreshToken.length).toBeGreaterThan(0);
    });

    it("does NOT return refreshToken in body for web clients", async () => {
      setupTokenMocks();

      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.refreshToken).toBeUndefined();
    });
  });

  // --- Refresh ---

  describe("POST /auth/refresh", () => {
    it("returns new accessToken with valid refresh cookie", async () => {
      setupTokenMocks();

      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });

      const cookies = loginRes.cookies;
      const refreshCookie = cookies.find(
        (c: { name: string }) => c.name === "refreshToken",
      );
      expect(refreshCookie).toBeDefined();

      // Set up lookup for the stored token
      const storedToken = mockPrisma.refreshToken.create.mock.calls[0][0].data.token;
      setupTokenLookup(storedToken, TEST_USER_ID);

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

    it("accepts refreshToken in body for mobile clients", async () => {
      setupTokenMocks();

      // Login as mobile to get refreshToken in body
      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "x-client-type": "mobile" },
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });

      const { refreshToken } = loginRes.json();
      expect(refreshToken).toBeDefined();

      // Set up lookup using the hashed token stored in the mock
      // (storeRefreshToken hashes tokens before persisting)
      const storedHash = mockPrisma.refreshToken.create.mock.calls[0][0].data.token;
      setupTokenLookup(storedHash, TEST_USER_ID);

      const refreshRes = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        headers: { "x-client-type": "mobile" },
        payload: { refreshToken },
      });

      expect(refreshRes.statusCode).toBe(200);
      const body = refreshRes.json();
      expect(body.accessToken).toBeDefined();
      expect(body.expiresIn).toBe(900);
      expect(body.refreshToken).toBeDefined();
    });
  });

  // --- Logout ---

  describe("POST /auth/logout", () => {
    it("clears refresh token and returns success", async () => {
      setupTokenMocks();

      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
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

    it("accepts refreshToken in body for mobile clients", async () => {
      setupTokenMocks();

      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "x-client-type": "mobile" },
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });

      const { accessToken, refreshToken } = loginRes.json();

      const logoutRes = await app.inject({
        method: "POST",
        url: "/auth/logout",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "x-client-type": "mobile",
        },
        payload: { refreshToken },
      });

      expect(logoutRes.statusCode).toBe(200);
      const body = logoutRes.json();
      expect(body.message).toBe("Logged out successfully");
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
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
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
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
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
