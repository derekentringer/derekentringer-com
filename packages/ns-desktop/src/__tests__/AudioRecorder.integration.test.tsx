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
const mockStructureAndCreateNote = vi.fn();
vi.mock("../api/ai.ts", () => ({
  transcribeAudio: (...args: unknown[]) => mockTranscribeAudio(...args),
  transcribeChunk: (...args: unknown[]) => mockTranscribeChunk(...args),
  structureAndCreateNote: (...args: unknown[]) => mockStructureAndCreateNote(...args),
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
    mockStructureAndCreateNote.mockReset();
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

  // Phase 4.2 — chunk upload is fire-and-forget. A slow
  // `transcribeChunk` must NOT hold onstop open or block a second
  // chunk from starting. We stall the first chunk's Whisper response
  // with a manually-controlled promise and fire a second chunk while
  // the first is still pending; both must register calls to
  // `transcribeChunk` independently.
  it("slow chunk upload does not block the next chunk's upload", async () => {
    const onNoteCreated = vi.fn();
    const onError = vi.fn();

    // First chunk: never resolves (stalled). Second chunk: resolves.
    let resolveFirst: ((v: { text: string; chunkIndex: number }) => void) | null = null;
    const firstPending = new Promise<{ text: string; chunkIndex: number }>((res) => {
      resolveFirst = res;
    });
    mockTranscribeChunk
      .mockReset()
      .mockReturnValueOnce(firstPending)
      .mockResolvedValue({ text: "second", chunkIndex: 1 });

    mockTranscribeAudio.mockResolvedValue({ note: { id: "n", title: "", content: "" } });

    const { rerender } = render(
      <AudioRecorder
        defaultMode="memo"
        recordingSource="microphone"
        onRecordingSourceChange={vi.fn()}
        onNoteCreated={onNoteCreated}
        onError={onError}
        onRecordingStateChange={vi.fn()}
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
          onRecordingStateChange={vi.fn()}
          triggerMode="memo"
          triggerKey={1}
        />,
      );
    });

    await waitFor(() => {
      expect(mediaRecorder.recorders.length).toBeGreaterThan(0);
    });

    // Grab the first chunk recorder (index 1 — the second recorder
    // constructed; index 0 is the main mic recorder).
    const chunkRec1 = mediaRecorder.recorders[1];

    // First chunk: feed data + stop. transcribeChunk is stalled, but
    // the onstop handler should return synchronously (no await) and
    // immediately spawn the next chunk recorder.
    await act(async () => {
      chunkRec1.emitData(new Blob([new Uint8Array(2048)], { type: "audio/webm" }));
      chunkRec1.stop();
    });

    // Before the first chunk resolves, a new chunk recorder should
    // already exist (restart-on-stop).
    await waitFor(() => {
      expect(mediaRecorder.recorders.length).toBeGreaterThanOrEqual(3);
    });

    // Fire the second chunk while the first is still pending.
    const chunkRec2 = mediaRecorder.recorders[2];
    await act(async () => {
      chunkRec2.emitData(new Blob([new Uint8Array(2048)], { type: "audio/webm" }));
      chunkRec2.stop();
    });

    // Both transcribeChunk calls should have been invoked — the
    // second did NOT wait for the first to finish.
    await waitFor(() => {
      expect(mockTranscribeChunk).toHaveBeenCalledTimes(2);
    });

    // Resolve the first so the promise doesn't leak.
    resolveFirst!({ text: "first", chunkIndex: 0 });
    await act(async () => {
      await Promise.resolve();
    });

    expect(onError).not.toHaveBeenCalled();
  });

  // Phase 5.6 — `transcribeAudio` failure (Whisper unreachable, or
  // API-level failure like quota-exceeded). Must surface `onError`
  // and leave the recording state cleaned (no hung UI). This pins
  // the final-transcribe error path that 3.5 added on the server
  // side: the client must gracefully handle the 502 response.
  it("transcribeAudio rejection surfaces onError and cleans up", async () => {
    const onNoteCreated = vi.fn();
    const onError = vi.fn();
    const recordingHandles: Array<{ state: string; onStop: () => void } | null> = [];

    mockTranscribeAudio.mockRejectedValueOnce(new Error("Whisper unreachable"));

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

    await waitFor(() => {
      expect(mediaRecorder.recorders.length).toBeGreaterThan(0);
    });

    const recording = recordingHandles.find((s) => s?.state === "recording")!;
    await act(async () => {
      recording.onStop();
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("Whisper unreachable");
    });

    // No note was created; the parent sees the error instead.
    expect(onNoteCreated).not.toHaveBeenCalled();

    // State chain flowed back to idle (handleMicRecord's onstop
    // `finally` block resets state). The recording-state callback
    // received a `null` state after the error.
    await waitFor(() => {
      expect(
        recordingHandles.some((s) => s === null),
      ).toBe(true);
    });
  });

  // Phase 3.6 — chunk transcription failure is non-fatal. A
  // `transcribeChunk` rejection just logs a warning and skips that
  // index in `transcriptChunksRef`; the full-audio transcribe on
  // stop still runs and the note is still returned to the parent.
  it("chunk transcription failure does not block final note creation", async () => {
    const onNoteCreated = vi.fn();
    const onError = vi.fn();
    const recordingHandles: Array<{ state: string; onStop: () => void } | null> = [];

    // First chunk fails, subsequent calls return empty (none arrive
    // but the mock has to return something).
    mockTranscribeChunk
      .mockReset()
      .mockRejectedValueOnce(new Error("Whisper 429"))
      .mockResolvedValue({ text: "", chunkIndex: 0 });

    const note = { id: "note-chunk-fail", title: "T", content: "c" };
    mockTranscribeAudio.mockResolvedValue({ note });

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

    await waitFor(() => {
      expect(mediaRecorder.recorders.length).toBeGreaterThan(0);
    });

    // Fire a chunk on the chunk recorder — triggers transcribeChunk
    // which is mocked to reject. The component must swallow.
    const chunkRecorder = mediaRecorder.recorders[1];
    await act(async () => {
      chunkRecorder.emitData(new Blob([new Uint8Array(2048)], { type: "audio/webm" }));
      chunkRecorder.stop();
    });
    await waitFor(() => {
      expect(mockTranscribeChunk).toHaveBeenCalled();
    });

    // Stop recording. Full-audio transcribeAudio is mocked to succeed.
    const recording = recordingHandles.find((s) => s?.state === "recording")!;
    await act(async () => {
      recording.onStop();
    });

    await waitFor(() => {
      expect(onNoteCreated).toHaveBeenCalled();
    });

    // Even though the chunk failed, the note was created from the
    // full-audio transcribe. No onError bubbled from the chunk failure.
    expect(onNoteCreated).toHaveBeenCalledWith(expect.objectContaining({ id: "note-chunk-fail" }));
    expect(onError).not.toHaveBeenCalled();
  });

  // Phase 3.2 — live-transcript PATCH race. The note is created by
  // `transcribeAudio` first; the PATCH that attaches the live
  // transcript runs after and is best-effort. Two invariants:
  //   1. PATCH failure (non-2xx) does NOT prevent the note from
  //      being handed to the parent.
  //   2. `result.note.transcript` is only mirrored into the in-memory
  //      note when the server actually persisted it (response.ok) —
  //      otherwise the UI would show a transcript that isn't in the
  //      database.
  it("PATCH failure still returns the note without mirroring transcript", async () => {
    const onNoteCreated = vi.fn();
    const onError = vi.fn();
    const recordingHandles: Array<{ state: string; onStop: () => void } | null> = [];

    // Emit some live-transcript chunks so capturedTranscript is non-empty
    // and the PATCH branch actually fires.
    mockTranscribeChunk
      .mockReset()
      .mockResolvedValueOnce({ text: "chunk-a", chunkIndex: 0 })
      .mockResolvedValue({ text: "", chunkIndex: 0 });

    const note = { id: "note-patch-fail", title: "T", content: "c" };
    mockTranscribeAudio.mockResolvedValue({ note });

    // PATCH returns 500 (ok: false). Note creation itself still succeeds.
    mockApiFetch.mockReset().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

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

    await waitFor(() => {
      expect(mediaRecorder.recorders.length).toBeGreaterThan(0);
    });

    // Feed a chunk to the chunk recorder so `transcribeChunk` is
    // invoked and populates transcriptChunksRef.
    const chunkRecorder = mediaRecorder.recorders[1];
    await act(async () => {
      chunkRecorder.emitData(new Blob([new Uint8Array(2048)], { type: "audio/webm" }));
      chunkRecorder.stop();
    });
    await waitFor(() => {
      expect(mockTranscribeChunk).toHaveBeenCalled();
    });

    // Trigger stop — this fires transcribeAudio then PATCH.
    const recording = recordingHandles.find((s) => s?.state === "recording")!;
    await act(async () => {
      recording.onStop();
    });

    await waitFor(() => {
      expect(onNoteCreated).toHaveBeenCalled();
    });

    // PATCH was called with the transcript payload.
    const patchCall = mockApiFetch.mock.calls.find(
      (args) => typeof args[0] === "string" && args[0].includes("/notes/note-patch-fail"),
    );
    expect(patchCall).toBeDefined();

    // Note was still returned to the parent despite PATCH failing.
    const receivedNote = onNoteCreated.mock.calls[0][0];
    expect(receivedNote.id).toBe("note-patch-fail");

    // `transcript` field must NOT be populated on the in-memory note
    // because the server didn't persist it. UI must not show a
    // transcript that only exists client-side.
    expect(receivedNote.transcript).toBeUndefined();

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
    mockStructureAndCreateNote.mockReset();
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
    mockStructureAndCreateNote.mockReset();
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

// Meeting-mode transcription path. Phase 4.1 (dedup: skip full
// Whisper when live transcript is substantive) was reverted because
// the live transcript misses trailing audio + in-flight chunk
// responses, producing truncated notes. The canonical path is now
// always `transcribeAudio(blob)` on the full mixed WAV; live chunks
// are kept as a best-effort preview and PATCHed onto the note.
describe("AudioRecorder — meeting-mode transcription", () => {
  let mediaRecorder: MediaRecorderMock;
  let mediaDevices: MediaDevicesMock;

  beforeEach(() => {
    invokeBus.reset();
    eventBus.reset();
    invokeBus.resolve("check_meeting_recording_support", true);
    mediaRecorder = installMediaRecorderMock();
    mediaDevices = installMediaDevicesMock();
    mockTranscribeAudio.mockReset();
    mockTranscribeChunk.mockReset().mockResolvedValue({ text: "", chunkIndex: 0 });
    mockStructureAndCreateNote.mockReset();
    mockApiFetch.mockReset().mockResolvedValue({ ok: true, json: async () => ({}) });
  });

  afterEach(() => {
    mediaRecorder.uninstall();
    mediaDevices.uninstall();
    vi.useRealTimers();
  });

  // Phase 5.2 — full meeting-mode flow: N chunk-timer ticks → live
  // transcript accumulates → stop → full-audio transcribeAudio
  // creates the note → the live transcript is PATCHed onto the note.
  it("records 3 chunks in order, assembles live transcript, creates note via full Whisper", async () => {
    let chunkCallCount = 0;
    invokeBus
      .resolve("start_meeting_recording", undefined)
      .on("get_meeting_audio_chunk", () => {
        chunkCallCount++;
        // Every chunk fetch returns non-empty bytes so transcribeChunk
        // fires. After 3 chunks, return empty so the chunk counter
        // plateaus at 3 even if more ticks fire in the test window.
        return chunkCallCount <= 3 ? Array.from(new Uint8Array(2048)) : [];
      })
      .resolve("stop_meeting_recording", []);

    // Each chunk returns a unique transcribed text at its claimed index.
    // The stop path will also fire ONE more chunk as the final-chunk
    // flush (see handleMeetingStop) — we mock an empty 4th response
    // so it doesn't add content but also doesn't explode.
    mockTranscribeChunk
      .mockReset()
      .mockResolvedValueOnce({ text: "chunk zero text ".repeat(5), chunkIndex: 0 })
      .mockResolvedValueOnce({ text: "chunk one text ".repeat(5), chunkIndex: 1 })
      .mockResolvedValueOnce({ text: "chunk two text ".repeat(5), chunkIndex: 2 })
      .mockResolvedValue({ text: "", chunkIndex: 3 });

    const note = { id: "note-full-flow", title: "T", content: "c" };
    // Live transcript > 100 chars → dedup path via structureAndCreateNote.
    mockStructureAndCreateNote.mockResolvedValue({ note });

    const onNoteCreated = vi.fn();
    const recordingHandles: Array<{ state: string; onStop: () => void } | null> = [];

    vi.useFakeTimers();
    const { rerender } = render(
      <AudioRecorder
        defaultMode="meeting"
        recordingSource="meeting"
        onRecordingSourceChange={vi.fn()}
        onNoteCreated={onNoteCreated}
        onError={vi.fn()}
        onRecordingStateChange={(s) => recordingHandles.push(s)}
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
          onNoteCreated={onNoteCreated}
          onError={vi.fn()}
          onRecordingStateChange={(s) => recordingHandles.push(s)}
          triggerMode="meeting"
          triggerKey={1}
        />,
      );
    });

    // Advance 3× the 30s chunk interval so three chunks fire.
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_100);
        // Flush the invoke + transcribeChunk promise chain for this tick.
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    // All three chunks should have been transcribed.
    expect(mockTranscribeChunk).toHaveBeenCalledTimes(3);

    const recording = recordingHandles.find((s) => s?.state === "recording")!;
    await act(async () => {
      recording.onStop();
      await vi.advanceTimersByTimeAsync(100);
      await Promise.resolve();
      await Promise.resolve();
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(onNoteCreated).toHaveBeenCalled();
    });

    // Dedup fast-path (Phase 4.1 re-enabled after final-chunk flush):
    // live transcript > 100 chars → `structureAndCreateNote` handles
    // the note creation with the assembled transcript; full-audio
    // `transcribeAudio` is skipped entirely, saving a Whisper call.
    expect(mockStructureAndCreateNote).toHaveBeenCalledTimes(1);
    expect(mockTranscribeAudio).not.toHaveBeenCalled();

    // The transcript argument handed to structureAndCreateNote must
    // be all three chunks concatenated in index order.
    const [transcriptArg] = mockStructureAndCreateNote.mock.calls[0];
    expect(transcriptArg).toContain("chunk zero text");
    expect(transcriptArg).toContain("chunk one text");
    expect(transcriptArg).toContain("chunk two text");
    const i0 = transcriptArg.indexOf("chunk zero");
    const i1 = transcriptArg.indexOf("chunk one");
    const i2 = transcriptArg.indexOf("chunk two");
    expect(i0).toBeLessThan(i1);
    expect(i1).toBeLessThan(i2);
  });

  // Note: out-of-order chunk arrival at the integration level is
  // covered by the `assembleTranscript` unit tests in
  // `src/lib/__tests__/transcriptAssembly.test.ts` (Phase 3.1).
  // Driving out-of-order resolution through the full AudioRecorder
  // + fake-timer + React state machine adds timing fragility without
  // additional coverage beyond what the pure-function tests provide.

  // Empty live transcript — full Whisper still runs on stop. This is
  // the canonical path (the only path, now that 4.1 is reverted).
  it("empty live transcript still creates note via full Whisper", async () => {
    invokeBus
      .resolve("start_meeting_recording", undefined)
      .resolve("get_meeting_audio_chunk", [])
      .resolve("stop_meeting_recording", []);

    // Chunks return empty text — live transcript stays empty → fallback.
    mockTranscribeChunk.mockReset().mockResolvedValue({ text: "", chunkIndex: 0 });
    mockStructureAndCreateNote.mockReset();

    const note = { id: "note-fallback", title: "T", content: "c" };
    mockTranscribeAudio.mockResolvedValue({ note });

    const onNoteCreated = vi.fn();
    const recordingHandles: Array<{ state: string; onStop: () => void } | null> = [];

    const { rerender } = render(
      <AudioRecorder
        defaultMode="meeting"
        recordingSource="meeting"
        onRecordingSourceChange={vi.fn()}
        onNoteCreated={onNoteCreated}
        onError={vi.fn()}
        onRecordingStateChange={(s) => recordingHandles.push(s)}
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
          onNoteCreated={onNoteCreated}
          onError={vi.fn()}
          onRecordingStateChange={(s) => recordingHandles.push(s)}
          triggerMode="meeting"
          triggerKey={1}
        />,
      );
    });

    await waitFor(() => {
      const rec = recordingHandles.find((s) => s?.state === "recording");
      expect(rec).toBeTruthy();
    });
    const recording = recordingHandles.find((s) => s?.state === "recording")!;

    await act(async () => {
      recording.onStop();
    });

    await waitFor(() => {
      expect(onNoteCreated).toHaveBeenCalled();
    });

    expect(mockTranscribeAudio).toHaveBeenCalledTimes(1);
    // No live transcript → skip dedup path → no structureAndCreateNote call.
    expect(mockStructureAndCreateNote).not.toHaveBeenCalled();
    expect(onNoteCreated).toHaveBeenCalledWith(expect.objectContaining({ id: "note-fallback" }));
  });

  // Regression: NotesPage shows Settings via an early-return, so the parent's
  // `recordTrigger` state survives the navigation but AudioRecorder unmounts
  // and remounts. The mount should NOT auto-start recording from the stale
  // triggerKey — only a genuine *change* to triggerKey should fire.
  it("does not auto-record on remount with a stale triggerKey", async () => {
    const { unmount } = render(
      <AudioRecorder
        defaultMode="memo"
        recordingSource="microphone"
        onRecordingSourceChange={vi.fn()}
        onNoteCreated={vi.fn()}
        onError={vi.fn()}
        onRecordingStateChange={vi.fn()}
        triggerMode="memo"
        triggerKey={42}
      />,
    );
    unmount();

    // Fresh mount with the same triggerKey value (as if returning from Settings).
    render(
      <AudioRecorder
        defaultMode="memo"
        recordingSource="microphone"
        onRecordingSourceChange={vi.fn()}
        onNoteCreated={vi.fn()}
        onError={vi.fn()}
        onRecordingStateChange={vi.fn()}
        triggerMode="memo"
        triggerKey={42}
      />,
    );

    // Give rAF + effects a chance to fire if the bug existed.
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });

    expect(mediaDevices.getUserMediaSpy).not.toHaveBeenCalled();
    expect(mediaRecorder.recorders.length).toBe(0);
  });
});
