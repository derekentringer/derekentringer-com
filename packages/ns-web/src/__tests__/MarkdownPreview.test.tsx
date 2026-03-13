import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarkdownPreview } from "../components/MarkdownPreview.tsx";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg data-testid="mermaid-svg">diagram</svg>' }),
  },
}));

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

  describe("Mermaid diagrams", () => {
    it("renders mermaid code block as a diagram", async () => {
      const { container } = render(
        <MarkdownPreview content={"```mermaid\ngraph LR\nA-->B\n```"} />,
      );
      await waitFor(() => {
        expect(container.querySelector(".mermaid-diagram")).toBeInTheDocument();
      });
      expect(container.querySelector("pre code")).not.toBeInTheDocument();
    });

    it("does not render non-mermaid code blocks as diagrams", () => {
      const { container } = render(
        <MarkdownPreview content={"```js\nconst x = 1;\n```"} />,
      );
      expect(container.querySelector(".mermaid-diagram")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Copy code" })).toBeInTheDocument();
    });

    it("shows raw code and error message on render failure", async () => {
      const mermaid = (await import("mermaid")).default;
      vi.mocked(mermaid.render).mockRejectedValueOnce(new Error("Invalid syntax"));
      const { container } = render(
        <MarkdownPreview content={"```mermaid\ninvalid diagram\n```"} />,
      );
      await waitFor(() => {
        expect(container.querySelector(".mermaid-error")).toBeInTheDocument();
      });
      expect(screen.getByText("Invalid syntax")).toBeInTheDocument();
    });

    it("does not render inline mermaid code as a diagram", () => {
      const { container } = render(
        <MarkdownPreview content={"`mermaid`"} />,
      );
      expect(container.querySelector(".mermaid-diagram")).not.toBeInTheDocument();
    });
  });

  describe("Syntax highlighting", () => {
    it("adds hljs class to code element in fenced code block with language hint", () => {
      const { container } = render(
        <MarkdownPreview content={"```js\nconst x = 1;\n```"} />,
      );
      const codeEl = container.querySelector("pre code");
      expect(codeEl).not.toBeNull();
      expect(codeEl!.className).toMatch(/hljs/);
    });

    it("produces hljs-keyword spans for keywords in highlighted code", () => {
      const { container } = render(
        <MarkdownPreview content={"```js\nconst x = 1;\n```"} />,
      );
      const keywordSpans = container.querySelectorAll(".hljs-keyword");
      expect(keywordSpans.length).toBeGreaterThan(0);
    });

    it("does not add hljs classes to inline code", () => {
      const { container } = render(
        <MarkdownPreview content={"`const x = 1`"} />,
      );
      const inlineCode = container.querySelector("code");
      expect(inlineCode).not.toBeNull();
      expect(inlineCode!.className).not.toMatch(/hljs/);
    });

    it("copy button still works with syntax-highlighted code", async () => {
      const user = userEvent.setup();
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        get: () => ({ writeText }),
        configurable: true,
      });
      render(<MarkdownPreview content={"```js\nconst x = 1;\n```"} />);
      await user.click(screen.getByRole("button", { name: "Copy code" }));
      expect(writeText).toHaveBeenCalledWith("const x = 1;\n");
    });
  });
});
