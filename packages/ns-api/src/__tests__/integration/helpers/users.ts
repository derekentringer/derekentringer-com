import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { getIntegrationPrisma } from "./db.js";
import type { User } from "../../../generated/prisma/client.js";

export interface CreateUserOptions {
  email?: string;
  password?: string;
  displayName?: string | null;
  role?: "user" | "admin";
  totpEnabled?: boolean;
  mustChangePassword?: boolean;
}

/**
 * Create a real User row in the integration DB. Password is bcrypt-hashed
 * so auth paths that verify password (login, password reset) also work.
 */
export async function createTestUser(opts: CreateUserOptions = {}): Promise<User> {
  const prisma = getIntegrationPrisma();
  const email = opts.email ?? `user-${randomUUID()}@test.local`;
  const password = opts.password ?? "test-password-123";
  const passwordHash = await bcrypt.hash(password, 4); // low cost — tests only

  return prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName: opts.displayName ?? null,
      role: opts.role ?? "user",
      totpEnabled: opts.totpEnabled ?? false,
      mustChangePassword: opts.mustChangePassword ?? false,
    },
  });
}

/**
 * Allocate a deviceId for a test scenario. Optionally seed a SyncCursor
 * row (useful when a test needs to simulate a device that has already
 * pulled up to some point in time).
 */
export async function createTestDevice(
  userId: string,
  opts: { deviceId?: string; lastSyncedAt?: Date } = {},
): Promise<{ deviceId: string }> {
  const deviceId = opts.deviceId ?? randomUUID();

  if (opts.lastSyncedAt) {
    const prisma = getIntegrationPrisma();
    await prisma.syncCursor.upsert({
      where: { userId_deviceId: { userId, deviceId } },
      create: { userId, deviceId, lastSyncedAt: opts.lastSyncedAt },
      update: { lastSyncedAt: opts.lastSyncedAt },
    });
  }

  return { deviceId };
}

/**
 * Build an Authorization header for a user. Signs a JWT using the same
 * secret the app's fastify-jwt plugin uses. Mirrors the token shape
 * emitted by the real /auth/login route: { sub, email, role }.
 */
export function authHeaderFor(user: Pick<User, "id" | "email" | "role">): {
  Authorization: string;
} {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set — integration harness not initialized?");
  }
  const token = jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    secret,
  );
  return { Authorization: `Bearer ${token}` };
}

/** Convenience: sign a token from just a userId when the full user row isn't needed. */
export function authHeaderForId(userId: string, role: "user" | "admin" = "user"): {
  Authorization: string;
} {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set — integration harness not initialized?");
  }
  const token = jwt.sign({ sub: userId, role }, secret);
  return { Authorization: `Bearer ${token}` };
}
