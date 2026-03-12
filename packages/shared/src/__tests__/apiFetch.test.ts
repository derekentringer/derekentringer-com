import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTokenManager, createApiFetch } from "../token/index.js";
import type { TokenRefreshAdapter } from "../token/index.js";

// ---------- Helpers ----------

function createMockAdapter(overrides?: Partial<TokenRefreshAdapter>): TokenRefreshAdapter {
  return {
    doRefresh: vi.fn().mockResolvedValue({ accessToken: "refreshed-token" }),
    onRefreshSuccess: vi.fn(),
    onAuthFailure: vi.fn(),
    ...overrides,
  };
}

const BASE_URL = "http://localhost:3004";

// ---------- Tests ----------

describe("createApiFetch", () => {
  let originalFetch: typeof globalThis.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("attaches Bearer header when token is set", async () => {
    const adapter = createMockAdapter();
    const tm = createTokenManager({ adapter, baseUrl: BASE_URL });
    const apiFetch = createApiFetch(tm, BASE_URL);

    tm.setAccessToken("my-token");
    mockFetch.mockResolvedValue({ status: 200, ok: true });

    await apiFetch("/test");

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/test`);
    expect((opts.headers as Headers).get("Authorization")).toBe("Bearer my-token");

    tm.destroy();
  });

  it("does not attach Bearer header when no token", async () => {
    const adapter = createMockAdapter();
    const tm = createTokenManager({ adapter, baseUrl: BASE_URL });
    const apiFetch = createApiFetch(tm, BASE_URL);

    mockFetch.mockResolvedValue({ status: 200, ok: true });

    await apiFetch("/test");

    const [, opts] = mockFetch.mock.calls[0];
    expect((opts.headers as Headers).has("Authorization")).toBe(false);

    tm.destroy();
  });

  it("sets Content-Type: application/json for non-FormData bodies", async () => {
    const adapter = createMockAdapter();
    const tm = createTokenManager({ adapter, baseUrl: BASE_URL });
    const apiFetch = createApiFetch(tm, BASE_URL);

    mockFetch.mockResolvedValue({ status: 200, ok: true });

    await apiFetch("/test", {
      method: "POST",
      body: JSON.stringify({ key: "value" }),
    });

    const [, opts] = mockFetch.mock.calls[0];
    expect((opts.headers as Headers).get("Content-Type")).toBe("application/json");

    tm.destroy();
  });

  it("does NOT set Content-Type for FormData bodies", async () => {
    const adapter = createMockAdapter();
    const tm = createTokenManager({ adapter, baseUrl: BASE_URL });
    const apiFetch = createApiFetch(tm, BASE_URL);

    mockFetch.mockResolvedValue({ status: 200, ok: true });

    const formData = new FormData();
    formData.append("file", "data");

    await apiFetch("/upload", {
      method: "POST",
      body: formData,
    });

    const [, opts] = mockFetch.mock.calls[0];
    expect((opts.headers as Headers).has("Content-Type")).toBe(false);

    tm.destroy();
  });

  it("on 401, refreshes and retries with new token", async () => {
    const adapter = createMockAdapter({
      doRefresh: vi.fn().mockResolvedValue({ accessToken: "new-access" }),
    });
    const tm = createTokenManager({ adapter, baseUrl: BASE_URL });
    const apiFetch = createApiFetch(tm, BASE_URL);

    tm.setAccessToken("expired-token");

    mockFetch
      .mockResolvedValueOnce({ status: 401, ok: false })
      .mockResolvedValueOnce({ status: 200, ok: true });

    const response = await apiFetch("/test");

    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Retry should use the new token
    const [, retryOpts] = mockFetch.mock.calls[1];
    expect((retryOpts.headers as Headers).get("Authorization")).toBe("Bearer new-access");

    tm.destroy();
  });

  it("on 401 with failed refresh, returns original 401", async () => {
    const adapter = createMockAdapter({
      doRefresh: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    });
    const tm = createTokenManager({ adapter, baseUrl: BASE_URL });
    const apiFetch = createApiFetch(tm, BASE_URL);

    tm.setAccessToken("expired-token");

    mockFetch.mockResolvedValue({ status: 401, ok: false });

    const response = await apiFetch("/test");

    expect(response.status).toBe(401);
    // Only the initial request, no retry
    expect(mockFetch).toHaveBeenCalledTimes(1);

    tm.destroy();
  });

  it("does not attempt refresh on 401 without token", async () => {
    const adapter = createMockAdapter();
    const tm = createTokenManager({ adapter, baseUrl: BASE_URL });
    const apiFetch = createApiFetch(tm, BASE_URL);

    mockFetch.mockResolvedValue({ status: 401, ok: false });

    const response = await apiFetch("/test");

    expect(response.status).toBe(401);
    expect(adapter.doRefresh).not.toHaveBeenCalled();

    tm.destroy();
  });

  it("merges defaultFetchOptions (e.g. credentials)", async () => {
    const adapter = createMockAdapter();
    const tm = createTokenManager({ adapter, baseUrl: BASE_URL });
    const apiFetch = createApiFetch(tm, BASE_URL, { credentials: "include" });

    mockFetch.mockResolvedValue({ status: 200, ok: true });

    await apiFetch("/test");

    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.credentials).toBe("include");

    tm.destroy();
  });

  it("per-call options override defaultFetchOptions", async () => {
    const adapter = createMockAdapter();
    const tm = createTokenManager({ adapter, baseUrl: BASE_URL });
    const apiFetch = createApiFetch(tm, BASE_URL, { credentials: "include" });

    mockFetch.mockResolvedValue({ status: 200, ok: true });

    await apiFetch("/test", { credentials: "omit" });

    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.credentials).toBe("omit");

    tm.destroy();
  });
});
