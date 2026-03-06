import bcrypt from "bcryptjs";

const TEST_PASSWORD = "testpassword123";
const TEST_EMAIL = "admin@test.com";
const USER_EMAIL = "user@test.com";

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

describe("Admin routes", () => {
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

  function makeMockRegularUser(overrides: Record<string, unknown> = {}) {
    return {
      id: "user-002",
      email: USER_EMAIL,
      displayName: "Test User",
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

  async function getAdminToken() {
    setupTokenMocks();
    mockPrisma.user.findUnique.mockResolvedValue(makeMockUser());

    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    return loginRes.json().accessToken;
  }

  async function getUserToken() {
    setupTokenMocks();
    mockPrisma.user.findUnique.mockResolvedValue(makeMockRegularUser());

    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: USER_EMAIL, password: TEST_PASSWORD },
    });
    return loginRes.json().accessToken;
  }

  // --- Authorization ---

  describe("Authorization", () => {
    it("returns 403 for non-admin users on all admin routes", async () => {
      const token = await getUserToken();

      const routes = [
        { method: "GET" as const, url: "/admin/users" },
        { method: "GET" as const, url: "/admin/approved-emails" },
        { method: "GET" as const, url: "/admin/ai-settings" },
      ];

      for (const route of routes) {
        const res = await app.inject({
          method: route.method,
          url: route.url,
          headers: { authorization: `Bearer ${token}` },
        });
        expect(res.statusCode).toBe(403);
      }
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/admin/users",
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // --- User Management ---

  describe("GET /admin/users", () => {
    it("returns list of users for admin", async () => {
      const token = await getAdminToken();

      mockPrisma.user.findMany.mockResolvedValue([
        makeMockUser(),
        makeMockRegularUser(),
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/admin/users",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.users).toHaveLength(2);
      expect(body.users[0].email).toBe(TEST_EMAIL);
      expect(body.users[1].email).toBe(USER_EMAIL);
    });
  });

  describe("POST /admin/users/:id/reset-password", () => {
    it("resets user password and sets mustChangePassword", async () => {
      const token = await getAdminToken();

      mockPrisma.user.findUnique.mockResolvedValue(makeMockRegularUser());
      mockPrisma.user.update.mockResolvedValue(makeMockRegularUser());
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

      const res = await app.inject({
        method: "POST",
        url: "/admin/users/user-002/reset-password",
        headers: { authorization: `Bearer ${token}` },
        payload: { newPassword: "NewP@ss123" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.message).toContain("reset successfully");

      // Verify mustChangePassword was set
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "user-002" },
          data: expect.objectContaining({ mustChangePassword: true }),
        }),
      );
    });

    it("returns 404 for non-existent user", async () => {
      const token = await getAdminToken();

      mockPrisma.user.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "POST",
        url: "/admin/users/nonexistent/reset-password",
        headers: { authorization: `Bearer ${token}` },
        payload: { newPassword: "NewP@ss123" },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("DELETE /admin/users/:id", () => {
    it("deletes a user", async () => {
      const token = await getAdminToken();

      mockPrisma.user.delete.mockResolvedValue(makeMockRegularUser());

      const res = await app.inject({
        method: "DELETE",
        url: "/admin/users/user-002",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.message).toContain("deleted successfully");
    });

    it("prevents self-deletion", async () => {
      const token = await getAdminToken();

      const res = await app.inject({
        method: "DELETE",
        url: "/admin/users/admin-001",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.message).toContain("Cannot delete your own account");
    });

    it("returns 404 for non-existent user", async () => {
      const token = await getAdminToken();

      mockPrisma.user.delete.mockRejectedValue(new Error("not found"));

      const res = await app.inject({
        method: "DELETE",
        url: "/admin/users/nonexistent",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // --- Approved Emails ---

  describe("GET /admin/approved-emails", () => {
    it("returns approved emails list", async () => {
      const token = await getAdminToken();

      mockPrisma.setting.findUnique.mockResolvedValue({
        id: "approvedEmails",
        value: "user1@test.com,user2@test.com",
      });

      const res = await app.inject({
        method: "GET",
        url: "/admin/approved-emails",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.emails).toEqual(["user1@test.com", "user2@test.com"]);
    });

    it("returns empty array when no setting exists", async () => {
      const token = await getAdminToken();

      mockPrisma.setting.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "GET",
        url: "/admin/approved-emails",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.emails).toEqual([]);
    });
  });

  describe("PUT /admin/approved-emails", () => {
    it("updates approved emails", async () => {
      const token = await getAdminToken();

      mockPrisma.setting.upsert.mockResolvedValue({
        id: "approvedEmails",
        value: "new@test.com,another@test.com",
      });

      const res = await app.inject({
        method: "PUT",
        url: "/admin/approved-emails",
        headers: { authorization: `Bearer ${token}` },
        payload: { emails: ["new@test.com", "another@test.com"] },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.emails).toContain("new@test.com");
      expect(body.emails).toContain("another@test.com");
    });
  });

  // --- AI Settings ---

  describe("GET /admin/ai-settings", () => {
    it("returns aiEnabled true by default", async () => {
      const token = await getAdminToken();

      mockPrisma.setting.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "GET",
        url: "/admin/ai-settings",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.aiEnabled).toBe(true);
    });

    it("returns aiEnabled false when set", async () => {
      const token = await getAdminToken();

      mockPrisma.setting.findUnique.mockResolvedValue({
        id: "aiEnabled",
        value: "false",
      });

      const res = await app.inject({
        method: "GET",
        url: "/admin/ai-settings",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.aiEnabled).toBe(false);
    });
  });

  describe("PUT /admin/ai-settings", () => {
    it("toggles AI settings", async () => {
      const token = await getAdminToken();

      mockPrisma.setting.upsert.mockResolvedValue({
        id: "aiEnabled",
        value: "false",
      });

      const res = await app.inject({
        method: "PUT",
        url: "/admin/ai-settings",
        headers: { authorization: `Bearer ${token}` },
        payload: { aiEnabled: false },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.aiEnabled).toBe(false);
    });
  });
});
