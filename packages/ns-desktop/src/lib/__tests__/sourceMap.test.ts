import { describe, it, expect } from "vitest";
import { findSourceLine } from "../sourceMap.ts";

/** Build a minimal DOM container with inner HTML for testing */
function makeContainer(html: string): HTMLElement {
  const container = document.createElement("div");
  container.className = "markdown-preview";
  container.innerHTML = html;
  return container;
}

describe("findSourceLine", () => {
  describe("heading mapping", () => {
    it("maps a heading element with matching slug to its source line", () => {
      const md = "# Introduction\n\nSome text\n\n## Getting Started";
      const container = makeContainer(
        '<h1 id="introduction">Introduction</h1><p>Some text</p><h2 id="getting-started">Getting Started</h2>',
      );
      const h2 = container.querySelector("h2") as HTMLElement;
      expect(findSourceLine(md, h2, container)).toBe(5);
    });

    it("maps the first heading correctly", () => {
      const md = "# Title\n\nBody text";
      const container = makeContainer('<h1 id="title">Title</h1><p>Body text</p>');
      const h1 = container.querySelector("h1") as HTMLElement;
      expect(findSourceLine(md, h1, container)).toBe(1);
    });

    it("maps a clicked span inside a heading to the heading line", () => {
      const md = "# Title\n\n## Sub Heading";
      const container = makeContainer(
        '<h1 id="title">Title</h1><h2 id="sub-heading"><span>Sub Heading</span></h2>',
      );
      const span = container.querySelector("h2 span") as HTMLElement;
      expect(findSourceLine(md, span, container)).toBe(3);
    });
  });

  describe("paragraph mapping (text-content based)", () => {
    it("maps a paragraph by its text content", () => {
      const md = "# Heading\n\nFirst paragraph.\n\nSecond paragraph.";
      const container = makeContainer(
        '<h1 id="heading">Heading</h1><p>First paragraph.</p><p>Second paragraph.</p>',
      );
      const p1 = container.querySelectorAll("p")[0] as HTMLElement;
      expect(findSourceLine(md, p1, container)).toBe(3);
    });

    it("maps the second paragraph correctly", () => {
      const md = "# Heading\n\nFirst paragraph.\n\nSecond paragraph.";
      const container = makeContainer(
        '<h1 id="heading">Heading</h1><p>First paragraph.</p><p>Second paragraph.</p>',
      );
      const p2 = container.querySelectorAll("p")[1] as HTMLElement;
      expect(findSourceLine(md, p2, container)).toBe(5);
    });

    it("maps a paragraph correctly when code blocks are present", () => {
      const md = "First para.\n\n```js\nconst x = 1;\n```\n\nSecond para.\n\n```py\ny = 2\n```\n\nThird para.";
      const container = makeContainer(
        '<p>First para.</p><pre><code>const x = 1;</code></pre><p>Second para.</p><pre><code>y = 2</code></pre><p>Third para.</p>',
      );
      const p3 = container.querySelectorAll("p")[2] as HTMLElement;
      expect(findSourceLine(md, p3, container)).toBe(13);
    });
  });

  describe("code block mapping (text-content based)", () => {
    it("maps a code block by its text content", () => {
      const md = "Some text\n\n```js\nconst x = 1;\n```\n\nMore text";
      const container = makeContainer(
        '<p>Some text</p><pre><code>const x = 1;</code></pre><p>More text</p>',
      );
      const pre = container.querySelector("pre") as HTMLElement;
      expect(findSourceLine(md, pre, container)).toBe(3);
    });

    it("maps the second code block correctly", () => {
      const md = "```\nfirst\n```\n\n```\nsecond\n```";
      const container = makeContainer(
        '<pre><code>first</code></pre><pre><code>second</code></pre>',
      );
      const pres = container.querySelectorAll("pre");
      expect(findSourceLine(md, pres[1] as HTMLElement, container)).toBe(5);
    });

    it("maps a code block wrapped in a div (CodeBlock component)", () => {
      const md = "Text\n\n```js\nconst y = 2;\n```";
      const container = makeContainer(
        '<p>Text</p><div class="code-block-wrapper"><pre><code>const y = 2;</code></pre></div>',
      );
      // Click on the <code> element inside the wrapper
      const code = container.querySelector("code") as HTMLElement;
      expect(findSourceLine(md, code, container)).toBe(3);
    });
  });

  describe("table mapping", () => {
    it("maps a table element to its source start line", () => {
      const md = "Text\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nMore text";
      const container = makeContainer(
        '<p>Text</p><table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table><p>More text</p>',
      );
      const table = container.querySelector("table") as HTMLElement;
      expect(findSourceLine(md, table, container)).toBe(3);
    });

    it("maps a clicked cell inside a table to the table start line", () => {
      const md = "| A | B |\n|---|---|\n| 1 | 2 |";
      const container = makeContainer(
        '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
      );
      const td = container.querySelector("td") as HTMLElement;
      expect(findSourceLine(md, td, container)).toBe(1);
    });
  });

  describe("list item mapping (text-content based)", () => {
    it("maps a list item by its text content", () => {
      const md = "# Title\n\n- item one\n- item two\n- item three";
      const container = makeContainer(
        '<h1 id="title">Title</h1><ul><li>item one</li><li>item two</li><li>item three</li></ul>',
      );
      const li = container.querySelectorAll("li")[1] as HTMLElement;
      expect(findSourceLine(md, li, container)).toBe(4);
    });

    it("maps ordered list items", () => {
      const md = "1. first\n2. second\n3. third";
      const container = makeContainer(
        '<ol><li>first</li><li>second</li><li>third</li></ol>',
      );
      const li = container.querySelectorAll("li")[2] as HTMLElement;
      expect(findSourceLine(md, li, container)).toBe(3);
    });
  });

  describe("fallback", () => {
    it("returns 0 for an unmappable element", () => {
      const md = "Some content";
      const container = makeContainer('<div class="unknown">stuff</div>');
      const div = container.querySelector(".unknown") as HTMLElement;
      expect(findSourceLine(md, div, container)).toBe(0);
    });

    it("returns 0 for empty content", () => {
      const container = makeContainer("<p>text</p>");
      const p = container.querySelector("p") as HTMLElement;
      expect(findSourceLine("", p, container)).toBe(0);
    });
  });

  describe("elements near code blocks", () => {
    it("correctly maps paragraphs after multiple code blocks", () => {
      const md = [
        "Intro paragraph.",
        "",
        "```",
        "block one",
        "```",
        "",
        "Middle paragraph.",
        "",
        "```",
        "block two",
        "```",
        "",
        "Final paragraph.",
      ].join("\n");
      const container = makeContainer(
        '<p>Intro paragraph.</p><pre><code>block one</code></pre><p>Middle paragraph.</p><pre><code>block two</code></pre><p>Final paragraph.</p>',
      );
      const ps = container.querySelectorAll("p");
      expect(findSourceLine(md, ps[0] as HTMLElement, container)).toBe(1);
      expect(findSourceLine(md, ps[1] as HTMLElement, container)).toBe(7);
      expect(findSourceLine(md, ps[2] as HTMLElement, container)).toBe(13);
    });
  });
});
