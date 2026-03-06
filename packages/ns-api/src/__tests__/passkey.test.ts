import bcrypt from "bcryptjs";

const TEST_PASSWORD = "testpassword123";
const TEST_EMAIL = "admin@test.com";

process.env.JWT_SECRET = "test-jwt-secret-for-auth-tests-min32chars";
process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret-for-tests-min32";
process.env.CORS_ORIGIN = "http://localhost:3005";
process.env.RP_ID = "localhost";
process.env.RP_NAME = "NoteSync";

import { describe, it, expect, afterAll, afterEach, vi, beforeAll } from "vitest";
import { createMockPrisma } from "./helpers/mockPrisma.js";
import type { MockPrisma } from "./helpers/mockPrisma.js";

// Mock @simplewebauthn/server since we can't do real WebAuthn in tests
vi.mock("@simplewebauthn/server", () => ({
  generateRegistrationOptions: vi.fn().mockResolvedValue({
    challenge: "test-challenge-base64url",
    rp: { name: "NoteSync", id: "localhost" },
    user: { id: "dXNlci1pZA", name: "admin@test.com", displayName: "admin@test.com" },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    timeout: 60000,
    attestation: "none",
    excludeCredentials: [],
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  }),
  verifyRegistrationResponse: vi.fn().mockResolvedValue({
    verified: true,
    registrationInfo: {
      fmt: "none",
      aaguid: "00000000-0000-0000-0000-000000000000",
      credential: {
        id: "credential-id-base64url",
        publicKey: new Uint8Array([1, 2, 3, 4]),
        counter: 0,
        transports: ["internal"],
      },
      credentialType: "public-key",
      credentialDeviceType: "multiDevice",
      credentialBackedUp: true,
      attestationObject: new Uint8Array([]),
      userVerified: true,
      origin: "http://localhost:3005",
    },
  }),
  generateAuthenticationOptions: vi.fn().mockResolvedValue({
    challenge: "auth-challenge-base64url",
    rpId: "localhost",
    timeout: 60000,
    userVerification: "preferred",
    allowCredentials: [],
  }),
  verifyAuthenticationResponse: vi.fn().mockResolvedValue({
    verified: true,
    authenticationInfo: {
      credentialID: "credential-id-base64url",
      newCounter: 1,
      userVerified: true,
      credentialDeviceType: "multiDevice",
      credentialBackedUp: true,
      origin: "http://localhost:3005",
      rpID: "localhost",
    },
  }),
}));

let mockPrisma: MockPrisma;

beforeAll(() => {
  mockPrisma = createMockPrisma();
});

import { buildApp } from "../app.js";

