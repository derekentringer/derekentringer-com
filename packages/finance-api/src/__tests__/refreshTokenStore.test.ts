import { describe, it, expect, beforeEach } from "vitest";
import {
  storeRefreshToken,
  lookupRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
  clearStore,
} from "../store/refreshTokenStore.js";

describe("refreshTokenStore", () => {
  beforeEach(() => {
    clearStore();
  });

  it("stores and looks up a token", () => {
    storeRefreshToken("token-abc", "user-1");
    const result = lookupRefreshToken("token-abc");
    expect(result).toEqual({ userId: "user-1" });
  });

  it("returns undefined for an unknown token", () => {
    const result = lookupRefreshToken("nonexistent");
    expect(result).toBeUndefined();
  });

  it("revokes a token", () => {
    storeRefreshToken("token-abc", "user-1");
    const revoked = revokeRefreshToken("token-abc");
    expect(revoked).toBe(true);
    expect(lookupRefreshToken("token-abc")).toBeUndefined();
  });

  it("returns false when revoking a nonexistent token", () => {
    const revoked = revokeRefreshToken("nonexistent");
    expect(revoked).toBe(false);
  });

  it("revokes all tokens for a user", () => {
    storeRefreshToken("token-1", "user-1");
    storeRefreshToken("token-2", "user-1");
    storeRefreshToken("token-3", "user-2");

    const count = revokeAllRefreshTokens("user-1");
    expect(count).toBe(2);
    expect(lookupRefreshToken("token-1")).toBeUndefined();
    expect(lookupRefreshToken("token-2")).toBeUndefined();
    expect(lookupRefreshToken("token-3")).toEqual({ userId: "user-2" });
  });

  it("returns undefined for an expired token on lookup", () => {
    // Store with a very short TTL (1ms)
    storeRefreshToken("token-exp", "user-1", 1);

    // Wait a bit to ensure expiry
    const start = Date.now();
    while (Date.now() - start < 5) {
      // busy wait
    }

    const result = lookupRefreshToken("token-exp");
    expect(result).toBeUndefined();
  });

  it("clears all tokens with clearStore", () => {
    storeRefreshToken("token-1", "user-1");
    storeRefreshToken("token-2", "user-2");

    clearStore();

    expect(lookupRefreshToken("token-1")).toBeUndefined();
    expect(lookupRefreshToken("token-2")).toBeUndefined();
  });
});
