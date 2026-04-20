import { render, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installMediaDevicesMock,
  installMediaRecorderMock,
  type MediaRecorderMock,
  type MediaDevicesMock,
} from "./helpers/mediaRecorderMock.ts";
import { MockTauriEventBus, MockTauriInvoke } from "./helpers/tauriMock.ts";

// Phase 0.4 — happy-path integration test for the AudioRecorder
// mic-only flow. Drives the component through the full state
// machine: trigger → getUserMedia → MediaRecorder.start → emit
// dataavailable → call the external onStop → transcribeAudio →
// onNoteCreated → cleanup. Uses the Phase 0.3 helpers for both
// MediaRecorder and Tauri IPC so every event fires under test
// control.
//
// Meeting-mode happy path is intentionally out of scope — it
// exercises additional Rust command dispatch (`start_meeting_recording`,
// `get_meeting_audio_chunk`, `stop_meeting_recording`) and an
// independent live-chunk loop. Phase 3 test coverage will add it.

const invokeBus = new MockTauriInvoke();
const eventBus = new MockTauriEventBus();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: unknown) => invokeBus.invoke(command, args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, cb: (env: { payload: unknown }) => void) =>
    eventBus.listen(event, cb),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: vi.fn(),
}));

const mockTranscribeAudio = vi.fn();
const mockTranscribeChunk = vi.fn();
vi.mock("../api/ai.ts", () => ({
  transcribeAudio: (...args: unknown[]) => mockTranscribeAudio(...args),
  transcribeChunk: (...args: unknown[]) => mockTranscribeChunk(...args),
}));

