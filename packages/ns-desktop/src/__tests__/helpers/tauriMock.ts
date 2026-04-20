// Phase 0.3 — Tauri IPC + event mocks for AudioRecorder tests.
//
// The existing AudioRecorder test mocks `@tauri-apps/api/core` and
// `@tauri-apps/api/event` with a bare `vi.fn()` per export, which
// handles invoke-returns-true but can't:
//
//   - Dispatch different values per command name (support-check true
//     AND chunk-read returns Uint8Array).
//   - Fire `meeting-recording-tick` events from the test so the UI's
//     elapsed-time listener actually runs.
//   - Verify an `unlisten` function was called on teardown (Phase 1.6
//     will lean on this to catch listener leaks).
//
// `MockTauriInvoke` + `MockTauriEventBus` fix all three. They're
// designed to be plugged in via `vi.mock` factories — see the
// `AudioRecorder.integration.test.tsx` harness (Phase 0.4) for an
// end-to-end wiring example.

export type CommandHandler<Args = unknown, Result = unknown> = (
  args: Args,
) => Result | Promise<Result>;

export interface InvokeCall {
  command: string;
  args: unknown;
}

export class MockTauriInvoke {
  private handlers = new Map<string, CommandHandler>();
  readonly calls: InvokeCall[] = [];

  /** Register a handler for a command. Returns `this` for chaining. */
  on<Args = unknown, Result = unknown>(
    command: string,
    handler: CommandHandler<Args, Result>,
  ): this {
    this.handlers.set(command, handler as CommandHandler);
    return this;
  }

  /** Convenience: always resolve this command to the given value. */
  resolve<Result = unknown>(command: string, value: Result): this {
    return this.on(command, () => value);
  }

  /** Convenience: always reject this command with the given error. */
  reject(command: string, error: unknown): this {
    return this.on(command, () => {
      throw error;
    });
  }

  /**
   * The invoke fn to pass into `vi.mock("@tauri-apps/api/core", ...)`.
   * Missing commands throw a loud error instead of silently returning
   * undefined — tests catch the mismatch immediately.
   */
  invoke = async (command: string, args?: unknown): Promise<unknown> => {
    this.calls.push({ command, args });
    const handler = this.handlers.get(command);
    if (!handler) {
      throw new Error(
        `MockTauriInvoke: no handler for "${command}". Register one via .on(${JSON.stringify(command)}, …).`,
      );
    }
    return handler(args);
  };

  callsFor(command: string): InvokeCall[] {
    return this.calls.filter((c) => c.command === command);
  }

  reset(): void {
    this.handlers.clear();
    this.calls.length = 0;
  }
}

type Subscriber = (envelope: { payload: unknown }) => void;

export class MockTauriEventBus {
  private subs = new Map<string, Set<Subscriber>>();
  /** Cumulative count of `listen()` calls, not the current active count. */
  totalListens = 0;
  /** Cumulative count of unlisten-fn invocations. */
  totalUnlistens = 0;

  /**
   * The listen fn to pass into `vi.mock("@tauri-apps/api/event", ...)`.
   * Matches the real signature: returns a Promise of an unlisten fn.
   */
  listen = async (event: string, cb: (envelope: { payload: unknown }) => void): Promise<() => void> => {
    this.totalListens++;
    if (!this.subs.has(event)) this.subs.set(event, new Set());
    const wrapper: Subscriber = cb;
    this.subs.get(event)!.add(wrapper);
    return () => {
      this.totalUnlistens++;
      this.subs.get(event)?.delete(wrapper);
    };
  };

  /** Fire an event to every active listener. */
  emit(event: string, payload: unknown): void {
    this.subs.get(event)?.forEach((cb) => cb({ payload }));
  }

  /** Number of currently-active listeners for an event. */
  listenerCount(event: string): number {
    return this.subs.get(event)?.size ?? 0;
  }

  /** Sum of active listeners across all events — useful for leak checks. */
  totalActiveListeners(): number {
    let sum = 0;
    for (const set of this.subs.values()) sum += set.size;
    return sum;
  }

  reset(): void {
    this.subs.clear();
    this.totalListens = 0;
    this.totalUnlistens = 0;
  }
}
