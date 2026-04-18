import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Integration test harness setup.
 *
 * Two modes:
 *
 * 1. `TEST_DATABASE_URL` is set → use that DB directly.
 *    - No container is started.
 *    - Migrations are assumed already applied (caller's responsibility).
 *    - Intended for CI with a service-container Postgres and for local dev
 *      that has its own Postgres (e.g. a `notesync_test` database).
 *    - Caller must ensure pgvector extension exists and schema is migrated.
 *
 * 2. `TEST_DATABASE_URL` is not set → spin an ephemeral pgvector container.
 *    - Uses the `pgvector/pgvector:pg16` image.
 *    - Migrations are applied on startup from `prisma/migrations/*`.
 *    - Requires a container runtime (Docker Desktop, OrbStack, Colima, ...).
 *    - Intended for local dev once a runtime is installed.
 *
 * Teardown stops the container if one was started; otherwise is a no-op.
 */

declare global {
  // eslint-disable-next-line no-var
  var __NS_TEST_CONTAINER__: StartedPostgreSqlContainer | undefined;
}

function setSharedTestEnv(): void {
  process.env.JWT_SECRET ||= "test-jwt-secret-for-integration-tests-min32chars";
  process.env.REFRESH_TOKEN_SECRET ||= "test-refresh-secret-for-integration-min32";
  process.env.CORS_ORIGIN ||= "http://localhost:3005";
  process.env.NODE_ENV ||= "test";
}

async function applyMigrations(connectionString: string): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector");

    const migrationsDir = join(__dirname, "..", "..", "..", "prisma", "migrations");
    const migrationDirs = readdirSync(migrationsDir)
      .filter((n) => /^\d/.test(n))
      .sort();

    for (const dir of migrationDirs) {
      const sqlPath = join(migrationsDir, dir, "migration.sql");
      const sql = readFileSync(sqlPath, "utf-8");
      await client.query(sql);
    }
  } finally {
    await client.end();
  }
}

export async function setup(): Promise<void> {
  setSharedTestEnv();

  const providedUrl = process.env.TEST_DATABASE_URL;
  if (providedUrl) {
    process.env.DATABASE_URL = providedUrl;
    // eslint-disable-next-line no-console
    console.log(`[integration] Using TEST_DATABASE_URL (no container). Assuming migrations are applied.`);
    return;
  }

  // eslint-disable-next-line no-console
  console.log("[integration] Starting pgvector testcontainer...");

  const container = await new PostgreSqlContainer("pgvector/pgvector:pg16")
    .withDatabase("notesync_test")
    .withUsername("test")
    .withPassword("test")
    .start();

  const url = container.getConnectionUri();
  process.env.DATABASE_URL = url;
  globalThis.__NS_TEST_CONTAINER__ = container;

  // eslint-disable-next-line no-console
  console.log("[integration] Applying migrations...");
  await applyMigrations(url);
  // eslint-disable-next-line no-console
  console.log("[integration] Harness ready.");
}

export async function teardown(): Promise<void> {
  const c = globalThis.__NS_TEST_CONTAINER__;
  if (c) {
    await c.stop();
    globalThis.__NS_TEST_CONTAINER__ = undefined;
  }
}
