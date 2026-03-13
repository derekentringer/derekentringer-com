import { describe, it, expect } from "vitest";
import { extractHeadings } from "../extractHeadings.ts";

describe("extractHeadings", () => {
  it("returns empty array for empty content", () => {
    expect(extractHeadings("")).toEqual([]);
  });

  it("returns empty array for content with no headings", () => {
    expect(extractHeadings("Just some text\nAnother line")).toEqual([]);
  });

  it("extracts a single heading", () => {
    const result = extractHeadings("# Hello World");
    expect(result).toEqual([
      { level: 1, text: "Hello World", slug: "hello-world" },
    ]);
  });

  it("extracts multiple heading levels", () => {
    const md = "# Title\n## Section\n### Subsection\n#### Deep";
    const result = extractHeadings(md);
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ level: 1, text: "Title", slug: "title" });
    expect(result[1]).toEqual({ level: 2, text: "Section", slug: "section" });
    expect(result[2]).toEqual({ level: 3, text: "Subsection", slug: "subsection" });
    expect(result[3]).toEqual({ level: 4, text: "Deep", slug: "deep" });
  });

  it("skips headings inside fenced code blocks", () => {
    const md = "# Real\n```\n# Not a heading\n## Also not\n```\n## Also Real";
    const result = extractHeadings(md);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("Real");
    expect(result[1].text).toBe("Also Real");
  });

  it("strips bold formatting", () => {
    const result = extractHeadings("## **Bold** heading");
    expect(result[0].text).toBe("Bold heading");
  });

  it("strips italic formatting", () => {
    const result = extractHeadings("## *Italic* heading");
    expect(result[0].text).toBe("Italic heading");
  });

  it("strips inline code formatting", () => {
    const result = extractHeadings("## The `code` function");
    expect(result[0].text).toBe("The code function");
  });

  it("strips link formatting", () => {
    const result = extractHeadings("## Check [this](https://example.com) out");
    expect(result[0].text).toBe("Check this out");
  });

  it("strips image formatting", () => {
    const result = extractHeadings("## See ![alt](img.png) here");
    expect(result[0].text).toBe("See alt here");
  });

  it("generates incremented slugs for duplicate headings", () => {
    const md = "## Intro\n## Intro\n## Intro";
    const result = extractHeadings(md);
    expect(result[0].slug).toBe("intro");
    expect(result[1].slug).toBe("intro-1");
    expect(result[2].slug).toBe("intro-2");
  });

  it("ignores lines that start with # but are not headings (no space)", () => {
    const md = "#hashtag\n## Real Heading";
    const result = extractHeadings(md);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Real Heading");
  });

  it("handles h6 headings", () => {
    const result = extractHeadings("###### H6 Heading");
    expect(result).toEqual([
      { level: 6, text: "H6 Heading", slug: "h6-heading" },
    ]);
  });
});
