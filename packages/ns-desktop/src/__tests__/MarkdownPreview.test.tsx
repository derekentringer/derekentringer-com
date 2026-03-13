import { vi, describe, it, expect } from "vitest";
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

  describe("Heading IDs (rehype-slug)", () => {
    it("adds id attribute to h1", () => {
      const { container } = render(
        <MarkdownPreview content="# Hello World" />,
      );
      const h1 = container.querySelector("h1");
      expect(h1).not.toBeNull();
      expect(h1!.id).toBe("hello-world");
    });

    it("adds id attributes to multiple heading levels", () => {
      const { container } = render(
        <MarkdownPreview content={"# Title\n## Section\n### Sub"} />,
      );
      expect(container.querySelector("h1")!.id).toBe("title");
      expect(container.querySelector("h2")!.id).toBe("section");
      expect(container.querySelector("h3")!.id).toBe("sub");
    });

    it("generates incremented slugs for duplicate headings", () => {
      const { container } = render(
        <MarkdownPreview content={"## Intro\n## Intro\n## Intro"} />,
      );
      const headings = container.querySelectorAll("h2");
      expect(headings[0].id).toBe("intro");
      expect(headings[1].id).toBe("intro-1");
      expect(headings[2].id).toBe("intro-2");
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
