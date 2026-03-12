import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// ---------- Mocks ----------

const mockGetSecureItem = vi.fn();
const mockSetSecureItem = vi.fn();
const mockRemoveSecureItem = vi.fn();

vi.mock("../lib/secureStorage.ts", () => ({
  getSecureItem: (...args: unknown[]) => mockGetSecureItem(...args),
  setSecureItem: (...args: unknown[]) => mockSetSecureItem(...args),
  removeSecureItem: (...args: unknown[]) => mockRemoveSecureItem(...args),
}));

// ---------- Import SUT after mocks ----------

const {
  setAccessToken,
  getAccessToken,
  setOnAuthFailure,
  apiFetch,
  refreshAccessToken,
  tokenManager,
} = await import("../api/client.ts");

// ---------- Helpers ----------

/** Build a JWT with a given `exp` (epoch seconds) for proactive-refresh tests */
function makeJwt(exp: number): string {
  const header = btoa(JSON.stringify({ alg: "HS256" }));
  const payload = btoa(JSON.stringify({ sub: "u1", exp }));
  return `${header}.${payload}.sig`;
}

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;
let mockOnAuthFailure: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
  mockOnAuthFailure = vi.fn<() => void>();
  setOnAuthFailure(mockOnAuthFailure);
  setAccessToken(null);
  mockGetSecureItem.mockResolvedValue(null);
  mockSetSecureItem.mockResolvedValue(undefined);
  mockRemoveSecureItem.mockResolvedValue(undefined);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  setAccessToken(null); // stops proactive timer
});

// ---------- doRefresh tests (via refreshAccessToken) ----------

describe("doRefresh", () => {
  it("network error returns false and does NOT call onAuthFailure", async () => {
    mockGetSecureItem.mockResolvedValue("stored-refresh-token");
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await refreshAccessToken();

    expect(result).toBeNull();
    expect(mockOnAuthFailure).not.toHaveBeenCalled();
    // Should NOT have cleared tokens from secure storage
    expect(mockRemoveSecureItem).not.toHaveBeenCalled();
  });

  it("server 500 returns false and does NOT call onAuthFailure", async () => {
    mockGetSecureItem.mockResolvedValue("stored-refresh-token");
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const result = await refreshAccessToken();

    expect(result).toBeNull();
    expect(mockOnAuthFailure).not.toHaveBeenCalled();
    expect(mockRemoveSecureItem).not.toHaveBeenCalled();
  });

  it("server 401 returns false and DOES call onAuthFailure", async () => {
    mockGetSecureItem.mockResolvedValue("stored-refresh-token");
    mockFetch.mockResolvedValue({ ok: false, status: 401 });

    const result = await refreshAccessToken();

    expect(result).toBeNull();
    expect(mockOnAuthFailure).toHaveBeenCalledOnce();
    expect(mockRemoveSecureItem).toHaveBeenCalledWith("ns-desktop:refreshToken");
  });

  it("server 403 returns false and DOES call onAuthFailure", async () => {
    mockGetSecureItem.mockResolvedValue("stored-refresh-token");
    mockFetch.mockResolvedValue({ ok: false, status: 403 });

    const result = await refreshAccessToken();

    expect(result).toBeNull();
    expect(mockOnAuthFailure).toHaveBeenCalledOnce();
    expect(mockRemoveSecureItem).toHaveBeenCalledWith("ns-desktop:refreshToken");
  });

  it("success returns new access token and updates stored refresh token", async () => {
    mockGetSecureItem.mockResolvedValue("stored-refresh-token");
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ accessToken: "new-access", refreshToken: "new-refresh" }),
    });

    const result = await refreshAccessToken();

    expect(result).toBe("new-access");
    expect(getAccessToken()).toBe("new-access");
    expect(mockSetSecureItem).toHaveBeenCalledWith("ns-desktop:refreshToken", "new-refresh");
    expect(mockOnAuthFailure).not.toHaveBeenCalled();
  });

  it("no stored refresh token (both reads null) calls onAuthFailure", async () => {
    mockGetSecureItem.mockResolvedValue(null);

    const result = await refreshAccessToken();

    expect(result).toBeNull();
    expect(mockOnAuthFailure).toHaveBeenCalledOnce();
    // Two reads: initial + retry
    expect(mockGetSecureItem).toHaveBeenCalledTimes(2);
  });

  it("transient Stronghold failure recovers on retry", async () => {
    // First read returns null (vault glitch), retry succeeds
    mockGetSecureItem
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("stored-refresh-token");
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ accessToken: "new-access", refreshToken: "new-refresh" }),
    });

    const result = await refreshAccessToken();

    expect(result).toBe("new-access");
    expect(mockOnAuthFailure).not.toHaveBeenCalled();
    expect(mockGetSecureItem).toHaveBeenCalledTimes(2);
  });
});

