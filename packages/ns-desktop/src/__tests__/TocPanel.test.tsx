import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TocPanel } from "../components/TocPanel.tsx";

describe("TocPanel", () => {
  it("shows empty state when content has no headings", () => {
    render(<TocPanel content="No headings here" onHeadingClick={vi.fn()} />);
    expect(screen.getByText("No headings found")).toBeInTheDocument();
  });

  it("renders heading items", () => {
    const md = "# Title\n## Section\n### Sub";
    render(<TocPanel content={md} onHeadingClick={vi.fn()} />);
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Section")).toBeInTheDocument();
    expect(screen.getByText("Sub")).toBeInTheDocument();
  });

  it("renders the Table of Contents header", () => {
    render(<TocPanel content="# Heading" onHeadingClick={vi.fn()} />);
    expect(screen.getByText("Table of Contents")).toBeInTheDocument();
  });

  it("calls onHeadingClick with the correct slug when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<TocPanel content="## My Section" onHeadingClick={onClick} />);
    await user.click(screen.getByText("My Section"));
    expect(onClick).toHaveBeenCalledWith("my-section", 1);
  });

  it("indents nested headings relative to the minimum level", () => {
    const md = "## Parent\n### Child\n#### Grandchild";
    render(<TocPanel content={md} onHeadingClick={vi.fn()} />);
    const items = screen.getAllByTestId("toc-item");
    // Parent (level 2, min 2): paddingLeft = 0*16+12 = 12
    expect(items[0]).toHaveStyle({ paddingLeft: "12px" });
    // Child (level 3, min 2): paddingLeft = 1*16+12 = 28
    expect(items[1]).toHaveStyle({ paddingLeft: "28px" });
    // Grandchild (level 4, min 2): paddingLeft = 2*16+12 = 44
    expect(items[2]).toHaveStyle({ paddingLeft: "44px" });
  });

  it("re-renders when content changes", () => {
    const onClick = vi.fn();
    const { rerender } = render(<TocPanel content="# First" onHeadingClick={onClick} />);
    expect(screen.getByText("First")).toBeInTheDocument();
    rerender(<TocPanel content="# Second" onHeadingClick={onClick} />);
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.queryByText("First")).not.toBeInTheDocument();
  });
});
