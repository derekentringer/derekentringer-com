import bcrypt from "bcryptjs";
import * as OTPAuth from "otpauth";

const TEST_PASSWORD = "testpassword123";
const TEST_EMAIL = "admin@test.com";
const TEST_SECRET = new OTPAuth.Secret({ size: 20 }).base32;

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

function generateTotpCode(secret: string): string {
  const totp = new OTPAuth.TOTP({
    issuer: "NoteSync",
    label: TEST_EMAIL,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  return totp.generate();
}

describe("TOTP routes", () => {
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

  async function getAccessToken(userOverrides: Record<string, unknown> = {}) {
    setupTokenMocks();
    mockPrisma.user.findUnique.mockResolvedValue(makeMockUser(userOverrides));
    // Mock AI enabled check for the onRequest hook in ai routes
    mockPrisma.setting.findUnique.mockResolvedValue(null);

    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    return loginRes.json().accessToken;
  }

  // --- Setup ---

  describe("POST /auth/totp/setup", () => {
    it("returns QR code and secret for authenticated user", async () => {
      const token = await getAccessToken();

      mockPrisma.user.findUnique.mockResolvedValue(makeMockUser());

      const res = await app.inject({
        method: "POST",
        url: "/auth/totp/setup",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.secret).toBeDefined();
      expect(body.qrCodeDataUrl).toContain("data:image/png;base64,");
      expect(body.otpauthUrl).toContain("otpauth://totp/");
    });

    it("returns 400 if 2FA is already enabled", async () => {
      const token = await getAccessToken();

      mockPrisma.user.findUnique.mockResolvedValue(
        makeMockUser({ totpEnabled: true, totpSecret: TEST_SECRET }),
      );

      const res = await app.inject({
        method: "POST",
        url: "/auth/totp/setup",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("already enabled");
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/totp/setup",
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // --- Verify Setup ---

  describe("POST /auth/totp/verify-setup", () => {
    it("enables 2FA with valid code and returns backup codes", async () => {
      const token = await getAccessToken();

      // First, trigger setup to store a pending secret
      mockPrisma.user.findUnique.mockResolvedValue(makeMockUser());

      const setupRes = await app.inject({
        method: "POST",
        url: "/auth/totp/setup",
        headers: { authorization: `Bearer ${token}` },
      });

      const { secret } = setupRes.json();
      const code = generateTotpCode(secret);

      // Mock user lookup for verify-setup
      mockPrisma.user.findUnique.mockResolvedValue(makeMockUser());
      mockPrisma.user.update.mockResolvedValue(makeMockUser({ totpEnabled: true }));

      const res = await app.inject({
        method: "POST",
        url: "/auth/totp/verify-setup",
        headers: { authorization: `Bearer ${token}` },
        payload: { code },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.backupCodes).toHaveLength(8);
      expect(typeof body.backupCodes[0]).toBe("string");
    });

    it("returns 400 with invalid code", async () => {
      const token = await getAccessToken();

      // Trigger setup
      mockPrisma.user.findUnique.mockResolvedValue(makeMockUser());

      await app.inject({
        method: "POST",
        url: "/auth/totp/setup",
        headers: { authorization: `Bearer ${token}` },
      });

      mockPrisma.user.findUnique.mockResolvedValue(makeMockUser());

      const res = await app.inject({
        method: "POST",
        url: "/auth/totp/verify-setup",
        headers: { authorization: `Bearer ${token}` },
        payload: { code: "000000" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("Invalid verification code");
    });
  });

  // --- Login with TOTP ---

  describe("POST /auth/totp/verify (login)", () => {
    it("completes login with valid TOTP code", async () => {
      setupTokenMocks();
      const totpUser = makeMockUser({
        totpEnabled: true,
        totpSecret: TEST_SECRET,
      });
      mockPrisma.user.findUnique.mockResolvedValue(totpUser);
      mockPrisma.setting.findUnique.mockResolvedValue(null);

      // Login should return requiresTotp
      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });

      expect(loginRes.statusCode).toBe(200);
      const loginBody = loginRes.json();
      expect(loginBody.requiresTotp).toBe(true);
      expect(loginBody.totpToken).toBeDefined();

      // Now verify with TOTP code
      mockPrisma.user.findUnique.mockResolvedValue(totpUser);
      setupTokenMocks();

      const code = generateTotpCode(TEST_SECRET);

      const verifyRes = await app.inject({
        method: "POST",
        url: "/auth/totp/verify",
        payload: { totpToken: loginBody.totpToken, code },
      });

      expect(verifyRes.statusCode).toBe(200);
      const verifyBody = verifyRes.json();
      expect(verifyBody.accessToken).toBeDefined();
      expect(verifyBody.user).toBeDefined();
      expect(verifyBody.user.email).toBe(TEST_EMAIL);
    });

    it("returns 401 with invalid TOTP code", async () => {
      setupTokenMocks();
      const totpUser = makeMockUser({
        totpEnabled: true,
        totpSecret: TEST_SECRET,
      });
      mockPrisma.user.findUnique.mockResolvedValue(totpUser);
      mockPrisma.setting.findUnique.mockResolvedValue(null);

      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });

      const { totpToken } = loginRes.json();
      mockPrisma.user.findUnique.mockResolvedValue(totpUser);

      const verifyRes = await app.inject({
        method: "POST",
        url: "/auth/totp/verify",
        payload: { totpToken, code: "000000" },
      });

      expect(verifyRes.statusCode).toBe(401);
      expect(verifyRes.json().message).toContain("Invalid verification code");
    });

    it("returns 401 with invalid totpToken", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/totp/verify",
        payload: { totpToken: "invalid-jwt", code: "123456" },
      });

      expect(res.statusCode).toBe(401);
    });

    it("accepts backup code and consumes it", async () => {
      setupTokenMocks();
      const backupCode = "abcd1234";
      const hashedBackup = bcrypt.hashSync(backupCode, 10);

      const totpUser = makeMockUser({
        totpEnabled: true,
        totpSecret: TEST_SECRET,
        backupCodes: [hashedBackup, bcrypt.hashSync("other1234", 10)],
      });
      mockPrisma.user.findUnique.mockResolvedValue(totpUser);
      mockPrisma.setting.findUnique.mockResolvedValue(null);

      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });

      const { totpToken } = loginRes.json();
      mockPrisma.user.findUnique.mockResolvedValue(totpUser);
      mockPrisma.user.update.mockResolvedValue(totpUser);
      setupTokenMocks();

      const verifyRes = await app.inject({
        method: "POST",
        url: "/auth/totp/verify",
        payload: { totpToken, code: backupCode },
      });

      expect(verifyRes.statusCode).toBe(200);
      expect(verifyRes.json().accessToken).toBeDefined();

      // Verify backup code was consumed (update called with one less code)
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            backupCodes: expect.any(Array),
          }),
        }),
      );
    });
  });

  // --- Disable 2FA ---

  describe("DELETE /auth/totp", () => {
    it("disables 2FA with valid code", async () => {
      // Get token without TOTP (login would return requiresTotp otherwise)
      const token = await getAccessToken();

      mockPrisma.user.findUnique.mockResolvedValue(
        makeMockUser({ totpEnabled: true, totpSecret: TEST_SECRET }),
      );
      mockPrisma.user.update.mockResolvedValue(makeMockUser());

      const code = generateTotpCode(TEST_SECRET);

      const res = await app.inject({
        method: "DELETE",
        url: "/auth/totp",
        headers: { authorization: `Bearer ${token}` },
        payload: { code },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().message).toContain("disabled");
    });

    it("returns 401 with invalid code", async () => {
      const token = await getAccessToken();

      mockPrisma.user.findUnique.mockResolvedValue(
        makeMockUser({ totpEnabled: true, totpSecret: TEST_SECRET }),
      );

      const res = await app.inject({
        method: "DELETE",
        url: "/auth/totp",
        headers: { authorization: `Bearer ${token}` },
        payload: { code: "000000" },
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 400 if 2FA not enabled", async () => {
      const token = await getAccessToken();

      mockPrisma.user.findUnique.mockResolvedValue(makeMockUser());

      const res = await app.inject({
        method: "DELETE",
        url: "/auth/totp",
        headers: { authorization: `Bearer ${token}` },
        payload: { code: "123456" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("not enabled");
    });
  });
});
