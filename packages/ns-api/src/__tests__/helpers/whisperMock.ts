import { vi, type MockInstance, expect } from "vitest";

// Phase 0.1 — Whisper mock with retry simulation.
//
// `WhisperMock` replaces the bare `vi.spyOn(globalThis, "fetch")` +
// chained `mockResolvedValueOnce(...)` pattern used across the
// whisper tests with a named-intent API:
//
//     const whisper = installWhisperMock();
//     whisper.succeed("hello world");            // next call → 200 { text: "hello world" }
//     whisper.fail(502, "Bad Gateway");          // next call → 502
//     whisper.timeout();                         // next call → AbortError
//     whisper.succeed("ok");                     // next call → 200
//
//     await transcribeAudio(...);
//
//     whisper.assertAttempts(3);                  // 3 POSTs hit the API
//     whisper.assertRetrySequence([502, 200]);   // status codes as seen
//
// Beyond ergonomics this unlocks two things the current tests can't
// do cleanly: asserting on the exact status sequence the code
// retried through, and simulating a `fetch` rejection (AbortError or
// network failure) which is how a timeout actually surfaces.

export interface WhisperAttempt {
  url: string;
  method: string;
  body: FormData | undefined;
  model: string | undefined;
  filename: string | undefined;
  status: number | "timeout" | "network-error";
}

type QueuedResponse =
  | { kind: "response"; response: Response }
  | { kind: "timeout" }
  | { kind: "network-error"; error: Error };

export class WhisperMock {
  private queue: QueuedResponse[] = [];
  private spy: MockInstance | null = null;
  readonly attempts: WhisperAttempt[] = [];

  /**
   * Install the `fetch` spy. Returns `this` so `installWhisperMock()`
   * can chain.
   */
  install(): this {
    this.spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (...args) => {
      const [input, init] = args as [RequestInfo | URL, RequestInit | undefined];
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const body = init?.body instanceof FormData ? init.body : undefined;
      const attempt: WhisperAttempt = {
        url,
        method: init?.method ?? "GET",
        body,
        model: body?.get("model")?.toString(),
        filename: extractFilename(body),
        status: 0,
      };

      const next = this.queue.shift();
      if (!next) {
        attempt.status = 500;
        this.attempts.push(attempt);
        throw new Error(
          `WhisperMock: unexpected fetch #${this.attempts.length}. Configure more responses via .succeed/.fail/.timeout.`,
        );
      }

      if (next.kind === "timeout") {
        attempt.status = "timeout";
        this.attempts.push(attempt);
        // `AbortSignal.timeout` rejects with a DOMException-shaped error
        // in Node; we can't construct that here, but the caller only
        // branches on "did fetch throw", so a generic error suffices.
        const err = new Error("The operation was aborted due to timeout");
        err.name = "TimeoutError";
        throw err;
      }

      if (next.kind === "network-error") {
        attempt.status = "network-error";
        this.attempts.push(attempt);
        throw next.error;
      }

      attempt.status = next.response.status;
      this.attempts.push(attempt);
      return next.response;
    });
    return this;
  }

  /**
   * Restore the real `fetch` and clear history. Call from `afterEach`.
   */
  uninstall(): void {
    this.spy?.mockRestore();
    this.spy = null;
    this.queue.length = 0;
    this.attempts.length = 0;
  }

  /** Next call resolves with `200 { text }`. */
  succeed(text: string): this {
    this.queue.push({
      kind: "response",
      response: new Response(JSON.stringify({ text }), { status: 200 }),
    });
    return this;
  }

  /** Next call resolves with the given status + body. Body defaults to the statusText. */
  fail(status: number, body?: string): this {
    const text = body ?? `HTTP ${status}`;
    this.queue.push({
      kind: "response",
      response: new Response(text, { status }),
    });
    return this;
  }

  /** Next call rejects with a timeout-shaped error (matches `AbortSignal.timeout`). */
  timeout(): this {
    this.queue.push({ kind: "timeout" });
    return this;
  }

  /** Next call rejects with a generic network error (TypeError, matches `fetch` semantics). */
  networkError(message = "fetch failed"): this {
    this.queue.push({
      kind: "network-error",
      error: new TypeError(message),
    });
    return this;
  }

  /**
   * Next call resolves with a malformed body (200 status, but not
   * parseable JSON with a `text` field). Used to test the
   * "succeeded but response is garbage" branch.
   */
  malformed(): this {
    this.queue.push({
      kind: "response",
      response: new Response("<html>not json</html>", { status: 200 }),
    });
    return this;
  }

  /** Assert the total number of attempts the code made. */
  assertAttempts(count: number): void {
    expect(this.attempts).toHaveLength(count);
  }

  /**
   * Assert the exact sequence of outcome statuses the code hit. Useful
   * for verifying retry semantics: `assertRetrySequence([502, 502, 200])`
   * says "retried twice before succeeding".
   */
  assertRetrySequence(expected: Array<number | "timeout" | "network-error">): void {
    const actual = this.attempts.map((a) => a.status);
    expect(actual).toEqual(expected);
  }

  /** Test-only convenience: fully-unread queue count. */
  remainingResponses(): number {
    return this.queue.length;
  }
}

/**
 * Factory + install in one call so most tests can do:
 *
 *     const whisper = installWhisperMock();
 *     afterEach(() => whisper.uninstall());
 */
export function installWhisperMock(): WhisperMock {
  return new WhisperMock().install();
}

function extractFilename(body: FormData | undefined): string | undefined {
  if (!body) return undefined;
  const file = body.get("file");
  if (file && typeof file === "object" && "name" in file) {
    return (file as File).name;
  }
  return undefined;
}
