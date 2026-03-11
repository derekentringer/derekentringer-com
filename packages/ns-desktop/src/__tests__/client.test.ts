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
} = await import("../api/client.ts");

// ---------- Helpers ----------

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

  it("no stored refresh token calls onAuthFailure", async () => {
    mockGetSecureItem.mockResolvedValue(null);

    const result = await refreshAccessToken();

    expect(result).toBeNull();
    expect(mockOnAuthFailure).toHaveBeenCalledOnce();
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
