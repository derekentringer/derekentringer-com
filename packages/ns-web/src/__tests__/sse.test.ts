import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the client module
const mockGetAccessToken = vi.fn();
vi.mock("../api/client.ts", () => ({
  getAccessToken: () => mockGetAccessToken(),
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
    mockFetch.mockResolvedValueOnce({ ok: false, body: null });
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
      .mockResolvedValueOnce({ ok: false, body: null })
      .mockResolvedValueOnce({ ok: false, body: null })
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
    mockFetch.mockResolvedValueOnce({ ok: false, body: null });

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

  it("proactively reconnects after 13 minutes", async () => {
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

    // Advance to 13 minutes
    await vi.advanceTimersByTimeAsync(13 * 60 * 1000);

    // Allow the reconnect to process
    await vi.advanceTimersByTimeAsync(0);

    expect(mockFetch).toHaveBeenCalledTimes(2);

    conn.disconnect();
    // Release the hanging read
    resolveHolder.fn?.();
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
    mockFetch.mockResolvedValueOnce({ ok: false, body: null });

    const onConnect = vi.fn();
    const conn = connectSseStream(vi.fn(), vi.fn(), onConnect);

    await vi.advanceTimersByTimeAsync(0);

    expect(onConnect).not.toHaveBeenCalled();

    conn.disconnect();
  });
});
