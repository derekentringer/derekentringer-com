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
});
