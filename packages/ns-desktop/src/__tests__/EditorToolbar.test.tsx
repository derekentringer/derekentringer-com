import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorToolbar } from "../components/EditorToolbar.tsx";

describe("EditorToolbar", () => {
  const defaultProps = {
    viewMode: "editor" as const,
    onViewModeChange: vi.fn(),
    onBold: vi.fn(),
    onItalic: vi.fn(),
    showLineNumbers: true,
    onToggleLineNumbers: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all three view mode buttons", () => {
    render(<EditorToolbar {...defaultProps} />);

    expect(screen.getByText("Editor")).toBeInTheDocument();
    expect(screen.getByText("Split")).toBeInTheDocument();
    expect(screen.getByText("Preview")).toBeInTheDocument();
  });

  it("calls onViewModeChange when a mode button is clicked", async () => {
    render(<EditorToolbar {...defaultProps} />);

    await userEvent.click(screen.getByText("Split"));
    expect(defaultProps.onViewModeChange).toHaveBeenCalledWith("split");

    await userEvent.click(screen.getByText("Preview"));
    expect(defaultProps.onViewModeChange).toHaveBeenCalledWith("preview");
  });

  it("shows Bold, Italic, and # buttons when not in preview mode", () => {
    render(<EditorToolbar {...defaultProps} viewMode="editor" />);

    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("I")).toBeInTheDocument();
    expect(screen.getByText("#")).toBeInTheDocument();
  });

  it("hides formatting buttons in preview mode", () => {
    render(<EditorToolbar {...defaultProps} viewMode="preview" />);

    expect(screen.queryByText("B")).not.toBeInTheDocument();
    expect(screen.queryByText("I")).not.toBeInTheDocument();
    expect(screen.queryByText("#")).not.toBeInTheDocument();
  });

  it("calls onBold when B button is clicked", async () => {
    render(<EditorToolbar {...defaultProps} />);

    await userEvent.click(screen.getByText("B"));
    expect(defaultProps.onBold).toHaveBeenCalledTimes(1);
  });

  it("calls onItalic when I button is clicked", async () => {
    render(<EditorToolbar {...defaultProps} />);

    await userEvent.click(screen.getByText("I"));
    expect(defaultProps.onItalic).toHaveBeenCalledTimes(1);
  });

  it("calls onToggleLineNumbers when # button is clicked", async () => {
    render(<EditorToolbar {...defaultProps} />);

    await userEvent.click(screen.getByText("#"));
    expect(defaultProps.onToggleLineNumbers).toHaveBeenCalledTimes(1);
  });

  it("shows formatting buttons in split mode", () => {
    render(<EditorToolbar {...defaultProps} viewMode="split" />);

    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("I")).toBeInTheDocument();
  });
});