const mockApiFetch = vi.fn();
vi.mock("../api/client.ts", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const { AudioRecorder } = await import("../components/AudioRecorder.tsx");

describe("AudioRecorder — mic-only happy path", () => {
  let mediaRecorder: MediaRecorderMock;
  let mediaDevices: MediaDevicesMock;

  beforeEach(() => {
    invokeBus.reset();
    eventBus.reset();
    // Meeting-support check runs on mount. Returning false forces
    // the component to treat meeting mode as unavailable, so a
    // trigger always routes through handleMicRecord.
    invokeBus.resolve("check_meeting_recording_support", false);

    mediaRecorder = installMediaRecorderMock();
    mediaDevices = installMediaDevicesMock();

    mockTranscribeAudio.mockReset();
    mockTranscribeChunk.mockReset().mockResolvedValue({ text: "", chunkIndex: 0 });
    mockApiFetch.mockReset().mockResolvedValue({ ok: true, json: async () => ({}) });
  });

  afterEach(() => {
    mediaRecorder.uninstall();
    mediaDevices.uninstall();
  });

  it("trigger → chunks → stop → transcribe → onNoteCreated", async () => {
    const onNoteCreated = vi.fn();
    const onError = vi.fn();
    const recordingStates: Array<{ state: string; onStop: () => void } | null> = [];
    const onRecordingStateChange = vi.fn((s: { state: string; onStop: () => void } | null) => {
      recordingStates.push(s);
    });

    const note = { id: "note-1", title: "Test", content: "hello world" };
    mockTranscribeAudio.mockResolvedValue({ note });

    const { rerender } = render(
      <AudioRecorder
        defaultMode="memo"
        recordingSource="microphone"
        onRecordingSourceChange={vi.fn()}
        onNoteCreated={onNoteCreated}
        onError={onError}
        onRecordingStateChange={onRecordingStateChange}
        triggerMode="memo"
        triggerKey={0}
      />,
    );

    // Fire the trigger prop change so the component kicks off recording.
    await act(async () => {
      rerender(
        <AudioRecorder
          defaultMode="memo"
          recordingSource="microphone"
          onRecordingSourceChange={vi.fn()}
          onNoteCreated={onNoteCreated}
          onError={onError}
          onRecordingStateChange={onRecordingStateChange}
          triggerMode="memo"
          triggerKey={1}
        />,
      );
    });

    // The trigger-driven handler fires inside `requestAnimationFrame`.
    // Advance a frame, then wait for MediaRecorder construction.
    await waitFor(() => {
      expect(mediaDevices.getUserMediaSpy).toHaveBeenCalled();
      expect(mediaRecorder.recorders.length).toBeGreaterThan(0);
    });

    // The *main* mic recorder is the first one constructed; the
    // component also spawns an independent chunk recorder from the
    // same stream — we don't care about that here.
    const mainRecorder = mediaRecorder.recorders[0];
    expect(mainRecorder.state).toBe("recording");

    // Recording-state callback gave us an onStop handle.
    await waitFor(() => {
      const recording = recordingStates.find((s) => s?.state === "recording");
      expect(recording).toBeTruthy();
    });
    const recording = recordingStates.find((s) => s?.state === "recording");
    expect(recording).toBeTruthy();

    // Simulate a couple of `dataavailable` emissions on the main
    // recorder — Chunks accumulate into the final blob at stop.
    await act(async () => {
      mainRecorder.emitData(new Blob(["chunk-a"], { type: "audio/webm" }));
      mainRecorder.emitData(new Blob(["chunk-b"], { type: "audio/webm" }));
    });

    // Stop from the outside (how the RecordingBar fires it).
    await act(async () => {
      recording!.onStop();
    });

    // The main recorder's onstop handler awaits transcribeAudio, so
    // let the pending microtasks flush before asserting.
    await waitFor(() => {
      expect(mockTranscribeAudio).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(onNoteCreated).toHaveBeenCalledWith(note);
    });

    expect(onError).not.toHaveBeenCalled();
  });

  // Phase 1.5 — getUserMedia rejection must run cleanup before
  // surfacing the error, so no mic track, timer, or MediaRecorder
  // leaks from a failed mic-start.
  it("getUserMedia rejection cleans up and reports onError", async () => {
    const onNoteCreated = vi.fn();
    const onError = vi.fn();
    const onRecordingStateChange = vi.fn();

    // Replace the getUserMedia shim with one that rejects.
    // The component branches on DOMException + "NotAllowedError" for
    // the specific mic-denied message, so reject with a real
    // DOMException (jsdom ships one) rather than a generic Error.
    mediaDevices.getUserMediaSpy.mockRejectedValueOnce(
      new DOMException("denied", "NotAllowedError"),
    );

    const { rerender } = render(
      <AudioRecorder
        defaultMode="memo"
        recordingSource="microphone"
        onRecordingSourceChange={vi.fn()}
        onNoteCreated={onNoteCreated}
        onError={onError}
        onRecordingStateChange={onRecordingStateChange}
        triggerMode="memo"
        triggerKey={0}
      />,
    );

    await act(async () => {
      rerender(
        <AudioRecorder
          defaultMode="memo"
          recordingSource="microphone"
          onRecordingSourceChange={vi.fn()}
          onNoteCreated={onNoteCreated}
          onError={onError}
          onRecordingStateChange={onRecordingStateChange}
          triggerMode="memo"
          triggerKey={1}
        />,
      );
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalled();
    });

    // No MediaRecorder ever got constructed because getUserMedia
    // rejected before it.
    expect(mediaRecorder.recorders).toHaveLength(0);
    // Permission-denied branch surfaces the specific message.
    expect(onError).toHaveBeenCalledWith("Microphone permission denied");
  });

  // Phase 2.6 — cleanup() re-entrance guard. Double-calling
  // cleanup (e.g., stop handler fires cleanup, then unmount fires
  // it again) must be a no-op on the second call, so track.stop()
  // and tickUnlisten aren't re-invoked on already-released
  // resources. We exercise this via a full record → stop → unmount
  // cycle and assert track.stop is called exactly once per track.
  it("cleanup is idempotent across stop + unmount", async () => {
    const onNoteCreated = vi.fn();
    const onError = vi.fn();
    const recordingHandles: Array<{ state: string; onStop: () => void } | null> = [];

    mockTranscribeAudio.mockResolvedValue({ note: { id: "n", title: "", content: "" } });

    const { rerender, unmount } = render(
      <AudioRecorder
        defaultMode="memo"
        recordingSource="microphone"
        onRecordingSourceChange={vi.fn()}
        onNoteCreated={onNoteCreated}
        onError={onError}
        onRecordingStateChange={(s) => recordingHandles.push(s)}
        triggerMode="memo"
        triggerKey={0}
      />,
    );

    await act(async () => {
      rerender(
        <AudioRecorder
          defaultMode="memo"
          recordingSource="microphone"
          onRecordingSourceChange={vi.fn()}
          onNoteCreated={onNoteCreated}
          onError={onError}
          onRecordingStateChange={(s) => recordingHandles.push(s)}
          triggerMode="memo"
          triggerKey={1}
        />,
      );
    });

    await waitFor(() => {
      const rec = recordingHandles.find((s) => s?.state === "recording");
      expect(rec).toBeTruthy();
    });
    const recording = recordingHandles.find((s) => s?.state === "recording")!;

    // Stop — first cleanup call happens inside the mic onstop.
    await act(async () => {
      recording.onStop();
    });
    await waitFor(() => {
      expect(mockTranscribeAudio).toHaveBeenCalled();
    });

    // Unmount — fires cleanup AGAIN. The guard must make it a no-op.
    await act(async () => {
      unmount();
    });

    // track.stop was called exactly once by the first cleanup; the
    // second cleanup must not call it again.
    const micTrack = mediaDevices.stream.getTracks()[0];
    expect(micTrack.stop).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  // Phase 2.5 — chunkRecorderShouldRestartRef must be set false
  // synchronously before the chunk recorder's .stop() fires, so the
  // onstop handler never spawns another chunk recorder after the
  // final stop. This pins the restart-on-stop race (handleStop at
  // line 509-514) closed.
  it("stop does not trigger a chunk recorder restart", async () => {
    const onNoteCreated = vi.fn();
    const onError = vi.fn();
    const recordingHandles: Array<{ state: string; onStop: () => void } | null> = [];

    mockTranscribeAudio.mockResolvedValue({ note: { id: "n", title: "", content: "" } });

    const { rerender } = render(
      <AudioRecorder
        defaultMode="memo"
        recordingSource="microphone"
        onRecordingSourceChange={vi.fn()}
        onNoteCreated={onNoteCreated}
        onError={onError}
        onRecordingStateChange={(s) => recordingHandles.push(s)}
        triggerMode="memo"
        triggerKey={0}
      />,
    );

    await act(async () => {
      rerender(
        <AudioRecorder
          defaultMode="memo"
          recordingSource="microphone"
          onRecordingSourceChange={vi.fn()}
          onNoteCreated={onNoteCreated}
          onError={onError}
          onRecordingStateChange={(s) => recordingHandles.push(s)}
          triggerMode="memo"
          triggerKey={1}
        />,
      );
    });

    // Main mic recorder + the chunk recorder spawned by
    // startMicChunkRecorder. Wait for both.
    await waitFor(() => {
      expect(mediaRecorder.recorders.length).toBeGreaterThanOrEqual(2);
    });
    const recordersBeforeStop = mediaRecorder.recorders.length;

    const recording = recordingHandles.find((s) => s?.state === "recording");
    expect(recording).toBeTruthy();

    // Invoke stop — chunk recorder's onstop will fire and check
    // `chunkRecorderShouldRestartRef.current`. handleStop sets it
    // false *before* calling .stop(), so the handler must see false
    // and NOT call startMicChunkRecorder again.
    await act(async () => {
      recording!.onStop();
    });

    // Allow any queued microtasks (onstop handlers) to flush.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mediaRecorder.recorders).toHaveLength(recordersBeforeStop);
  });

  // Phase 1.4 — unmount during an active recording must stop the
  // MediaRecorder (not just null the ref) and release the mic stream
  // tracks. Without the cleanup fix, the MediaRecorder stays in the
  // "recording" state indefinitely and the mic track is never
  // released, which on real hardware keeps the mic TCC indicator lit
  // and eventually triggers WebKit/CoreAudio warnings.
  it("unmount during recording stops MediaRecorder and releases stream", async () => {
    const onNoteCreated = vi.fn();
    const onError = vi.fn();
    const onRecordingStateChange = vi.fn();

    mockTranscribeAudio.mockResolvedValue({ note: { id: "n", title: "", content: "" } });

    const { rerender, unmount } = render(
      <AudioRecorder
        defaultMode="memo"
        recordingSource="microphone"
        onRecordingSourceChange={vi.fn()}
        onNoteCreated={onNoteCreated}
        onError={onError}
        onRecordingStateChange={onRecordingStateChange}
        triggerMode="memo"
        triggerKey={0}
      />,
    );

    await act(async () => {
      rerender(
        <AudioRecorder
          defaultMode="memo"
          recordingSource="microphone"
          onRecordingSourceChange={vi.fn()}
          onNoteCreated={onNoteCreated}
          onError={onError}
          onRecordingStateChange={onRecordingStateChange}
          triggerMode="memo"
          triggerKey={1}
        />,
      );
    });

    await waitFor(() => {
      expect(mediaRecorder.recorders.length).toBeGreaterThan(0);
    });

    const mainRecorder = mediaRecorder.recorders[0];
    expect(mainRecorder.state).toBe("recording");

    // Unmount mid-recording. cleanup() fires via the useEffect
    // teardown and should stop the recorder + mic tracks.
    await act(async () => {
      unmount();
    });

    expect(mainRecorder.state).toBe("inactive");
    const micTrack = mediaDevices.stream.getTracks()[0];
    expect(micTrack.stop).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});

// Phase 2.1 — double-call guard on handleMeetingStop. The re-entry
// guard at the top of the function (`if (!isMeetingRef.current)
// return; isMeetingRef.current = false;`) runs synchronously before
// any await, so a second Stop click (rapid) while the first
// `stop_meeting_recording` invoke is still in flight must be a
// no-op: Rust must only see a single `stop_meeting_recording` call.
describe("AudioRecorder — meeting-mode stop re-entry guard", () => {
  let mediaRecorder: MediaRecorderMock;
  let mediaDevices: MediaDevicesMock;

  beforeEach(() => {
    invokeBus.reset();
    eventBus.reset();
    mediaRecorder = installMediaRecorderMock();
    mediaDevices = installMediaDevicesMock();
    mockTranscribeAudio.mockReset();
    mockTranscribeChunk.mockReset().mockResolvedValue({ text: "", chunkIndex: 0 });
    mockApiFetch.mockReset().mockResolvedValue({ ok: true, json: async () => ({}) });
  });

  afterEach(() => {
    mediaRecorder.uninstall();
    mediaDevices.uninstall();
  });

  it("rapid double onStop invokes stop_meeting_recording exactly once", async () => {
    // Make stop_meeting_recording deliberately slow so a second Stop
    // click lands during its await window. We use a manually-resolved
    // promise to control the timing precisely.
    let resolveStop: ((bytes: number[]) => void) | null = null;
    const slowStop = new Promise<number[]>((resolve) => {
      resolveStop = resolve;
    });

    invokeBus
      .resolve("check_meeting_recording_support", true)
      .resolve("start_meeting_recording", undefined)
      .resolve("get_meeting_audio_chunk", [])
      .on("stop_meeting_recording", () => slowStop);

    mockTranscribeAudio.mockResolvedValue({ note: { id: "n", title: "", content: "" } });

    const recordingHandles: Array<{ state: string; onStop: () => void } | null> = [];
    const onRecordingStateChange = (s: { state: string; onStop: () => void } | null) => {
      recordingHandles.push(s);
    };

    const { rerender } = render(
      <AudioRecorder
        defaultMode="meeting"
        recordingSource="meeting"
        onRecordingSourceChange={vi.fn()}
        onNoteCreated={vi.fn()}
        onError={vi.fn()}
        onRecordingStateChange={onRecordingStateChange}
        triggerMode="meeting"
        triggerKey={0}
      />,
    );

    await act(async () => {
      rerender(
        <AudioRecorder
          defaultMode="meeting"
          recordingSource="meeting"
          onRecordingSourceChange={vi.fn()}
          onNoteCreated={vi.fn()}
          onError={vi.fn()}
          onRecordingStateChange={onRecordingStateChange}
          triggerMode="meeting"
          triggerKey={1}
        />,
      );
    });

    // Wait until the component advertises the recording state so we
    // have an onStop handle to call.
    await waitFor(() => {
      const rec = recordingHandles.find((s) => s?.state === "recording");
      expect(rec).toBeTruthy();
    });
    const recording = recordingHandles.find((s) => s?.state === "recording")!;

    // Fire two onStop calls back-to-back, before the first one's
    // `stop_meeting_recording` invoke resolves.
    await act(async () => {
      recording.onStop();
      recording.onStop();
    });

    expect(invokeBus.callsFor("stop_meeting_recording")).toHaveLength(1);

    // Let the stop promise resolve so the pending await unwinds cleanly.
    resolveStop!([]);
    await act(async () => {
      await Promise.resolve();
    });
  });
});

// Phase 1.5 — meeting-mode start failure must run cleanup before
// surfacing the error, so no chunk timer / tick listener leaks from
// a failed `start_meeting_recording`.
describe("AudioRecorder — meeting-mode failure cleanup", () => {
  let mediaRecorder: MediaRecorderMock;
  let mediaDevices: MediaDevicesMock;

  beforeEach(() => {
    invokeBus.reset();
    eventBus.reset();
    // Meeting support on; the trigger routes through handleMeetingRecord.
    invokeBus.resolve("check_meeting_recording_support", true);
    // `invoke("start_meeting_recording")` rejects — the whole setup should roll back.
    invokeBus.reject("start_meeting_recording", new Error("tap unavailable"));

    mediaRecorder = installMediaRecorderMock();
    mediaDevices = installMediaDevicesMock();

    mockTranscribeAudio.mockReset();
    mockTranscribeChunk.mockReset().mockResolvedValue({ text: "", chunkIndex: 0 });
    mockApiFetch.mockReset().mockResolvedValue({ ok: true, json: async () => ({}) });
  });

  afterEach(() => {
    mediaRecorder.uninstall();
    mediaDevices.uninstall();
  });

  // Phase 1.6 — happy-path meeting start registers the tick
  // listener, and unmount during recording must run the unlisten so
  // the MockTauriEventBus ends with zero active listeners.
  it("unmount during meeting recording calls unlisten for tick events", async () => {
    // Override the rejection from beforeEach to let the start
    // succeed, then register the other commands the meeting path
    // touches (chunk fetch never fires because we unmount first).
    invokeBus.reset();
    invokeBus
      .resolve("check_meeting_recording_support", true)
      .resolve("start_meeting_recording", undefined)
      .resolve("get_meeting_audio_chunk", []);

    const onError = vi.fn();

    const { rerender, unmount } = render(
      <AudioRecorder
        defaultMode="meeting"
        recordingSource="meeting"
        onRecordingSourceChange={vi.fn()}
        onNoteCreated={vi.fn()}
        onError={onError}
        onRecordingStateChange={vi.fn()}
        triggerMode="meeting"
        triggerKey={0}
      />,
    );

    await act(async () => {
      rerender(
        <AudioRecorder
          defaultMode="meeting"
          recordingSource="meeting"
          onRecordingSourceChange={vi.fn()}
          onNoteCreated={vi.fn()}
          onError={onError}
          onRecordingStateChange={vi.fn()}
          triggerMode="meeting"
          triggerKey={1}
        />,
      );
    });

    // Wait for the tick listener to be registered by the component.
    await waitFor(() => {
      expect(eventBus.listenerCount("meeting-recording-tick")).toBe(1);
    });

    // Unmount mid-recording; cleanup should invoke the unlisten fn.
    await act(async () => {
      unmount();
    });

    expect(eventBus.listenerCount("meeting-recording-tick")).toBe(0);
    expect(eventBus.totalActiveListeners()).toBe(0);
    expect(eventBus.totalUnlistens).toBeGreaterThanOrEqual(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("start_meeting_recording rejection runs cleanup, no listener leaks", async () => {
    const onError = vi.fn();

    const { rerender } = render(
      <AudioRecorder
        defaultMode="meeting"
        recordingSource="meeting"
        onRecordingSourceChange={vi.fn()}
        onNoteCreated={vi.fn()}
        onError={onError}
        onRecordingStateChange={vi.fn()}
        triggerMode="meeting"
        triggerKey={0}
      />,
    );

    await act(async () => {
      rerender(
        <AudioRecorder
          defaultMode="meeting"
          recordingSource="meeting"
          onRecordingSourceChange={vi.fn()}
          onNoteCreated={vi.fn()}
          onError={onError}
          onRecordingStateChange={vi.fn()}
          triggerMode="meeting"
          triggerKey={1}
        />,
      );
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalled();
    });

    // The listen() for meeting-recording-tick happens AFTER
    // start_meeting_recording succeeds, so a failed start should
    // leave zero active tick listeners. Also verifies cleanup closed
    // any listeners that were opened (none here, but the invariant
    // is testable).
    expect(eventBus.listenerCount("meeting-recording-tick")).toBe(0);
  });
});
