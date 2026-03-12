import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the client module
const mockGetAccessToken = vi.fn();
const mockRefreshAccessToken = vi.fn();
const mockGetMsUntilExpiry = vi.fn();

vi.mock("../api/client.ts", () => ({
  getAccessToken: () => mockGetAccessToken(),
  refreshAccessToken: () => mockRefreshAccessToken(),
  tokenManager: {
    getMsUntilExpiry: () => mockGetMsUntilExpiry(),
  },
}));

import { connectSseStream } from "../api/sse.ts";

// Helper to create a mock ReadableStream from SSE text
function createMockStream(chunks: string[], delayBetween = 0) {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (delayBetween > 0 && index > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayBetween));
      }
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

describe("SSE client (connectSseStream)", () => {
  let originalFetch: typeof globalThis.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;
  let visibilityState: string;

  beforeEach(() => {
    vi.useFakeTimers();
    mockGetAccessToken.mockReturnValue("test-token");
    mockRefreshAccessToken.mockResolvedValue("refreshed-token");
    mockGetMsUntilExpiry.mockReturnValue(10 * 60 * 1000); // 10 min by default
    originalFetch = globalThis.fetch;
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    // Mock document.hidden via visibilityState
    visibilityState = "visible";
    Object.defineProperty(document, "hidden", {
      get: () => visibilityState === "hidden",
      configurable: true,
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("connects with auth header and deviceId", async () => {
    const stream = createMockStream(["event: connected\ndata: {}\n\n"]);
    mockFetch.mockResolvedValue({ ok: true, body: stream });

    const onEvent = vi.fn();
    const conn = connectSseStream(onEvent);

    // Let the fetch resolve
    await vi.advanceTimersByTimeAsync(0);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/sync/events?deviceId=");
    expect(opts.headers.Authorization).toBe("Bearer test-token");

    conn.disconnect();
  });

  it("calls onEvent when sync event is received", async () => {
    const stream = createMockStream([
      "event: connected\ndata: {}\n\n",
      "event: sync\ndata: {}\n\n",
    ]);
    mockFetch.mockResolvedValue({ ok: true, body: stream });

    const onEvent = vi.fn();
    const conn = connectSseStream(onEvent);

    // Let fetch resolve and stream process
    await vi.advanceTimersByTimeAsync(10);

    expect(onEvent).toHaveBeenCalledTimes(1);

    conn.disconnect();
  });

  it("does not call onEvent for connected event", async () => {
    const stream = createMockStream(["event: connected\ndata: {}\n\n"]);
    mockFetch.mockResolvedValue({ ok: true, body: stream });

    const onEvent = vi.fn();
    const conn = connectSseStream(onEvent);

    await vi.advanceTimersByTimeAsync(10);

    expect(onEvent).not.toHaveBeenCalled();

    conn.disconnect();
  });

  it("calls onError and schedules reconnect on fetch failure", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, body: null });
    // Second attempt succeeds
    const stream = createMockStream(["event: connected\ndata: {}\n\n"]);
    mockFetch.mockResolvedValueOnce({ ok: true, body: stream });

    const onEvent = vi.fn();
    const onError = vi.fn();
    const conn = connectSseStream(onEvent, onError);

    await vi.advanceTimersByTimeAsync(0);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Advance past initial 1s backoff
    await vi.advanceTimersByTimeAsync(1000);

    expect(mockFetch).toHaveBeenCalledTimes(2);

    conn.disconnect();
  });

  it("uses exponential backoff on reconnect", async () => {
    // Fail twice, then succeed
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500, body: null })
      .mockResolvedValueOnce({ ok: false, status: 500, body: null })
      .mockResolvedValueOnce({
        ok: true,
        body: createMockStream(["event: connected\ndata: {}\n\n"]),
      });

    const conn = connectSseStream(vi.fn(), vi.fn());

    // First attempt fails immediately
    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // 1s backoff
    await vi.advanceTimersByTimeAsync(1000);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // 2s backoff (doubled)
    await vi.advanceTimersByTimeAsync(2000);
    expect(mockFetch).toHaveBeenCalledTimes(3);

    conn.disconnect();
  });

  it("does not reconnect after disconnect()", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, body: null });

    const conn = connectSseStream(vi.fn());

    await vi.advanceTimersByTimeAsync(0);
    conn.disconnect();

    // Advance well past any reconnect timer
    await vi.advanceTimersByTimeAsync(60_000);

    // Only the initial attempt
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("schedules reconnect when token is missing", async () => {
    mockGetAccessToken.mockReturnValueOnce(null).mockReturnValue("test-token");

    const stream = createMockStream(["event: connected\ndata: {}\n\n"]);
    mockFetch.mockResolvedValue({ ok: true, body: stream });

    const conn = connectSseStream(vi.fn());

    // No fetch should happen without a token
    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).not.toHaveBeenCalled();

    // After 1s backoff, should retry with token
    await vi.advanceTimersByTimeAsync(1000);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    conn.disconnect();
  });

  it("disconnects on tab hidden and reconnects on tab visible", async () => {
    const stream1 = createMockStream(["event: connected\ndata: {}\n\n"]);
    const stream2 = createMockStream(["event: connected\ndata: {}\n\n"]);
    mockFetch
      .mockResolvedValueOnce({ ok: true, body: stream1 })
      .mockResolvedValueOnce({ ok: true, body: stream2 });

    const onEvent = vi.fn();
    const conn = connectSseStream(onEvent);

    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Go hidden
    visibilityState = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));

    // Come back visible
    visibilityState = "visible";
    document.dispatchEvent(new Event("visibilitychange"));

    await vi.advanceTimersByTimeAsync(0);

    // Should have reconnected
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // onEvent called on visibility restore to catch up
    expect(onEvent).toHaveBeenCalledTimes(1);

    conn.disconnect();
  });

  it("proactively reconnects based on dynamic token expiry timer", async () => {
    // Token expires in 10 minutes → reconnect at ~8 min (10min - 2min threshold)
    mockGetMsUntilExpiry.mockReturnValue(10 * 60 * 1000);
    // Mock Math.random to return 0 for deterministic jitter
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

    // Keep the stream open by not closing it immediately
    const resolveHolder: { fn: (() => void) | null } = { fn: null };
    const hangingStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("event: connected\ndata: {}\n\n"));
      },
      pull() {
        return new Promise<void>((resolve) => {
          resolveHolder.fn = resolve;
        });
      },
    });

    const stream2 = createMockStream(["event: connected\ndata: {}\n\n"]);

    mockFetch
      .mockResolvedValueOnce({ ok: true, body: hangingStream })
      .mockResolvedValueOnce({ ok: true, body: stream2 });

    const conn = connectSseStream(vi.fn());

    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // With 0 jitter: delay = max(10min - 2min, 30s) = 8 min = 480_000ms
    await vi.advanceTimersByTimeAsync(480_000);
    await vi.advanceTimersByTimeAsync(0);

    expect(mockFetch).toHaveBeenCalledTimes(2);

    conn.disconnect();
    resolveHolder.fn?.();
    randomSpy.mockRestore();
  });

  it("cleans up visibility listener on disconnect", async () => {
    const stream = createMockStream(["event: connected\ndata: {}\n\n"]);
    mockFetch.mockResolvedValue({ ok: true, body: stream });

    const spy = vi.spyOn(document, "removeEventListener");
    const conn = connectSseStream(vi.fn());

    await vi.advanceTimersByTimeAsync(0);
    conn.disconnect();

    expect(spy).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    spy.mockRestore();
  });

  it("calls onConnect when SSE connection succeeds", async () => {
    const stream = createMockStream(["event: connected\ndata: {}\n\n"]);
    mockFetch.mockResolvedValue({ ok: true, body: stream });

    const onConnect = vi.fn();
    const conn = connectSseStream(vi.fn(), vi.fn(), onConnect);

    await vi.advanceTimersByTimeAsync(0);

    expect(onConnect).toHaveBeenCalledTimes(1);

    conn.disconnect();
  });

  it("does not call onConnect on fetch failure", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, body: null });

    const onConnect = vi.fn();
    const conn = connectSseStream(vi.fn(), vi.fn(), onConnect);

    await vi.advanceTimersByTimeAsync(0);

    expect(onConnect).not.toHaveBeenCalled();

    conn.disconnect();
  });

  it("stops retrying on 403 (forbidden)", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, body: null });

    const onError = vi.fn();
    const conn = connectSseStream(vi.fn(), onError);

    await vi.advanceTimersByTimeAsync(0);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Advance well past any reconnect timer — should NOT retry
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    conn.disconnect();
  });

  it("on 401, attempts refresh and retries", async () => {
    mockRefreshAccessToken.mockResolvedValue("new-token");
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 401, body: null })
      .mockResolvedValueOnce({
        ok: true,
        body: createMockStream(["event: connected\ndata: {}\n\n"]),
      });

    const conn = connectSseStream(vi.fn());

    await vi.advanceTimersByTimeAsync(0);

    // Should have refreshed and retried
    expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    conn.disconnect();
  });

  it("adds jitter to reconnect timer", async () => {
    mockGetMsUntilExpiry.mockReturnValue(10 * 60 * 1000); // 10 min
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);

    const hangingStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("event: connected\ndata: {}\n\n"));
      },
      pull() {
        return new Promise<void>(() => {});
      },
    });

    mockFetch.mockResolvedValueOnce({ ok: true, body: hangingStream });

    const conn = connectSseStream(vi.fn());
    await vi.advanceTimersByTimeAsync(0);

    // base = 8min = 480_000, jitter = floor(0.5 * 480_000 * 0.1) = floor(24_000) = 24_000
    // total = 504_000

    // At 480_000 (no jitter), should NOT have reconnected yet
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: createMockStream(["event: connected\ndata: {}\n\n"]),
    });

    await vi.advanceTimersByTimeAsync(480_000);
    expect(mockFetch).toHaveBeenCalledTimes(1); // still only initial

    // At 504_000 total, should reconnect
    await vi.advanceTimersByTimeAsync(24_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    conn.disconnect();
    randomSpy.mockRestore();
  });
});
