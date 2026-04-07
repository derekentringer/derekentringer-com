import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorToolbar } from "../components/EditorToolbar.tsx";

describe("EditorToolbar", () => {
  const defaultProps = {
    viewMode: "editor" as const,
    onViewModeChange: vi.fn(),
    onBold: vi.fn(),
    onItalic: vi.fn(),
    onStrikethrough: vi.fn(),
    onInlineCode: vi.fn(),
    onHeading: vi.fn(),
    onLink: vi.fn(),
    onImage: vi.fn(),
    onWikiLink: vi.fn(),
    onBulletList: vi.fn(),
    onNumberedList: vi.fn(),
    onCheckbox: vi.fn(),
    onBlockquote: vi.fn(),
    onCodeBlock: vi.fn(),
    onTable: vi.fn(),
    showLineNumbers: true,
    onToggleLineNumbers: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all four view mode buttons", () => {
    render(<EditorToolbar {...defaultProps} />);

    expect(screen.getByText("Editor")).toBeInTheDocument();
    expect(screen.getByText("Split")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
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

  it("hides line number toggle in live mode but shows formatting buttons", () => {
    render(<EditorToolbar {...defaultProps} viewMode="live" />);

    expect(screen.queryByText("#")).not.toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("I")).toBeInTheDocument();
  });
});
