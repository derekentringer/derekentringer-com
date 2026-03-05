import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AudioRecorder } from "../components/AudioRecorder.tsx";

vi.mock("../api/ai.ts", () => ({
  transcribeAudio: vi.fn(),
}));

describe("AudioRecorder", () => {
  const defaultProps = {
    defaultMode: "memo" as const,
    onNoteCreated: vi.fn(),
    onError: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Record button and mode dropdown", () => {
    render(<AudioRecorder {...defaultProps} />);

    expect(screen.getByTitle("Record audio (Memo)")).toBeInTheDocument();
    expect(screen.getByLabelText("Recording mode")).toBeInTheDocument();
  });

  it("shows mode options when dropdown clicked", async () => {
    render(<AudioRecorder {...defaultProps} />);

    await userEvent.click(screen.getByLabelText("Recording mode"));

    expect(screen.getByText("Meeting")).toBeInTheDocument();
    expect(screen.getByText("Lecture")).toBeInTheDocument();
    expect(screen.getByText("Memo")).toBeInTheDocument();
    expect(screen.getByText("Verbatim")).toBeInTheDocument();
  });

  it("closes dropdown on selection", async () => {
    render(<AudioRecorder {...defaultProps} />);

    await userEvent.click(screen.getByLabelText("Recording mode"));
    expect(screen.getByText("Meeting")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Meeting"));

    // Dropdown should close
    expect(screen.queryByText("Lecture")).not.toBeInTheDocument();
  });
});
