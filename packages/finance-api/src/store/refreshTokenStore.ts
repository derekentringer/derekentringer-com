interface StoredToken {
  userId: string;
  expiresAt: number;
}

const store = new Map<string, StoredToken>();

export function storeRefreshToken(
  token: string,
  userId: string,
  ttlMs: number = 7 * 24 * 60 * 60 * 1000,
): void {
  store.set(token, {
    userId,
    expiresAt: Date.now() + ttlMs,
  });
}

export function lookupRefreshToken(
  token: string,
): { userId: string } | undefined {
  const entry = store.get(token);
  if (!entry) return undefined;

  if (Date.now() > entry.expiresAt) {
    store.delete(token);
    return undefined;
  }

  return { userId: entry.userId };
}

export function revokeRefreshToken(token: string): boolean {
  return store.delete(token);
}

export function revokeAllRefreshTokens(userId: string): number {
  let count = 0;
  for (const [token, entry] of store.entries()) {
    if (entry.userId === userId) {
      store.delete(token);
      count++;
    }
  }
  return count;
}

export function clearStore(): void {
  store.clear();
}
