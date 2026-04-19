import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  getIntegrationPrisma,
  resetDb,
  disconnectIntegrationPrisma,
} from "./helpers/db.js";
import {
  createTestUser,
  createTestDevice,
  authHeaderFor,
  authHeaderForId,
} from "./helpers/users.js";

/**
 * Exercises the user/device/auth helpers end-to-end:
 *   - real user row inserted
 *   - JWT signed with the app's secret
 *   - an auth-required endpoint accepts the token
 *   - deviceId allocation + optional cursor seeding
 */

describe("integration helpers", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    getIntegrationPrisma();
    const { buildApp } = await import("../../app.js");
    app = buildApp({ disableRateLimit: true });
  });

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await app.close();
    await disconnectIntegrationPrisma();
  });

  it("createTestUser inserts a real user with bcrypt hash", async () => {
    const user = await createTestUser({ email: "alice@test.local" });
    expect(user.email).toBe("alice@test.local");
    expect(user.passwordHash).not.toBe("test-password-123");
    expect(user.passwordHash.length).toBeGreaterThan(20);
    expect(user.role).toBe("user");
  });

  it("createTestUser defaults produce unique emails", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    expect(a.email).not.toBe(b.email);
  });

  it("authHeaderFor signs a token the app accepts", async () => {
    const user = await createTestUser();
    const res = await app.inject({
      method: "POST",
      url: "/sync/pull",
      headers: authHeaderFor(user),
      payload: { deviceId: "device-a", since: new Date(0).toISOString() },
    });
    expect(res.statusCode).toBe(200);
  });

  it("authHeaderForId works without a full user row", async () => {
    const user = await createTestUser();
    const res = await app.inject({
      method: "POST",
      url: "/sync/pull",
      headers: authHeaderForId(user.id),
      payload: { deviceId: "device-b", since: new Date(0).toISOString() },
    });
    expect(res.statusCode).toBe(200);
  });

  it("missing auth returns 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sync/pull",
      payload: { deviceId: "device-c", since: new Date(0).toISOString() },
    });
    expect(res.statusCode).toBe(401);
  });

  it("createTestDevice allocates a unique deviceId", async () => {
    const user = await createTestUser();
    const a = await createTestDevice(user.id);
    const b = await createTestDevice(user.id);
    expect(a.deviceId).not.toBe(b.deviceId);
  });

  it("createTestDevice with lastSyncedAt seeds a SyncCursor row", async () => {
    const user = await createTestUser();
    const when = new Date("2026-01-15T12:00:00Z");
    const { deviceId } = await createTestDevice(user.id, { lastSyncedAt: when });

    const prisma = getIntegrationPrisma();
    const cursor = await prisma.syncCursor.findUnique({
      where: { userId_deviceId: { userId: user.id, deviceId } },
    });
    expect(cursor).not.toBeNull();
    expect(cursor?.lastSyncedAt.toISOString()).toBe(when.toISOString());
  });

  it("different users get isolated auth scopes", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();

    // Both should be able to pull their own sync state
    const a = await app.inject({
      method: "POST",
      url: "/sync/pull",
      headers: authHeaderFor(alice),
      payload: { deviceId: "dev", since: new Date(0).toISOString() },
    });
    const b = await app.inject({
      method: "POST",
      url: "/sync/pull",
      headers: authHeaderFor(bob),
      payload: { deviceId: "dev", since: new Date(0).toISOString() },
    });

    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
  });
});
