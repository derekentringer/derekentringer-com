import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Flush pending promises without advancing fake timers. useMeetingContext
// fires `fetchMeetingContext` inside a setTimeout/setInterval callback;
// the mock resolves synchronously, but the callback's async handler
// still needs a microtask tick to update state. `flushPromises()` is
// safer than `waitFor` when fake timers are in play (waitFor polls
// real wall-clock time, which doesn't advance in fake-timer mode).
async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

// Mock the API module before importing the hook so the hook picks
// up the mocked `fetchMeetingContext`.
const mockFetch = vi.fn();
vi.mock("../../api/ai.ts", () => ({
  fetchMeetingContext: (...args: unknown[]) => mockFetch(...args),
}));

const { useMeetingContext } = await import("../useMeetingContext.ts");

describe("useMeetingContext polling dedup (Phase 4.3)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ relevantNotes: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("skips API call on poll tick when transcript hasn't changed", async () => {
    // A stable transcript longer than MIN_TRANSCRIPT_LENGTH (50 chars)
    // so the length gate is passed. We want the dedup gate to be
    // what short-circuits the call.
    const transcript = "a".repeat(100);

    renderHook(() => useMeetingContext(true, transcript));

    // Initial search fires after a 5s delay (warm-up).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_100);
      await flushPromises();
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // 45s poll tick with the SAME transcript. dedup should short-circuit.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
      await flushPromises();
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // And again on the next tick.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
      await flushPromises();
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("skips API call when transcript is shorter than MIN_TRANSCRIPT_LENGTH", async () => {
    // < 50 chars — the length gate short-circuits even if dedup wouldn't.
    renderHook(() => useMeetingContext(true, "too short"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_100);
      await flushPromises();
    });
    expect(mockFetch).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
      await flushPromises();
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fires API call when transcript changes", async () => {
    const { rerender } = renderHook(
      ({ transcript }: { transcript: string }) =>
        useMeetingContext(true, transcript),
      { initialProps: { transcript: "a".repeat(100) } },
    );

    // Initial fires.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_100);
      await flushPromises();
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Change the transcript. The useEffect tears down + reinstalls the
    // interval, and the initial 5s warm-up fires again with new content.
    rerender({ transcript: "a".repeat(100) + " new content" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_100);
      await flushPromises();
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("stops polling when isRecording flips to false", async () => {
    const { rerender } = renderHook(
      ({ recording, transcript }: { recording: boolean; transcript: string }) =>
        useMeetingContext(recording, transcript),
      { initialProps: { recording: true, transcript: "a".repeat(100) } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_100);
      await flushPromises();
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    rerender({ recording: false, transcript: "a".repeat(100) });

    // After stopping, no further polls even with time advance.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100_000);
      await flushPromises();
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
