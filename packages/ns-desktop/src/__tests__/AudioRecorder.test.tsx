import { render, screen, waitFor } from "@testing-library/react";
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
    expect(screen.getByTitle("Record audio (Memo)")).toBeInTheDocument();
  });

  it("shows mode options on dropdown click", async () => {
    render(
      <AudioRecorder
        defaultMode="memo"
        recordingSource="microphone"
        onRecordingSourceChange={vi.fn()}
        onNoteCreated={vi.fn()}
        onError={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByLabelText("Recording mode"));

    expect(screen.getByText("Meeting")).toBeInTheDocument();
    expect(screen.getByText("Lecture")).toBeInTheDocument();
    expect(screen.getByText("Memo")).toBeInTheDocument();
    expect(screen.getByText("Verbatim")).toBeInTheDocument();
  });

  it("closes dropdown on mode selection and updates button title", async () => {
    render(
      <AudioRecorder
        defaultMode="memo"
        recordingSource="microphone"
        onRecordingSourceChange={vi.fn()}
        onNoteCreated={vi.fn()}
        onError={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByLabelText("Recording mode"));
    expect(screen.getByText("Meeting")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Meeting"));

    // Dropdown should be closed
    expect(screen.queryByText("Lecture")).not.toBeInTheDocument();
    // Button title updated
    expect(screen.getByTitle("Record audio (Meeting)")).toBeInTheDocument();
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
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("check_meeting_recording_support");
    });

    await userEvent.click(screen.getByLabelText("Recording mode"));

    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByText("Microphone only")).toBeInTheDocument();
    expect(screen.getByText("Meeting mode")).toBeInTheDocument();
  });

  it("hides source section in dropdown when meeting is not supported", async () => {
    mockInvoke.mockResolvedValue(false);
    render(
      <AudioRecorder
        defaultMode="memo"
        recordingSource="microphone"
        onRecordingSourceChange={vi.fn()}
        onNoteCreated={vi.fn()}
        onError={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("check_meeting_recording_support");
    });

    await userEvent.click(screen.getByLabelText("Recording mode"));

    expect(screen.queryByText("Source")).not.toBeInTheDocument();
    expect(screen.queryByText("Microphone only")).not.toBeInTheDocument();
  });

  it("shows meeting icon when meeting mode is active and supported", async () => {
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

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("check_meeting_recording_support");
    });

    // The title should include "Meeting" indicator
    expect(screen.getByTitle("Record audio (Memo — Meeting)")).toBeInTheDocument();
  });
});
