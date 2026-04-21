import { describe, it, expect, vi, afterEach } from "vitest";
import {
  MockMediaRecorder,
  installMediaRecorderMock,
  installMediaDevicesMock,
  createMockStream,
} from "./mediaRecorderMock.ts";
import { MockTauriInvoke, MockTauriEventBus } from "./tauriMock.ts";

describe("MockMediaRecorder", () => {
  afterEach(() => {
    // Each test that installs the mock uninstalls explicitly.
  });

  it("exposes MediaRecorder shape (state, mimeType, ondataavailable, onstop)", () => {
    const stream = createMockStream();
    const rec = new MockMediaRecorder(stream, { mimeType: "audio/webm" });
    expect(rec.state).toBe("inactive");
    expect(rec.mimeType).toBe("audio/webm");
    expect(rec.ondataavailable).toBeNull();
    expect(rec.onstop).toBeNull();
  });

  it("start() flips state to recording; stop() flips back and fires onstop", () => {
    const stream = createMockStream();
    const rec = new MockMediaRecorder(stream);
    const onstop = vi.fn();
    rec.onstop = onstop;

    rec.start();
    expect(rec.state).toBe("recording");

    rec.stop();
    expect(rec.state).toBe("inactive");
    expect(onstop).toHaveBeenCalledOnce();
  });

  it("emitData() fires ondataavailable with the blob", () => {
    const stream = createMockStream();
    const rec = new MockMediaRecorder(stream);
    const ondataavailable = vi.fn();
    rec.ondataavailable = ondataavailable;

    const blob = new Blob(["pcm"], { type: "audio/webm" });
    rec.emitData(blob);

    expect(ondataavailable).toHaveBeenCalledOnce();
    expect(ondataavailable.mock.calls[0][0].data).toBe(blob);
  });

  it("installMediaRecorderMock swaps globalThis.MediaRecorder and restores on uninstall", () => {
    const original = globalThis.MediaRecorder;
    const mock = installMediaRecorderMock();
    expect(globalThis.MediaRecorder).not.toBe(original);

    const stream = createMockStream();
    new (globalThis.MediaRecorder as unknown as new (s: unknown) => unknown)(stream);
    expect(mock.recorders).toHaveLength(1);

    mock.uninstall();
    expect(globalThis.MediaRecorder).toBe(original);
  });

  it("installMediaDevicesMock provides a spy-able audio track", async () => {
    const mock = installMediaDevicesMock();

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    expect(mock.getUserMediaSpy).toHaveBeenCalledOnce();

    // The track is spy-able so Phase 1.4 can assert "recording
    // teardown called track.stop()".
    const tracks = (stream as unknown as { getTracks: () => Array<{ stop: () => void }> }).getTracks();
    tracks[0].stop();
    expect(mock.stream.getTracks()[0].stop).toHaveBeenCalledOnce();

    mock.uninstall();
  });
});

describe("MockTauriInvoke", () => {
  it("routes commands to registered handlers", async () => {
    const invoke = new MockTauriInvoke()
      .resolve("check_meeting_recording_support", true)
      .resolve("start_meeting_recording", undefined);

    await expect(invoke.invoke("check_meeting_recording_support")).resolves.toBe(true);
    await expect(invoke.invoke("start_meeting_recording")).resolves.toBeUndefined();

    expect(invoke.callsFor("check_meeting_recording_support")).toHaveLength(1);
    expect(invoke.callsFor("start_meeting_recording")).toHaveLength(1);
  });

  it("throws a loud error for unregistered commands", async () => {
    const invoke = new MockTauriInvoke();

    await expect(invoke.invoke("not_registered")).rejects.toThrow(
      /no handler for "not_registered"/,
    );
  });

  it("supports per-call dynamic handlers (e.g. chunk counter)", async () => {
    let chunkIdx = 0;
    const invoke = new MockTauriInvoke().on("get_meeting_audio_chunk", () => {
      chunkIdx++;
      return Array.from(new Uint8Array([chunkIdx, 0, 0, 0]));
    });

    const a = (await invoke.invoke("get_meeting_audio_chunk")) as number[];
    const b = (await invoke.invoke("get_meeting_audio_chunk")) as number[];
    expect(a[0]).toBe(1);
    expect(b[0]).toBe(2);
  });
});

describe("MockTauriEventBus", () => {
  it("delivers emitted payloads to listeners", async () => {
    const bus = new MockTauriEventBus();
    const payloads: unknown[] = [];
    await bus.listen("meeting-recording-tick", (env) => payloads.push(env.payload));

    bus.emit("meeting-recording-tick", { elapsed_secs: 1.5 });
    bus.emit("meeting-recording-tick", { elapsed_secs: 3.0 });

    expect(payloads).toEqual([{ elapsed_secs: 1.5 }, { elapsed_secs: 3.0 }]);
  });

  it("unlisten-fn removes the subscriber and counts are tracked", async () => {
    const bus = new MockTauriEventBus();
    const cb = vi.fn();
    const unlisten = await bus.listen("x", cb);

    expect(bus.listenerCount("x")).toBe(1);
    expect(bus.totalListens).toBe(1);

    unlisten();
    expect(bus.listenerCount("x")).toBe(0);
    expect(bus.totalUnlistens).toBe(1);

    bus.emit("x", "after unlisten");
    expect(cb).not.toHaveBeenCalled();
  });

  it("totalActiveListeners aggregates across events — useful for leak checks", async () => {
    const bus = new MockTauriEventBus();
    await bus.listen("a", vi.fn());
    await bus.listen("a", vi.fn());
    await bus.listen("b", vi.fn());

    expect(bus.totalActiveListeners()).toBe(3);
  });
});
