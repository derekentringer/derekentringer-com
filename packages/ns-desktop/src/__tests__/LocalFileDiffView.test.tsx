import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocalFileDiffView } from "../components/LocalFileDiffView.tsx";

describe("LocalFileDiffView", () => {
  const defaultProps = {
    noteTitle: "Test Note",
    cloudContent: "line one\nline two",
    localContent: "line one\nline three",
    onSaveToFile: vi.fn(),
    onUseLocal: vi.fn(),
    onClose: vi.fn(),
  };

  it("renders with data-testid", () => {
    render(<LocalFileDiffView {...defaultProps} />);

    expect(screen.getByTestId("local-file-diff-view")).toBeInTheDocument();
  });

  it("renders the note title", () => {
    render(<LocalFileDiffView {...defaultProps} />);

    expect(screen.getByText("Test Note")).toBeInTheDocument();
  });

  it("renders Unified and Split mode toggle buttons", () => {
    render(<LocalFileDiffView {...defaultProps} />);

    expect(screen.getByTestId("diff-mode-unified")).toBeInTheDocument();
    expect(screen.getByTestId("diff-mode-split")).toBeInTheDocument();
    expect(screen.getByText("Unified")).toBeInTheDocument();
    expect(screen.getByText("Split")).toBeInTheDocument();
  });

  it("renders Save to File button", () => {
    render(<LocalFileDiffView {...defaultProps} />);

    expect(screen.getByTestId("save-to-file-button")).toBeInTheDocument();
    expect(screen.getByText("Save to File")).toBeInTheDocument();
  });

  it("renders Use Local Version button", () => {
    render(<LocalFileDiffView {...defaultProps} />);

    expect(screen.getByTestId("use-local-button")).toBeInTheDocument();
    expect(screen.getByText("Use Local Version")).toBeInTheDocument();
  });

  it("renders Close button", () => {
    render(<LocalFileDiffView {...defaultProps} />);

    expect(screen.getByTestId("close-diff-button")).toBeInTheDocument();
    expect(screen.getByText("Close")).toBeInTheDocument();
  });

  it("starts in unified mode by default", () => {
    render(<LocalFileDiffView {...defaultProps} />);

    const unifiedBtn = screen.getByTestId("diff-mode-unified");
    expect(unifiedBtn.className).toContain("bg-primary");
    expect(unifiedBtn.className).toContain("font-medium");
  });

  it("switches to split mode when Split button is clicked", async () => {
    render(<LocalFileDiffView {...defaultProps} />);

    await userEvent.click(screen.getByTestId("diff-mode-split"));

    const splitBtn = screen.getByTestId("diff-mode-split");
    expect(splitBtn.className).toContain("bg-primary");

    const unifiedBtn = screen.getByTestId("diff-mode-unified");
    expect(unifiedBtn.className).not.toContain("bg-primary");
  });

  it("switches back to unified mode", async () => {
    render(<LocalFileDiffView {...defaultProps} />);

    // Go to split
    await userEvent.click(screen.getByTestId("diff-mode-split"));
    // Go back to unified
    await userEvent.click(screen.getByTestId("diff-mode-unified"));

    const unifiedBtn = screen.getByTestId("diff-mode-unified");
    expect(unifiedBtn.className).toContain("bg-primary");
  });

  it("shows NoteSync and Local File headers in split mode", async () => {
    render(<LocalFileDiffView {...defaultProps} />);

    await userEvent.click(screen.getByTestId("diff-mode-split"));

    expect(screen.getByText("NoteSync")).toBeInTheDocument();
    expect(screen.getByText("Local File")).toBeInTheDocument();
  });

  it("calls onSaveToFile when Save to File is clicked", async () => {
    const onSaveToFile = vi.fn();
    render(<LocalFileDiffView {...defaultProps} onSaveToFile={onSaveToFile} />);

    await userEvent.click(screen.getByTestId("save-to-file-button"));
    expect(onSaveToFile).toHaveBeenCalledTimes(1);
  });

  it("calls onUseLocal when Use Local Version is clicked", async () => {
    const onUseLocal = vi.fn();
    render(<LocalFileDiffView {...defaultProps} onUseLocal={onUseLocal} />);

    await userEvent.click(screen.getByTestId("use-local-button"));
    expect(onUseLocal).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Close is clicked", async () => {
    const onClose = vi.fn();
    render(<LocalFileDiffView {...defaultProps} onClose={onClose} />);

    await userEvent.click(screen.getByTestId("close-diff-button"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders diff content showing removed and added lines in unified mode", () => {
    const { container } = render(
      <LocalFileDiffView
        noteTitle="Diff Test"
        cloudContent={"same line\nold line"}
        localContent={"same line\nnew line"}
        onSaveToFile={vi.fn()}
        onUseLocal={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // Should have removed lines with red background
    const removedLines = container.querySelectorAll(".bg-red-900\\/30");
    expect(removedLines.length).toBeGreaterThan(0);

    // Should have added lines with green background
    const addedLines = container.querySelectorAll(".bg-green-900\\/30");
    expect(addedLines.length).toBeGreaterThan(0);

    // Removed lines should contain red text
    const redText = container.querySelectorAll(".text-red-400");
    expect(redText.length).toBeGreaterThan(0);

    // Added lines should contain green text
    const greenText = container.querySelectorAll(".text-green-400");
    expect(greenText.length).toBeGreaterThan(0);
  });

  it("renders identical content without diff markers when content matches", () => {
    const { container } = render(
      <LocalFileDiffView
        noteTitle="No Diff"
        cloudContent="identical"
        localContent="identical"
        onSaveToFile={vi.fn()}
        onUseLocal={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // No added or removed backgrounds when content is the same
    const addedLines = container.querySelectorAll(".bg-green-900\\/30");
    const removedLines = container.querySelectorAll(".bg-red-900\\/30");
    expect(addedLines).toHaveLength(0);
    expect(removedLines).toHaveLength(0);
  });

  it("has cursor-pointer on all action buttons", () => {
    render(<LocalFileDiffView {...defaultProps} />);

    const saveBtn = screen.getByTestId("save-to-file-button");
    const useLocalBtn = screen.getByTestId("use-local-button");
    const closeBtn = screen.getByTestId("close-diff-button");
    const unifiedBtn = screen.getByTestId("diff-mode-unified");
    const splitBtn = screen.getByTestId("diff-mode-split");

    expect(saveBtn.className).toContain("cursor-pointer");
    expect(useLocalBtn.className).toContain("cursor-pointer");
    expect(closeBtn.className).toContain("cursor-pointer");
    expect(unifiedBtn.className).toContain("cursor-pointer");
    expect(splitBtn.className).toContain("cursor-pointer");
  });
});