// ---------- apiFetch tests ----------

describe("apiFetch", () => {
  it("after successful refresh, retry 401 does NOT call onAuthFailure", async () => {
    setAccessToken("expired-token");
    mockGetSecureItem.mockResolvedValue("stored-refresh-token");

    mockFetch
      // First request returns 401
      .mockResolvedValueOnce({ status: 401, ok: false })
      // Refresh succeeds
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accessToken: "new-access", refreshToken: "new-refresh" }),
      })
      // Retry also returns 401
      .mockResolvedValueOnce({ status: 401, ok: false });

    const response = await apiFetch("/test");

    expect(response.status).toBe(401);
    // Should NOT have called onAuthFailure despite retry 401
    expect(mockOnAuthFailure).not.toHaveBeenCalled();
  });

  it("on 401 with successful refresh, retries with new token", async () => {
    setAccessToken("expired-token");
    mockGetSecureItem.mockResolvedValue("stored-refresh-token");

    mockFetch
      // First request returns 401
      .mockResolvedValueOnce({ status: 401, ok: false })
      // Refresh succeeds
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accessToken: "new-access", refreshToken: "new-refresh" }),
      })
      // Retry succeeds
      .mockResolvedValueOnce({ status: 200, ok: true });

    const response = await apiFetch("/test");

    expect(response.status).toBe(200);
    // Third fetch call (retry) should use the new token
    const retryCall = mockFetch.mock.calls[2];
    const retryHeaders = retryCall[1].headers as Headers;
    expect(retryHeaders.get("Authorization")).toBe("Bearer new-access");
  });

  it("on 401 with failed refresh (network error), returns original 401 response", async () => {
    setAccessToken("expired-token");
    mockGetSecureItem.mockResolvedValue("stored-refresh-token");

    mockFetch
      // First request returns 401
      .mockResolvedValueOnce({ status: 401, ok: false })
      // Refresh fails with network error
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const response = await apiFetch("/test");

    expect(response.status).toBe(401);
    // Should NOT have called onAuthFailure (network error, not auth failure)
    expect(mockOnAuthFailure).not.toHaveBeenCalled();
  });
});

// ---------- Proactive refresh tests ----------

describe("proactive refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes when token is about to expire", async () => {
    // Token expires in 90 seconds (within 2-min threshold)
    const exp = Math.floor((Date.now() + 90_000) / 1000);
    mockGetSecureItem.mockResolvedValue("stored-refresh-token");
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ accessToken: "refreshed", refreshToken: "new-refresh" }),
    });

    setAccessToken(makeJwt(exp));

    // Advance past the 60s check interval
    await vi.advanceTimersByTimeAsync(60_000);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBe("refreshed");
  });

  it("does NOT refresh when token has plenty of time left", async () => {
    // Token expires in 10 minutes (well above 2-min threshold)
    const exp = Math.floor((Date.now() + 10 * 60_000) / 1000);
    setAccessToken(makeJwt(exp));

    // Advance past one check interval
    await vi.advanceTimersByTimeAsync(60_000);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("stops timer when token is cleared", async () => {
    const exp = Math.floor((Date.now() + 90_000) / 1000);
    setAccessToken(makeJwt(exp));
    // Clear — should stop the timer
    setAccessToken(null);

    await vi.advanceTimersByTimeAsync(120_000);

    // No refresh attempts after clearing
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ---------- TokenManager instance ----------

describe("tokenManager instance", () => {
  it("exposes getMsUntilExpiry", () => {
    const exp = Math.floor((Date.now() + 600_000) / 1000);
    setAccessToken(makeJwt(exp));

    const ms = tokenManager.getMsUntilExpiry();
    expect(ms).not.toBeNull();
    expect(ms!).toBeGreaterThan(598_000);
    expect(ms!).toBeLessThanOrEqual(600_000);
  });
});
