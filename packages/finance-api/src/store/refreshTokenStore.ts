import { getPrisma } from "../lib/prisma.js";

export async function storeRefreshToken(
  token: string,
  userId: string,
  ttlMs: number = 7 * 24 * 60 * 60 * 1000,
): Promise<void> {
  const prisma = getPrisma();
  await prisma.refreshToken.create({
    data: {
      token,
      userId,
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });
}

export async function lookupRefreshToken(
  token: string,
): Promise<{ userId: string } | undefined> {
  const prisma = getPrisma();
  const entry = await prisma.refreshToken.findUnique({
    where: { token },
  });

  if (!entry) return undefined;

  if (new Date() > entry.expiresAt) {
    await prisma.refreshToken.delete({ where: { id: entry.id } });
    return undefined;
  }

  return { userId: entry.userId };
}

export async function revokeRefreshToken(token: string): Promise<boolean> {
  const prisma = getPrisma();
  try {
    await prisma.refreshToken.delete({ where: { token } });
    return true;
  } catch {
    return false;
  }
}

export async function revokeAllRefreshTokens(
  userId: string,
): Promise<number> {
  const prisma = getPrisma();
  const result = await prisma.refreshToken.deleteMany({
    where: { userId },
  });
  return result.count;
}

export async function clearStore(): Promise<void> {
  const prisma = getPrisma();
  await prisma.refreshToken.deleteMany();
}
