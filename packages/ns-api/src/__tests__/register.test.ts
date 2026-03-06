import bcrypt from "bcryptjs";

const TEST_EMAIL = "newuser@test.com";
const TEST_PASSWORD = "StrongP@ss1";

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

describe("Registration routes", () => {
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

  function makeMockUser(overrides: Record<string, unknown> = {}) {
    return {
      id: "user-001",
      email: TEST_EMAIL,
      displayName: null,
      role: "user",
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

  describe("POST /auth/register", () => {
    it("registers a new user with an approved email", async () => {
      setupTokenMocks();
      // Approved emails setting
      mockPrisma.setting.findUnique.mockResolvedValue({
        key: "approvedEmails",
        value: "newuser@test.com, other@test.com",
      });
      // No existing user
      mockPrisma.user.findUnique.mockResolvedValue(null);
      // Create user returns the new user
      mockPrisma.user.create.mockResolvedValue(makeMockUser());

      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.accessToken).toBeDefined();
      expect(body.expiresIn).toBe(900);
      expect(body.user).toBeDefined();
      expect(body.user.email).toBe(TEST_EMAIL);
    });

    it("registers with optional displayName", async () => {
      setupTokenMocks();
      mockPrisma.setting.findUnique.mockResolvedValue({
        key: "approvedEmails",
        value: "newuser@test.com",
      });
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(
        makeMockUser({ displayName: "Test User" }),
      );

      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
          displayName: "Test User",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.user.displayName).toBe("Test User");
    });

    it("returns 403 when no approved emails are configured", async () => {
      mockPrisma.setting.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });

      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.message).toContain("not currently open");
    });

    it("returns 403 when email is not in approved list", async () => {
      mockPrisma.setting.findUnique.mockResolvedValue({
        key: "approvedEmails",
        value: "other@test.com, another@test.com",
      });

      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });

      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.message).toContain("not approved");
    });

    it("returns 400 with weak password", async () => {
      mockPrisma.setting.findUnique.mockResolvedValue({
        key: "approvedEmails",
        value: "newuser@test.com",
      });

      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email: TEST_EMAIL, password: "weak" },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.message).toContain("Password must");
    });

    it("returns 409 when email already exists", async () => {
      mockPrisma.setting.findUnique.mockResolvedValue({
        key: "approvedEmails",
        value: "newuser@test.com",
      });
      mockPrisma.user.findUnique.mockResolvedValue(makeMockUser());

      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });

      expect(res.statusCode).toBe(409);
      const body = res.json();
      expect(body.message).toContain("already exists");
    });

    it("returns 400 with invalid email format", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email: "not-an-email", password: TEST_PASSWORD },
      });

      expect(res.statusCode).toBe(400);
    });

    it("is case-insensitive for approved email matching", async () => {
      setupTokenMocks();
      mockPrisma.setting.findUnique.mockResolvedValue({
        key: "approvedEmails",
        value: "NewUser@Test.com",
      });
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(makeMockUser());

      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email: "newuser@test.com", password: TEST_PASSWORD },
      });

      expect(res.statusCode).toBe(201);
    });

    it("sets refreshToken cookie on successful registration", async () => {
      setupTokenMocks();
      mockPrisma.setting.findUnique.mockResolvedValue({
        key: "approvedEmails",
        value: "newuser@test.com",
      });
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(makeMockUser());

      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });

      expect(res.statusCode).toBe(201);
      const cookies = res.cookies;
      const refreshCookie = cookies.find(
        (c: { name: string }) => c.name === "refreshToken",
      );
      expect(refreshCookie).toBeDefined();
    });
  });
});
