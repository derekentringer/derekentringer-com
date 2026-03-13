import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarkdownPreview } from "../components/MarkdownPreview.tsx";

describe("MarkdownPreview", () => {
  it("renders heading text", () => {
    render(<MarkdownPreview content="# Hello World" />);
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  it("renders bold and italic text", () => {
    render(<MarkdownPreview content="**bold** and *italic*" />);
    expect(screen.getByText("bold")).toBeInTheDocument();
    expect(screen.getByText("italic")).toBeInTheDocument();
  });

  it("renders links", () => {
    render(<MarkdownPreview content="[Example](https://example.com)" />);
    const link = screen.getByText("Example");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute("href", "https://example.com");
  });

  it("renders code blocks", () => {
    render(<MarkdownPreview content={"```\nconst x = 1;\n```"} />);
    expect(screen.getByText("const x = 1;")).toBeInTheDocument();
  });

  it("renders GFM tables", () => {
    const table = `| Col A | Col B |\n|---|---|\n| 1 | 2 |`;
    render(<MarkdownPreview content={table} />);
    expect(screen.getByText("Col A")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("renders GFM strikethrough", () => {
    render(<MarkdownPreview content="~~removed~~" />);
    expect(screen.getByText("removed")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <MarkdownPreview content="test" className="custom-class" />,
    );
    expect(container.firstChild).toHaveClass("custom-class");
  });

  it("renders checkboxes as disabled when onContentChange is not provided", () => {
    render(<MarkdownPreview content="- [ ] task" />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeDisabled();
  });

  it("renders checkboxes as enabled when onContentChange is provided", () => {
    const onChange = vi.fn();
    render(<MarkdownPreview content="- [ ] task" onContentChange={onChange} />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeDisabled();
  });

  it("calls onContentChange with toggled content when checkbox is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const md = "- [ ] task one\n- [ ] task two";
    render(<MarkdownPreview content={md} onContentChange={onChange} />);
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);
    expect(onChange).toHaveBeenCalledWith("- [x] task one\n- [ ] task two");
  });
});
