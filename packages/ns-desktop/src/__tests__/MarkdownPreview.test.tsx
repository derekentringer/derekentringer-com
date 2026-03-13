import { vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarkdownPreview } from "../components/MarkdownPreview.tsx";

describe("MarkdownPreview", () => {
  it("renders markdown content as HTML", () => {
    render(<MarkdownPreview content="# Hello World" />);
    expect(screen.getByText("Hello World")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("renders paragraphs", () => {
    render(<MarkdownPreview content="A simple paragraph." />);
    expect(screen.getByText("A simple paragraph.")).toBeInTheDocument();
  });

  it("renders bold text", () => {
    render(<MarkdownPreview content="**bold text**" />);
    const bold = screen.getByText("bold text");
    expect(bold.tagName).toBe("STRONG");
  });

  it("renders italic text", () => {
    render(<MarkdownPreview content="*italic text*" />);
    const italic = screen.getByText("italic text");
    expect(italic.tagName).toBe("EM");
  });

  it("renders links", () => {
    render(<MarkdownPreview content="[click here](https://example.com)" />);
    const link = screen.getByText("click here");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "https://example.com");
  });

  it("renders unordered lists", () => {
    const md = `- item 1
- item 2`;
    const { container } = render(<MarkdownPreview content={md} />);
    const listItems = container.querySelectorAll("li");
    expect(listItems).toHaveLength(2);
    expect(listItems[0].textContent).toBe("item 1");
    expect(listItems[1].textContent).toBe("item 2");
  });

  it("renders code blocks", () => {
    render(<MarkdownPreview content={"`inline code`"} />);
    const code = screen.getByText("inline code");
    expect(code.tagName).toBe("CODE");
  });

  it("applies markdown-preview class", () => {
    const { container } = render(<MarkdownPreview content="test" />);
    expect(container.firstElementChild).toHaveClass("markdown-preview");
  });

  it("applies custom className", () => {
    const { container } = render(
      <MarkdownPreview content="test" className="custom-class" />,
    );
    expect(container.firstElementChild).toHaveClass("markdown-preview", "custom-class");
  });

  it("renders GFM tables", () => {
    const table = "| Name | Age |\n| --- | --- |\n| Bob | 30 |";
    render(<MarkdownPreview content={table} />);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("renders GFM strikethrough", () => {
    render(<MarkdownPreview content="~~deleted~~" />);
    const del = screen.getByText("deleted");
    expect(del.tagName).toBe("DEL");
  });

  it("renders empty content without errors", () => {
    const { container } = render(<MarkdownPreview content="" />);
    expect(container.firstElementChild).toHaveClass("markdown-preview");
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

  describe("CodeBlock copy button", () => {
    function setupClipboardMock() {
      const writeText = vi.fn().mockResolvedValue(undefined);
      // Must be set AFTER userEvent.setup() which overrides navigator.clipboard
      Object.defineProperty(navigator, "clipboard", {
        get: () => ({ writeText }),
        configurable: true,
      });
      return writeText;
    }

    it("renders a copy button for fenced code blocks", () => {
      render(<MarkdownPreview content={"```\nconst x = 1;\n```"} />);
      expect(screen.getByRole("button", { name: "Copy code" })).toBeInTheDocument();
    });

    it("calls navigator.clipboard.writeText with the code text on click", async () => {
      const user = userEvent.setup();
      const writeText = setupClipboardMock();
      render(<MarkdownPreview content={"```\nconst x = 1;\n```"} />);
      await user.click(screen.getByRole("button", { name: "Copy code" }));
      expect(writeText).toHaveBeenCalledWith("const x = 1;\n");
    });

    it("shows copied state after click", async () => {
      const user = userEvent.setup();
      setupClipboardMock();
      render(<MarkdownPreview content={"```\ncode\n```"} />);
      const btn = screen.getByRole("button", { name: "Copy code" });
      await user.click(btn);
      expect(screen.getByRole("button", { name: "Copied" })).toHaveClass("copied");
    });

    it("does not render a copy button for inline code", () => {
      render(<MarkdownPreview content={"`inline code`"} />);
      expect(screen.queryByRole("button", { name: "Copy code" })).not.toBeInTheDocument();
    });

    it("renders copy button even without onContentChange (trash view)", () => {
      render(<MarkdownPreview content={"```\ncode\n```"} />);
      expect(screen.getByRole("button", { name: "Copy code" })).toBeInTheDocument();
    });
  });
});
