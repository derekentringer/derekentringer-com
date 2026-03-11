import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AudioRecorder } from "../components/AudioRecorder.tsx";

vi.mock("../api/ai.ts", () => ({
  transcribeAudio: vi.fn(),
}));

describe("AudioRecorder", () => {
  it("renders Record button with mic icon and mode title", () => {
    render(
      <AudioRecorder
        defaultMode="memo"
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
});
