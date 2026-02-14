import bcrypt from "bcryptjs";

const TEST_PASSWORD = "testpassword123";
const TEST_PIN = "1234";

process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync(TEST_PASSWORD, 10);
process.env.JWT_SECRET = "test-jwt-secret-for-auth-tests-min32chars";
process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret-for-tests-min32";
process.env.PIN_HASH = bcrypt.hashSync(TEST_PIN, 10);
process.env.CORS_ORIGIN = "http://localhost:3003";

import { describe, it, expect, afterAll, afterEach } from "vitest";
import { buildApp } from "../app.js";
import { clearStore } from "../store/refreshTokenStore.js";

describe("Auth routes", () => {
  const app = buildApp({ disableRateLimit: true });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    clearStore();
  });

  // --- Login ---

  describe("POST /auth/login", () => {
    it("returns 200, accessToken, and user with valid credentials", async () => {
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
      expect(body.user.id).toBeDefined();
      expect(body.user.username).toBe("admin");
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
      expect(body.message).toBe("Username and password are required");
    });
  });

  // --- Refresh ---

  describe("POST /auth/refresh", () => {
    it("returns new accessToken with valid refresh cookie", async () => {
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

    it("rotates refresh token so old cookie cannot be reused", async () => {
      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { username: "admin", password: TEST_PASSWORD },
      });

      const cookies = loginRes.cookies;
      const refreshCookie = cookies.find(
        (c: { name: string }) => c.name === "refreshToken",
      );

      // First refresh succeeds
      const refreshRes1 = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        cookies: { refreshToken: refreshCookie!.value },
      });
      expect(refreshRes1.statusCode).toBe(200);

      // Second refresh with same old cookie fails
      const refreshRes2 = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        cookies: { refreshToken: refreshCookie!.value },
      });
      expect(refreshRes2.statusCode).toBe(401);
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
  });

  // --- Logout ---

  describe("POST /auth/logout", () => {
    it("clears refresh token and returns success", async () => {
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

      // Refresh with the old token should now fail
      const refreshRes = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        cookies: { refreshToken: refreshCookie!.value },
      });
      expect(refreshRes.statusCode).toBe(401);
    });

    it("returns 401 without auth token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/logout",
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // --- PIN Verify ---

  describe("POST /auth/pin/verify", () => {
    it("returns pinToken with valid PIN", async () => {
      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { username: "admin", password: TEST_PASSWORD },
      });

      const { accessToken } = loginRes.json();

      const pinRes = await app.inject({
        method: "POST",
        url: "/auth/pin/verify",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { pin: TEST_PIN },
      });

      expect(pinRes.statusCode).toBe(200);
      const body = pinRes.json();
      expect(body.pinToken).toBeDefined();
      expect(body.expiresIn).toBe(300);
    });

    it("returns 401 with wrong PIN", async () => {
      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { username: "admin", password: TEST_PASSWORD },
      });

      const { accessToken } = loginRes.json();

      const pinRes = await app.inject({
        method: "POST",
        url: "/auth/pin/verify",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { pin: "0000" },
      });

      expect(pinRes.statusCode).toBe(401);
      const body = pinRes.json();
      expect(body.message).toBe("Invalid PIN");
    });

    it("returns 401 without auth token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/pin/verify",
        payload: { pin: TEST_PIN },
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
