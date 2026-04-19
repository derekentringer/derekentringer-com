import { getPrisma, setPrisma } from "../../../lib/prisma.js";
import { PrismaClient } from "../../../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Tables that integration tests may touch, listed in TRUNCATE order
 * (CASCADE takes care of FK propagation, but the explicit list keeps the
 * reset deterministic if CASCADE is ever removed).
 */
const RESET_TABLES = [
  "chat_messages",
  "note_links",
  "note_versions",
  "images",
  "notes",
  "folders",
  "sync_cursors",
  "refresh_tokens",
  "password_reset_tokens",
  "passkeys",
  "settings",
  "users",
] as const;

let integrationPrisma: PrismaClient | null = null;

/**
 * Returns a PrismaClient connected to the integration test container.
 * Registers it with the app's Prisma singleton so buildApp() uses it too.
 */
export function getIntegrationPrisma(): PrismaClient {
  if (integrationPrisma) return integrationPrisma;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set — is vitest.integration.config.ts running globalSetup?",
    );
  }

  const adapter = new PrismaPg({ connectionString, max: 5 });
  integrationPrisma = new PrismaClient({ adapter });
  setPrisma(integrationPrisma);
  return integrationPrisma;
}

/**
 * Wipe all per-test state from the integration DB.
 * Fast: TRUNCATE ... RESTART IDENTITY CASCADE in a single statement.
 */
export async function resetDb(): Promise<void> {
  const prisma = getIntegrationPrisma();
  const list = RESET_TABLES.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${list} RESTART IDENTITY CASCADE`,
  );
}

/**
 * Disconnect the integration Prisma client. Used in global teardown paths;
 * most tests don't need this.
 */
export async function disconnectIntegrationPrisma(): Promise<void> {
  if (integrationPrisma) {
    await integrationPrisma.$disconnect();
    integrationPrisma = null;
  }
}

/** Re-export for convenience */
export { getPrisma };
