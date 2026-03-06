import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const TEST_EMAIL = "admin@test.com";
const TEST_PASSWORD = "testpassword123";

process.env.JWT_SECRET = "test-jwt-secret-for-auth-tests-min32chars";
process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret-for-tests-min32";
process.env.CORS_ORIGIN = "http://localhost:3005";

import { describe, it, expect, afterAll, afterEach, vi, beforeAll } from "vitest";
import { createMockPrisma } from "./helpers/mockPrisma.js";
import type { MockPrisma } from "./helpers/mockPrisma.js";

// Mock the email service so it doesn't try to use Resend
vi.mock("../services/emailService.js", () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));

let mockPrisma: MockPrisma;

beforeAll(() => {
  mockPrisma = createMockPrisma();
});

import { buildApp } from "../app.js";
import { sendPasswordResetEmail } from "../services/emailService.js";

describe("Password reset routes", () => {
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

  // --- Forgot Password ---

  describe("POST /auth/forgot-password", () => {
    it("returns 200 and sends email for existing user", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeMockUser());
      mockPrisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.passwordResetToken.create.mockResolvedValue({
        id: "token-1",
        token: "hashed-token",
        userId: "admin-001",
        expiresAt: new Date(Date.now() + 3600000),
        createdAt: new Date(),
      });

      const res = await app.inject({
        method: "POST",
        url: "/auth/forgot-password",
        payload: { email: TEST_EMAIL },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.message).toContain("reset link has been sent");
      expect(sendPasswordResetEmail).toHaveBeenCalledOnce();
    });

    it("returns 200 even for non-existent email (prevents enumeration)", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "POST",
        url: "/auth/forgot-password",
        payload: { email: "nobody@test.com" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.message).toContain("reset link has been sent");
      expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it("returns 400 with invalid email format", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/forgot-password",
        payload: { email: "not-an-email" },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // --- Reset Password ---

  describe("POST /auth/reset-password", () => {
    it("resets password with valid token", async () => {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

      mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "token-1",
        token: hashedToken,
        userId: "admin-001",
        expiresAt: new Date(Date.now() + 3600000),
        createdAt: new Date(),
      });
      mockPrisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.user.update.mockResolvedValue(makeMockUser());
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

      const res = await app.inject({
        method: "POST",
        url: "/auth/reset-password",
        payload: { token: rawToken, newPassword: "NewStr0ng!Pass" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.message).toContain("reset successfully");
    });

    it("returns 400 with invalid token", async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "POST",
        url: "/auth/reset-password",
        payload: { token: "invalid-token", newPassword: "NewStr0ng!Pass" },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.message).toContain("Invalid or expired");
    });

    it("returns 400 with expired token", async () => {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

      mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "token-1",
        token: hashedToken,
        userId: "admin-001",
        expiresAt: new Date(Date.now() - 1000), // Expired
        createdAt: new Date(),
      });
      mockPrisma.passwordResetToken.delete.mockResolvedValue({});

      const res = await app.inject({
        method: "POST",
        url: "/auth/reset-password",
        payload: { token: rawToken, newPassword: "NewStr0ng!Pass" },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.message).toContain("Invalid or expired");
    });

    it("returns 400 with weak new password", async () => {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

      mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "token-1",
        token: hashedToken,
        userId: "admin-001",
        expiresAt: new Date(Date.now() + 3600000),
        createdAt: new Date(),
      });

      const res = await app.inject({
        method: "POST",
        url: "/auth/reset-password",
        payload: { token: rawToken, newPassword: "weak" },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.message).toContain("Password must");
    });

    it("revokes all refresh tokens after password reset", async () => {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

      mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "token-1",
        token: hashedToken,
        userId: "admin-001",
        expiresAt: new Date(Date.now() + 3600000),
        createdAt: new Date(),
      });
      mockPrisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.user.update.mockResolvedValue(makeMockUser());
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 2 });

      const res = await app.inject({
        method: "POST",
        url: "/auth/reset-password",
        payload: { token: rawToken, newPassword: "NewStr0ng!Pass" },
      });

      expect(res.statusCode).toBe(200);
      // Verify refresh tokens were deleted (called for the userId)
      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: "admin-001" },
      });
    });
  });

  // --- Change Password ---

  describe("POST /auth/change-password", () => {
    it("changes password with valid current password", async () => {
      setupTokenMocks();
      const user = makeMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.user.update.mockResolvedValue(user);

      // First login to get an access token
      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });
      const { accessToken } = loginRes.json();

      // Reset mocks for the change-password call
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.user.update.mockResolvedValue(user);
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

      const res = await app.inject({
        method: "POST",
        url: "/auth/change-password",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          currentPassword: TEST_PASSWORD,
          newPassword: "NewStr0ng!Pass",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.message).toContain("changed successfully");
    });

    it("returns 401 with incorrect current password", async () => {
      setupTokenMocks();
      const user = makeMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(user);

      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });
      const { accessToken } = loginRes.json();

      mockPrisma.user.findUnique.mockResolvedValue(user);

      const res = await app.inject({
        method: "POST",
        url: "/auth/change-password",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          currentPassword: "wrongpassword",
          newPassword: "NewStr0ng!Pass",
        },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.message).toContain("Current password is incorrect");
    });

    it("returns 400 with weak new password", async () => {
      setupTokenMocks();
      const user = makeMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(user);

      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });
      const { accessToken } = loginRes.json();

      mockPrisma.user.findUnique.mockResolvedValue(user);

      const res = await app.inject({
        method: "POST",
        url: "/auth/change-password",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          currentPassword: TEST_PASSWORD,
          newPassword: "weak",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.message).toContain("Password must");
    });

    it("returns 401 without authentication", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/change-password",
        payload: {
          currentPassword: TEST_PASSWORD,
          newPassword: "NewStr0ng!Pass",
        },
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
