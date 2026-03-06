import crypto from "node:crypto";
import { getPrisma } from "../lib/prisma.js";

const TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createPasswordResetToken(userId: string): Promise<string> {
  const prisma = getPrisma();

  // Delete any existing tokens for this user
  await prisma.passwordResetToken.deleteMany({ where: { userId } });

  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = hashToken(rawToken);

  await prisma.passwordResetToken.create({
    data: {
      token: hashedToken,
      userId,
      expiresAt: new Date(Date.now() + TOKEN_EXPIRY_MS),
    },
  });

  return rawToken;
}

export async function lookupPasswordResetToken(
  rawToken: string,
): Promise<{ userId: string } | null> {
  const prisma = getPrisma();
  const hashedToken = hashToken(rawToken);

  const record = await prisma.passwordResetToken.findUnique({
    where: { token: hashedToken },
  });

  if (!record) return null;
  if (record.expiresAt < new Date()) {
    // Expired — clean up
    await prisma.passwordResetToken.delete({ where: { id: record.id } });
    return null;
  }

  return { userId: record.userId };
}

export async function deletePasswordResetTokens(userId: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.passwordResetToken.deleteMany({ where: { userId } });
}

export async function cleanupExpiredTokens(): Promise<number> {
  const prisma = getPrisma();
  const result = await prisma.passwordResetToken.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}
