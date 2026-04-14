import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AudioRecorder } from "../components/AudioRecorder.tsx";

vi.mock("../api/ai.ts", () => ({
  transcribeAudio: vi.fn(),
}));

const mockInvoke = vi.fn();
const mockListen = vi.fn().mockResolvedValue(vi.fn());
const mockReadFile = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

beforeEach(() => {
  mockInvoke.mockReset();
  mockListen.mockReset().mockResolvedValue(vi.fn());
  mockReadFile.mockReset();
  // Default: meeting recording not supported
  mockInvoke.mockResolvedValue(false);
});

describe("AudioRecorder", () => {
  it("renders Record button with mic icon and mode title", () => {
    render(
      <AudioRecorder
        defaultMode="memo"
        recordingSource="microphone"
        onRecordingSourceChange={vi.fn()}
        onNoteCreated={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByTitle("Record audio (Memo) — hold for options")).toBeInTheDocument();
  });

  it("shows mode options on long-press", async () => {
    vi.useFakeTimers();
    render(
      <AudioRecorder
        defaultMode="memo"
        recordingSource="microphone"
        onRecordingSourceChange={vi.fn()}
        onNoteCreated={vi.fn()}
        onError={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: "Record audio" });

    // Simulate long-press: pointerDown, wait 500ms
    await act(async () => {
      button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByText("Meeting")).toBeInTheDocument();
    expect(screen.getByText("Lecture")).toBeInTheDocument();
    expect(screen.getByText("Memo")).toBeInTheDocument();
    expect(screen.getByText("Verbatim")).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("closes dropdown on mode selection and updates button title", async () => {
    vi.useFakeTimers();
    render(
      <AudioRecorder
        defaultMode="memo"
        recordingSource="microphone"
        onRecordingSourceChange={vi.fn()}
        onNoteCreated={vi.fn()}
        onError={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: "Record audio" });

    // Long-press to open dropdown
    await act(async () => {
      button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByText("Meeting")).toBeInTheDocument();

    // Click "Meeting" mode
    await act(async () => {
      screen.getByText("Meeting").click();
    });

    // Dropdown should be closed
    expect(screen.queryByText("Lecture")).not.toBeInTheDocument();
    // Button title updated
    expect(screen.getByTitle("Record audio (Meeting) — hold for options")).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("checks meeting recording support on mount", () => {
    render(
      <AudioRecorder
        defaultMode="memo"
        recordingSource="microphone"
        onRecordingSourceChange={vi.fn()}
        onNoteCreated={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(mockInvoke).toHaveBeenCalledWith("check_meeting_recording_support");
  });

  it("shows source section in dropdown when meeting is supported", async () => {
    vi.useFakeTimers();
    mockInvoke.mockResolvedValue(true);
    render(
      <AudioRecorder
        defaultMode="memo"
        recordingSource="microphone"
        onRecordingSourceChange={vi.fn()}
        onNoteCreated={vi.fn()}
        onError={vi.fn()}
      />,
    );

    // Wait for the support check to complete
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const button = screen.getByRole("button", { name: "Record audio" });

    // Long-press to open dropdown
    await act(async () => {
      button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByText("Microphone only")).toBeInTheDocument();
    expect(screen.getByText("Meeting mode")).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("disables meeting option in dropdown when meeting is not supported", async () => {
    vi.useFakeTimers();
    mockInvoke.mockResolvedValue(false);
    render(
      <AudioRecorder
        defaultMode="memo"
        recordingSource="meeting"
        onRecordingSourceChange={vi.fn()}
        onNoteCreated={vi.fn()}
        onError={vi.fn()}
      />,
    );

    // Wait for the support check to complete
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const button = screen.getByRole("button", { name: "Record audio" });

    // Long-press to open dropdown
    await act(async () => {
      button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Source section is always visible now
    expect(screen.getByText("Source")).toBeInTheDocument();
    // Meeting option should be disabled
    const meetingBtn = screen.getByText("Meeting mode");
    expect(meetingBtn.closest("button")).toBeDisabled();

    vi.useRealTimers();
  });

  it("shows meeting indicator in title when meeting mode is active and supported", async () => {
    mockInvoke.mockResolvedValue(true);
    render(
      <AudioRecorder
        defaultMode="memo"
        recordingSource="meeting"
        onRecordingSourceChange={vi.fn()}
        onNoteCreated={vi.fn()}
        onError={vi.fn()}
      />,
    );

    // Wait for the meeting support check to resolve and re-render with meeting indicator
    await waitFor(() => {
      expect(screen.getByTitle("Record audio (Memo — Meeting mode) — hold for options")).toBeInTheDocument();
    });
  });
});
