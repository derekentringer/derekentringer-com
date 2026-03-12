import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTokenManager, getTokenExpiryMs } from "../token/index.js";
import type { TokenRefreshAdapter, TokenManager, AuthFailureReason, TokenLogger } from "../token/index.js";

// ---------- Helpers ----------

function makeJwt(exp: number): string {
  const header = btoa(JSON.stringify({ alg: "HS256" }));
  const payload = btoa(JSON.stringify({ sub: "u1", exp }));
  return `${header}.${payload}.sig`;
}

function createMockAdapter(overrides?: Partial<TokenRefreshAdapter>): TokenRefreshAdapter {
  return {
    doRefresh: vi.fn().mockResolvedValue({ accessToken: "new-access" }),
    onRefreshSuccess: vi.fn(),
    onAuthFailure: vi.fn(),
    ...overrides,
  };
}

// ---------- parseJwt ----------

describe("getTokenExpiryMs", () => {
  it("extracts expiry from valid JWT", () => {
    const exp = 1700000000;
    const token = makeJwt(exp);
    expect(getTokenExpiryMs(token)).toBe(exp * 1000);
  });

  it("returns null for JWT without exp", () => {
    const header = btoa(JSON.stringify({ alg: "HS256" }));
    const payload = btoa(JSON.stringify({ sub: "u1" }));
    expect(getTokenExpiryMs(`${header}.${payload}.sig`)).toBeNull();
  });

  it("returns null for invalid token", () => {
    expect(getTokenExpiryMs("not-a-jwt")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(getTokenExpiryMs("")).toBeNull();
  });
});

// ---------- Token get/set ----------

describe("TokenManager: get/set", () => {
  let adapter: TokenRefreshAdapter;
  let tm: TokenManager;

  beforeEach(() => {
    adapter = createMockAdapter();
    tm = createTokenManager({ adapter, baseUrl: "http://localhost:3004" });
  });

  afterEach(() => {
    tm.destroy();
  });

  it("starts with null access token", () => {
    expect(tm.getAccessToken()).toBeNull();
  });

  it("stores and retrieves access token", () => {
    tm.setAccessToken("my-token");
    expect(tm.getAccessToken()).toBe("my-token");
  });

  it("clears access token when set to null", () => {
    tm.setAccessToken("my-token");
    tm.setAccessToken(null);
    expect(tm.getAccessToken()).toBeNull();
  });

  it("getTokenExpiryMs returns expiry for current token", () => {
    const exp = Math.floor(Date.now() / 1000) + 900;
    tm.setAccessToken(makeJwt(exp));
    expect(tm.getTokenExpiryMs()).toBe(exp * 1000);
  });

  it("getTokenExpiryMs returns null when no token", () => {
    expect(tm.getTokenExpiryMs()).toBeNull();
  });

  it("getMsUntilExpiry returns remaining ms", () => {
    const exp = Math.floor(Date.now() / 1000) + 900;
    tm.setAccessToken(makeJwt(exp));
    const ms = tm.getMsUntilExpiry();
    expect(ms).not.toBeNull();
    // Should be approximately 900s (within 2s tolerance)
    expect(ms!).toBeGreaterThan(898_000);
    expect(ms!).toBeLessThanOrEqual(900_000);
  });

  it("getMsUntilExpiry returns null when no token", () => {
    expect(tm.getMsUntilExpiry()).toBeNull();
  });
});

// ---------- Refresh ----------

describe("TokenManager: refresh", () => {
  let adapter: TokenRefreshAdapter;
  let tm: TokenManager;

  beforeEach(() => {
    adapter = createMockAdapter();
    tm = createTokenManager({ adapter, baseUrl: "http://localhost:3004" });
  });

  afterEach(() => {
    tm.destroy();
  });

  it("calls adapter.doRefresh and returns new token on success", async () => {
    (adapter.doRefresh as ReturnType<typeof vi.fn>).mockResolvedValue({
      accessToken: "refreshed-token",
      refreshToken: "new-refresh",
    });

    const result = await tm.refreshAccessToken();

    expect(result).toBe("refreshed-token");
    expect(tm.getAccessToken()).toBe("refreshed-token");
    expect(adapter.doRefresh).toHaveBeenCalledWith("http://localhost:3004");
    expect(adapter.onRefreshSuccess).toHaveBeenCalledWith({
      accessToken: "refreshed-token",
      refreshToken: "new-refresh",
    });
  });

  it("adapter returning null triggers auth failure with 'token_revoked'", async () => {
    const mockOnAuthFailure = vi.fn();
    tm.setOnAuthFailure(mockOnAuthFailure);
    (adapter.doRefresh as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await tm.refreshAccessToken();

    expect(result).toBeNull();
    expect(adapter.onAuthFailure).toHaveBeenCalledWith("token_revoked");
    expect(mockOnAuthFailure).toHaveBeenCalledWith("token_revoked");
  });

  it("network error does NOT trigger auth failure", async () => {
    const mockOnAuthFailure = vi.fn();
    tm.setOnAuthFailure(mockOnAuthFailure);
    (adapter.doRefresh as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError("Failed to fetch"),
    );

    const result = await tm.refreshAccessToken();

    expect(result).toBeNull();
    expect(adapter.onAuthFailure).not.toHaveBeenCalled();
    expect(mockOnAuthFailure).not.toHaveBeenCalled();
  });

  it("deduplicates concurrent refresh calls", async () => {
    let resolveRefresh: (v: unknown) => void;
    (adapter.doRefresh as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((resolve) => { resolveRefresh = resolve; }),
    );

    const p1 = tm.refreshAccessToken();
    const p2 = tm.refreshAccessToken();
    const p3 = tm.refreshAccessToken();

    // All should share the same promise
    resolveRefresh!({ accessToken: "deduped" });

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(r1).toBe("deduped");
    expect(r2).toBe("deduped");
    expect(r3).toBe("deduped");
    expect(adapter.doRefresh).toHaveBeenCalledTimes(1);
  });

  it("allows new refresh after previous completes", async () => {
    (adapter.doRefresh as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ accessToken: "first" })
      .mockResolvedValueOnce({ accessToken: "second" });

    const r1 = await tm.refreshAccessToken();
    const r2 = await tm.refreshAccessToken();

    expect(r1).toBe("first");
    expect(r2).toBe("second");
    expect(adapter.doRefresh).toHaveBeenCalledTimes(2);
  });
});

// ---------- Auth failure callback ----------

describe("TokenManager: auth failure callback", () => {
  it("receives correct AuthFailureReason", async () => {
    const adapter = createMockAdapter({
      doRefresh: vi.fn().mockResolvedValue(null),
    });
    const tm = createTokenManager({ adapter, baseUrl: "http://localhost:3004" });

    const reasons: AuthFailureReason[] = [];
    tm.setOnAuthFailure((reason) => reasons.push(reason));

    await tm.refreshAccessToken();

    expect(reasons).toEqual(["token_revoked"]);
    tm.destroy();
  });

  it("clears access token on auth failure", async () => {
    const adapter = createMockAdapter({
      doRefresh: vi.fn().mockResolvedValue(null),
    });
    const tm = createTokenManager({ adapter, baseUrl: "http://localhost:3004" });
    tm.setAccessToken("will-be-cleared");

    await tm.refreshAccessToken();

    expect(tm.getAccessToken()).toBeNull();
    tm.destroy();
  });
});

// ---------- Proactive refresh ----------

describe("TokenManager: proactive refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes when token is about to expire (within threshold)", async () => {
    const adapter = createMockAdapter({
      doRefresh: vi.fn().mockResolvedValue({ accessToken: "refreshed" }),
    });
    const tm = createTokenManager({
      adapter,
      baseUrl: "http://localhost:3004",
      refreshThresholdMs: 2 * 60 * 1000,
      refreshCheckIntervalMs: 60 * 1000,
    });

    // Token expires in 90 seconds (within 2-min threshold)
    const exp = Math.floor((Date.now() + 90_000) / 1000);
    tm.setAccessToken(makeJwt(exp));

    await vi.advanceTimersByTimeAsync(60_000);

    expect(adapter.doRefresh).toHaveBeenCalledTimes(1);
    expect(tm.getAccessToken()).toBe("refreshed");

    tm.destroy();
  });

  it("does NOT refresh when token has plenty of time left", async () => {
    const adapter = createMockAdapter();
    const tm = createTokenManager({
      adapter,
      baseUrl: "http://localhost:3004",
      refreshThresholdMs: 2 * 60 * 1000,
      refreshCheckIntervalMs: 60 * 1000,
    });

    // Token expires in 10 minutes (well above 2-min threshold)
    const exp = Math.floor((Date.now() + 10 * 60_000) / 1000);
    tm.setAccessToken(makeJwt(exp));

    await vi.advanceTimersByTimeAsync(60_000);

    expect(adapter.doRefresh).not.toHaveBeenCalled();

    tm.destroy();
  });

  it("stops timer when token is cleared", async () => {
    const adapter = createMockAdapter();
    const tm = createTokenManager({
      adapter,
      baseUrl: "http://localhost:3004",
      refreshCheckIntervalMs: 60 * 1000,
    });

    const exp = Math.floor((Date.now() + 90_000) / 1000);
    tm.setAccessToken(makeJwt(exp));
    tm.setAccessToken(null);

    await vi.advanceTimersByTimeAsync(120_000);

    expect(adapter.doRefresh).not.toHaveBeenCalled();

    tm.destroy();
  });

  it("stops timer on destroy()", async () => {
    const adapter = createMockAdapter();
    const tm = createTokenManager({
      adapter,
      baseUrl: "http://localhost:3004",
      refreshCheckIntervalMs: 60 * 1000,
    });

    const exp = Math.floor((Date.now() + 90_000) / 1000);
    tm.setAccessToken(makeJwt(exp));
    tm.destroy();

    await vi.advanceTimersByTimeAsync(120_000);

    expect(adapter.doRefresh).not.toHaveBeenCalled();
  });
});