describe("Passkey routes", () => {
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

  function makeMockPasskey(overrides: Record<string, unknown> = {}) {
    return {
      id: "passkey-001",
      userId: "admin-001",
      credentialId: "credential-id-base64url",
      publicKey: Buffer.from([1, 2, 3, 4]),
      counter: BigInt(0),
      transports: ["internal"],
      deviceType: "multiDevice",
      backedUp: true,
      friendlyName: "Test Passkey",
      createdAt: new Date(),
      lastUsedAt: null,
      ...overrides,
    };
  }

  async function getAccessToken() {
    setupTokenMocks();
    mockPrisma.user.findUnique.mockResolvedValue(makeMockUser());
    mockPrisma.setting.findUnique.mockResolvedValue(null);

    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    return loginRes.json().accessToken;
  }

  // --- Register Options ---

  describe("POST /auth/passkeys/register-options", () => {
    it("returns registration options for authenticated user", async () => {
      const token = await getAccessToken();

      mockPrisma.user.findUnique.mockResolvedValue(makeMockUser());
      mockPrisma.passkey.findMany.mockResolvedValue([]);

      const res = await app.inject({
        method: "POST",
        url: "/auth/passkeys/register-options",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.challenge).toBeDefined();
      expect(body.rp).toBeDefined();
      expect(body.user).toBeDefined();
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/passkeys/register-options",
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // --- Register Verify ---

  describe("POST /auth/passkeys/register-verify", () => {
    it("registers a passkey with valid credential", async () => {
      const token = await getAccessToken();

      // Trigger register-options first to store challenge
      mockPrisma.user.findUnique.mockResolvedValue(makeMockUser());
      mockPrisma.passkey.findMany.mockResolvedValue([]);

      await app.inject({
        method: "POST",
        url: "/auth/passkeys/register-options",
        headers: { authorization: `Bearer ${token}` },
      });

      // Now verify
      mockPrisma.passkey.create.mockResolvedValue(makeMockPasskey());

      const res = await app.inject({
        method: "POST",
        url: "/auth/passkeys/register-verify",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          credential: {
            id: "credential-id-base64url",
            rawId: "credential-id-base64url",
            response: {
              attestationObject: "test",
              clientDataJSON: "test",
            },
            type: "public-key",
            authenticatorAttachment: "platform",
            clientExtensionResults: {},
          },
          friendlyName: "My MacBook",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBeDefined();
      expect(body.friendlyName).toBe("Test Passkey");
    });

    it("returns 400 without prior registration options", async () => {
      const token = await getAccessToken();

      const res = await app.inject({
        method: "POST",
        url: "/auth/passkeys/register-verify",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          credential: {
            id: "test",
            rawId: "test",
            response: { attestationObject: "test", clientDataJSON: "test" },
            type: "public-key",
            clientExtensionResults: {},
          },
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("expired");
    });
  });

  // --- Login Options ---

  describe("POST /auth/passkeys/login-options", () => {
    it("returns authentication options without email", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/passkeys/login-options",
        payload: {},
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.challenge).toBeDefined();
      expect(body.challengeId).toBeDefined();
    });

    it("returns authentication options with email", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeMockUser());
      mockPrisma.passkey.findMany.mockResolvedValue([makeMockPasskey()]);

      const res = await app.inject({
        method: "POST",
        url: "/auth/passkeys/login-options",
        payload: { email: TEST_EMAIL },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.challenge).toBeDefined();
      expect(body.challengeId).toBeDefined();
    });
  });

  // --- Login Verify ---

  describe("POST /auth/passkeys/login-verify", () => {
    it("completes login with valid passkey (skips TOTP)", async () => {
      // Get login options first
      const optionsRes = await app.inject({
        method: "POST",
        url: "/auth/passkeys/login-options",
        payload: {},
      });

      const { challengeId } = optionsRes.json();

      // Mock passkey lookup and user lookup
      const totpUser = makeMockUser({ totpEnabled: true, totpSecret: "some-secret" });
      mockPrisma.passkey.findUnique.mockResolvedValue(makeMockPasskey());
      mockPrisma.passkey.update.mockResolvedValue(makeMockPasskey({ counter: BigInt(1) }));
      mockPrisma.user.findUnique.mockResolvedValue(totpUser);
      setupTokenMocks();
      mockPrisma.setting.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "POST",
        url: "/auth/passkeys/login-verify",
        payload: {
          challengeId,
          credential: {
            id: "credential-id-base64url",
            rawId: "credential-id-base64url",
            response: {
              authenticatorData: "test",
              clientDataJSON: "test",
              signature: "test",
            },
            type: "public-key",
            authenticatorAttachment: "platform",
            clientExtensionResults: {},
          },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.accessToken).toBeDefined();
      expect(body.user).toBeDefined();
      expect(body.user.email).toBe(TEST_EMAIL);
      // Passkey login skips TOTP — no requiresTotp in response
      expect(body.requiresTotp).toBeUndefined();
    });

    it("returns 401 with unknown credential", async () => {
      const optionsRes = await app.inject({
        method: "POST",
        url: "/auth/passkeys/login-options",
        payload: {},
      });

      const { challengeId } = optionsRes.json();

      mockPrisma.passkey.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "POST",
        url: "/auth/passkeys/login-verify",
        payload: {
          challengeId,
          credential: {
            id: "unknown-credential",
            rawId: "unknown-credential",
            response: {
              authenticatorData: "test",
              clientDataJSON: "test",
              signature: "test",
            },
            type: "public-key",
            clientExtensionResults: {},
          },
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().message).toContain("Unknown credential");
    });

    it("returns 401 with expired challenge", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/passkeys/login-verify",
        payload: {
          challengeId: "nonexistent-challenge",
          credential: {
            id: "test",
            rawId: "test",
            response: {
              authenticatorData: "test",
              clientDataJSON: "test",
              signature: "test",
            },
            type: "public-key",
            clientExtensionResults: {},
          },
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().message).toContain("expired");
    });
  });

  // --- List Passkeys ---

  describe("GET /auth/passkeys", () => {
    it("returns user passkeys", async () => {
      const token = await getAccessToken();

      mockPrisma.passkey.findMany.mockResolvedValue([makeMockPasskey()]);

      const res = await app.inject({
        method: "GET",
        url: "/auth/passkeys",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.passkeys).toHaveLength(1);
      expect(body.passkeys[0].id).toBe("passkey-001");
      expect(body.passkeys[0].friendlyName).toBe("Test Passkey");
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/auth/passkeys",
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // --- Delete Passkey ---

  describe("DELETE /auth/passkeys/:id", () => {
    it("deletes a passkey", async () => {
      const token = await getAccessToken();

      mockPrisma.passkey.findUnique.mockResolvedValue(makeMockPasskey());
      mockPrisma.passkey.delete.mockResolvedValue(makeMockPasskey());

      const res = await app.inject({
        method: "DELETE",
        url: "/auth/passkeys/passkey-001",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().message).toContain("deleted");
    });

    it("returns 404 for nonexistent passkey", async () => {
      const token = await getAccessToken();

      mockPrisma.passkey.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "DELETE",
        url: "/auth/passkeys/nonexistent",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 404 for passkey owned by another user", async () => {
      const token = await getAccessToken();

      mockPrisma.passkey.findUnique.mockResolvedValue(
        makeMockPasskey({ userId: "other-user" }),
      );

      const res = await app.inject({
        method: "DELETE",
        url: "/auth/passkeys/passkey-001",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
