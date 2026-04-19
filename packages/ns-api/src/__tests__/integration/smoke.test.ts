import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { getIntegrationPrisma, resetDb, disconnectIntegrationPrisma } from "./helpers/db.js";
import type { FastifyInstance } from "fastify";

/**
 * Smoke test — proves the integration harness is correctly wired:
 *   - testcontainer started
 *   - pgvector extension + migrations applied
 *   - real Prisma connects to the container
 *   - app boots against the real DB
 *   - TRUNCATE-based reset works between tests
 *
 * When this test passes, the harness is ready for Phase 0.2+.
 */

describe("integration harness smoke", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Build app AFTER globalSetup has populated DATABASE_URL
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

  it("health endpoint responds", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
  });

  it("real Prisma can insert + read a user", async () => {
    const prisma = getIntegrationPrisma();
    await prisma.user.create({
      data: {
        email: "smoke@test.local",
        passwordHash: "not-a-real-hash",
      },
    });

    const found = await prisma.user.findUnique({
      where: { email: "smoke@test.local" },
    });
    expect(found).not.toBeNull();
    expect(found?.email).toBe("smoke@test.local");
  });

  it("reset wipes state between tests", async () => {
    const prisma = getIntegrationPrisma();
    const count = await prisma.user.count();
    expect(count).toBe(0);
  });

  it("pgvector extension is loaded", async () => {
    const prisma = getIntegrationPrisma();
    const rows = await prisma.$queryRawUnsafe<{ extname: string }[]>(
      "SELECT extname FROM pg_extension WHERE extname = 'vector'",
    );
    expect(rows).toHaveLength(1);
  });
});
