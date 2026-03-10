import bcrypt from "bcryptjs";

const TEST_PASSWORD = "testpassword123";
const TEST_EMAIL = "admin@test.com";

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
    mockPrisma.refreshToken.update.mockResolvedValue({});
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

  function makeMockUser(overrides: Record<string, unknown> = {}) {
    return {
      id: "admin-001",
      email: TEST_EMAIL,
      displayName: null,
      role: "admin",
      passwordHash: bcrypt.hashSync(TEST_PASSWORD, 10),
      totpEnabled: false,
      totpSecret: null,
      backupCodes: [],
      mustChangePassword: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  // --- Login ---

  describe("POST /auth/login", () => {
    it("returns 200, accessToken, and user with valid credentials", async () => {
      setupTokenMocks();
      mockPrisma.user.findUnique.mockResolvedValue(makeMockUser());

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
      expect(body.user.id).toBe("admin-001");
      expect(body.user.email).toBe(TEST_EMAIL);
      expect(body.user.role).toBe("admin");
    });

    it("sets refreshToken cookie and includes refreshToken in body", async () => {
      setupTokenMocks();
      mockPrisma.user.findUnique.mockResolvedValue(makeMockUser());

      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.refreshToken).toBeDefined();

      const cookies = res.cookies;
      const refreshCookie = cookies.find(
        (c: { name: string }) => c.name === "refreshToken",
      );
      expect(refreshCookie).toBeDefined();
    });

    it("returns 401 with wrong password", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeMockUser());

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
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "wrong@test.com", password: TEST_PASSWORD },
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
      mockPrisma.user.findUnique.mockResolvedValue(makeMockUser());

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

      const storedToken = mockPrisma.refreshToken.create.mock.calls[0][0].data.token;
      setupTokenLookup(storedToken, "admin-001");

      const refreshRes = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        headers: { "x-requested-with": "XMLHttpRequest" },
        cookies: { refreshToken: refreshCookie!.value },
      });

      expect(refreshRes.statusCode).toBe(200);
      const body = refreshRes.json();
      expect(body.accessToken).toBeDefined();
      expect(body.expiresIn).toBe(900);
    });

    it("returns 403 without X-Requested-With header", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        cookies: { refreshToken: "some-token" },
      });

      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.message).toBe("Missing required header");
    });

    it("returns 401 without refresh cookie", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        headers: { "x-requested-with": "XMLHttpRequest" },
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
        headers: { "x-requested-with": "XMLHttpRequest" },
        cookies: { refreshToken: "invalid-token" },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.message).toBe("Invalid or expired refresh token");
    });

    it("returns 401 and revokes all sessions on token reuse", async () => {
      setupTokenMocks();
      mockPrisma.user.findUnique.mockResolvedValue(makeMockUser());

      // Simulate a revoked token (reuse detection)
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: "mock-id",
        token: "hashed-token",
        userId: "admin-001",
        revoked: true,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const res = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        headers: { "x-requested-with": "XMLHttpRequest" },
        cookies: { refreshToken: "stolen-token" },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.message).toBe("Token reuse detected");
      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: "admin-001" },
      });
    });
  });

  // --- GET /auth/me ---

  describe("GET /auth/me", () => {
    it("returns user profile with valid auth", async () => {
      setupTokenMocks();
      mockPrisma.user.findUnique.mockResolvedValue(makeMockUser());

      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });

      const { accessToken } = loginRes.json();

      const res = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.user.email).toBe(TEST_EMAIL);
      expect(body.user.role).toBe("admin");
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/auth/me",
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // --- Logout ---

  describe("POST /auth/logout", () => {
    it("clears refresh token and returns success", async () => {
      setupTokenMocks();
      mockPrisma.user.findUnique.mockResolvedValue(makeMockUser());

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
  });

  // --- Revoke All Sessions ---

  describe("POST /auth/sessions/revoke-all", () => {
    it("revokes all sessions and returns count", async () => {
      setupTokenMocks();
      mockPrisma.user.findUnique.mockResolvedValue(makeMockUser());
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
      mockPrisma.user.findUnique.mockResolvedValue(makeMockUser());
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
