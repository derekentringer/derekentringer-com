import { vi } from "vitest";

// Phase 0.3 — MediaRecorder mock for AudioRecorder tests.
//
// jsdom doesn't ship a `MediaRecorder` or `getUserMedia`, so any test
// that exercises the mic-only recording path in AudioRecorder needs
// both substituted. `installMediaRecorderMock()` swaps in a minimal
// class that preserves the event shape (`ondataavailable`, `onstop`,
// `state`, `mimeType`) and gives tests a `.emitData(blob)` / `.stop()`
// pair so they can drive the state machine deterministically.
//
// The accompanying `installMediaDevicesMock()` stubs
// `navigator.mediaDevices.getUserMedia` with a fake stream whose
// tracks have a spy-able `.stop()` — useful for verifying the
// recording code cleans up the stream on teardown (see Phase 1.4).
//
// Both installers return an uninstall fn; pair with `afterEach` so
// the jsdom globals are restored between tests.

interface MockTrack {
  stop: ReturnType<typeof vi.fn>;
  kind: string;
}

export interface MockMediaStream {
  getTracks: () => MockTrack[];
  getAudioTracks: () => MockTrack[];
}

export function createMockStream(): MockMediaStream {
  const track: MockTrack = { stop: vi.fn(), kind: "audio" };
  const tracks = [track];
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks,
  };
}

export class MockMediaRecorder extends EventTarget {
  state: "inactive" | "recording" | "paused" = "inactive";
  mimeType: string;
  stream: MockMediaStream;
  // `MediaRecorder` uses both the property-handler and EventTarget
  // APIs — AudioRecorder.tsx assigns `recorder.ondataavailable = ...`
  // and `recorder.onstop = ...`. We store + dispatch both.
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;

  constructor(stream: MockMediaStream, options?: { mimeType?: string }) {
    super();
    this.stream = stream;
    this.mimeType = options?.mimeType ?? "audio/webm";
  }

  start(_timesliceMs?: number): void {
    this.state = "recording";
  }

  stop(): void {
    this.state = "inactive";
    const event = new Event("stop");
    this.dispatchEvent(event);
    this.onstop?.(event);
  }

  pause(): void {
    this.state = "paused";
  }

  resume(): void {
    this.state = "recording";
  }

  /**
   * Test-only: fire `dataavailable` with the given blob. AudioRecorder
   * buffers these chunks and flushes them at stop; invoking this from
   * a test lets you simulate a fragment of the recorded stream.
   */
  emitData(data: Blob): void {
    const event = Object.assign(new Event("dataavailable"), { data });
    this.dispatchEvent(event);
    this.ondataavailable?.(event as unknown as { data: Blob });
  }

  /** Test-only: fire `error`. */
  emitError(error: Error): void {
    const event = Object.assign(new Event("error"), { error });
    this.dispatchEvent(event);
    this.onerror?.(event);
  }
}

export interface MediaRecorderMock {
  recorders: MockMediaRecorder[];
  uninstall: () => void;
}

/**
 * Swap in the mock `MediaRecorder` on `globalThis`. Every instance
 * the code under test constructs is captured into `recorders` so
 * tests can reach into it and fire events.
 */
export function installMediaRecorderMock(): MediaRecorderMock {
  const recorders: MockMediaRecorder[] = [];
  const original = (globalThis as unknown as { MediaRecorder?: typeof MediaRecorder })
    .MediaRecorder;

  function MockClass(this: unknown, stream: MockMediaStream, options?: { mimeType?: string }) {
    const r = new MockMediaRecorder(stream, options);
    recorders.push(r);
    return r;
  }
  (MockClass as unknown as { isTypeSupported: (mime: string) => boolean }).isTypeSupported = () =>
    true;

  (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder =
    MockClass as unknown as typeof MediaRecorder;

  return {
    recorders,
    uninstall: () => {
      if (original) {
        (globalThis as unknown as { MediaRecorder: typeof MediaRecorder }).MediaRecorder =
          original;
      } else {
        delete (globalThis as unknown as { MediaRecorder?: unknown }).MediaRecorder;
      }
    },
  };
}

export interface MediaDevicesMock {
  stream: MockMediaStream;
  getUserMediaSpy: ReturnType<typeof vi.fn>;
  uninstall: () => void;
}

/**
 * Swap in `navigator.mediaDevices.getUserMedia` with a fake that
 * resolves to a spy-able audio track. Returns the shared stream so
 * tests can reuse it in assertions (e.g. "the recording code called
 * `track.stop()` on teardown").
 */
export function installMediaDevicesMock(): MediaDevicesMock {
  const stream = createMockStream();
  const getUserMediaSpy = vi.fn().mockResolvedValue(stream);

  const original = (navigator as unknown as { mediaDevices?: MediaDevices }).mediaDevices;
  (navigator as unknown as { mediaDevices: unknown }).mediaDevices = {
    getUserMedia: getUserMediaSpy,
  };

  return {
    stream,
    getUserMediaSpy,
    uninstall: () => {
      (navigator as unknown as { mediaDevices: unknown }).mediaDevices = original;
    },
  };
}
