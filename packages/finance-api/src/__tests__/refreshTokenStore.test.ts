import crypto from "crypto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMockPrisma } from "./helpers/mockPrisma.js";
import {
  storeRefreshToken,
  lookupRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
  cleanupExpiredTokens,
  clearStore,
} from "../store/refreshTokenStore.js";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

describe("refreshTokenStore", () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    vi.clearAllMocks();
  });

  it("stores a refresh token as SHA-256 hash", async () => {
    const rt = mockPrisma.refreshToken as any;
    rt.create.mockResolvedValue({});

    await storeRefreshToken("token-abc", "user-1");

    expect(rt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        token: hashToken("token-abc"),
        userId: "user-1",
        expiresAt: expect.any(Date),
      }),
    });
  });

  it("looks up a valid token by hash", async () => {
    const rt = mockPrisma.refreshToken as any;
    const hashed = hashToken("token-abc");
    rt.findUnique.mockResolvedValue({
      id: "id-1",
      token: hashed,
      userId: "user-1",
      expiresAt: new Date(Date.now() + 60000),
    });

    const result = await lookupRefreshToken("token-abc");

    expect(result).toEqual({ userId: "user-1" });
    expect(rt.findUnique).toHaveBeenCalledWith({
      where: { token: hashed },
    });
  });

  it("returns undefined for an unknown token", async () => {
    const rt = mockPrisma.refreshToken as any;
    rt.findUnique.mockResolvedValue(null);

    const result = await lookupRefreshToken("nonexistent");

    expect(result).toBeUndefined();
  });

  it("deletes and returns undefined for an expired token", async () => {
    const rt = mockPrisma.refreshToken as any;
    rt.findUnique.mockResolvedValue({
      id: "id-1",
      token: hashToken("token-exp"),
      userId: "user-1",
      expiresAt: new Date(Date.now() - 1000),
    });
    rt.delete.mockResolvedValue({});

    const result = await lookupRefreshToken("token-exp");

    expect(result).toBeUndefined();
    expect(rt.delete).toHaveBeenCalledWith({ where: { id: "id-1" } });
  });

  it("revokes a token by hash", async () => {
    const rt = mockPrisma.refreshToken as any;
    rt.delete.mockResolvedValue({});

    const revoked = await revokeRefreshToken("token-abc");

    expect(revoked).toBe(true);
    expect(rt.delete).toHaveBeenCalledWith({
      where: { token: hashToken("token-abc") },
    });
  });

  it("returns false when revoking a nonexistent token", async () => {
    const rt = mockPrisma.refreshToken as any;
    rt.delete.mockRejectedValue(new Error("Record not found"));

    const revoked = await revokeRefreshToken("nonexistent");

    expect(revoked).toBe(false);
  });

  it("revokes all tokens for a user", async () => {
    const rt = mockPrisma.refreshToken as any;
    rt.deleteMany.mockResolvedValue({ count: 2 });

    const count = await revokeAllRefreshTokens("user-1");

    expect(count).toBe(2);
    expect(rt.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
  });

  it("cleans up expired tokens", async () => {
    const rt = mockPrisma.refreshToken as any;
    rt.deleteMany.mockResolvedValue({ count: 3 });

    const count = await cleanupExpiredTokens();

    expect(count).toBe(3);
    expect(rt.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    });
  });

  it("clears all tokens with clearStore", async () => {
    const rt = mockPrisma.refreshToken as any;
    rt.deleteMany.mockResolvedValue({ count: 0 });

    await clearStore();

    expect(rt.deleteMany).toHaveBeenCalled();
  });
});