// ---------- Logger ----------

describe("TokenManager: logger", () => {
  it("logs on refresh success", async () => {
    const logger: TokenLogger = {
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const adapter = createMockAdapter({
      doRefresh: vi.fn().mockResolvedValue({ accessToken: "new" }),
    });
    const tm = createTokenManager({
      adapter,
      baseUrl: "http://localhost:3004",
      logger,
    });

    await tm.refreshAccessToken();

    expect(logger.debug).toHaveBeenCalledWith("Token refresh successful");

    tm.destroy();
  });

  it("logs on auth failure", async () => {
    const logger: TokenLogger = {
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const adapter = createMockAdapter({
      doRefresh: vi.fn().mockResolvedValue(null),
    });
    const tm = createTokenManager({
      adapter,
      baseUrl: "http://localhost:3004",
      logger,
    });

    await tm.refreshAccessToken();

    expect(logger.warn).toHaveBeenCalledWith("Auth failure: token_revoked");

    tm.destroy();
  });

  it("logs on network error", async () => {
    const logger: TokenLogger = {
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const adapter = createMockAdapter({
      doRefresh: vi.fn().mockRejectedValue(new Error("Network fail")),
    });
    const tm = createTokenManager({
      adapter,
      baseUrl: "http://localhost:3004",
      logger,
    });

    await tm.refreshAccessToken();

    expect(logger.error).toHaveBeenCalledWith(
      "Token refresh error: Network fail",
    );

    tm.destroy();
  });
});
