import { stripMarkdown } from "@/lib/markdown";

describe("stripMarkdown", () => {
  it("removes headings", () => {
    expect(stripMarkdown("# Title\n## Subtitle")).toBe("Title\nSubtitle");
  });

  it("removes bold markers", () => {
    expect(stripMarkdown("**bold text**")).toBe("bold text");
  });

  it("removes italic markers", () => {
    expect(stripMarkdown("*italic text*")).toBe("italic text");
  });

  it("removes bold+italic markers", () => {
    expect(stripMarkdown("***bold italic***")).toBe("bold italic");
  });

  it("removes inline code", () => {
    expect(stripMarkdown("use `const x = 1`")).toBe("use const x = 1");
  });

  it("removes code blocks", () => {
    const input = "before\n```js\nconst x = 1;\n```\nafter";
    expect(stripMarkdown(input)).toBe("before\nafter");
  });

  it("removes links but keeps text", () => {
    expect(stripMarkdown("[click here](https://example.com)")).toBe(
      "click here",
    );
  });

  it("removes images but keeps alt text", () => {
    expect(stripMarkdown("![alt text](image.png)")).toBe("alt text");
  });

  it("removes blockquotes", () => {
    expect(stripMarkdown("> quoted text")).toBe("quoted text");
  });

  it("removes horizontal rules", () => {
    expect(stripMarkdown("above\n---\nbelow")).toBe("above\nbelow");
  });

  it("removes strikethrough", () => {
    expect(stripMarkdown("~~deleted~~")).toBe("deleted");
  });

  it("removes unordered list markers", () => {
    expect(stripMarkdown("- item one\n- item two")).toBe(
      "item one\nitem two",
    );
  });

  it("removes ordered list markers", () => {
    expect(stripMarkdown("1. first\n2. second")).toBe("first\nsecond");
  });

  it("removes HTML tags", () => {
    expect(stripMarkdown("<b>bold</b>")).toBe("bold");
  });

  it("collapses multiple newlines", () => {
    expect(stripMarkdown("a\n\n\nb")).toBe("a\nb");
  });

  it("collapses multiple spaces", () => {
    expect(stripMarkdown("a    b")).toBe("a b");
  });

  it("trims whitespace", () => {
    expect(stripMarkdown("  hello  ")).toBe("hello");
  });

  it("handles empty string", () => {
    expect(stripMarkdown("")).toBe("");
  });

  it("handles underscore emphasis", () => {
    expect(stripMarkdown("_emphasized_")).toBe("emphasized");
  });
});
