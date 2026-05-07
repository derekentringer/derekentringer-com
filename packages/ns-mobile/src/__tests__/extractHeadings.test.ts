import { extractHeadings, cleanHeadingText } from "../lib/extractHeadings";

describe("extractHeadings", () => {
  it("returns empty for empty input", () => {
    expect(extractHeadings("")).toEqual([]);
  });

  it("extracts H1–H6 in source order", () => {
    const md = "# A\n## B\n### C\n#### D\n##### E\n###### F";
    expect(extractHeadings(md)).toEqual([
      { level: 1, text: "A" },
      { level: 2, text: "B" },
      { level: 3, text: "C" },
      { level: 4, text: "D" },
      { level: 5, text: "E" },
      { level: 6, text: "F" },
    ]);
  });

  it("strips inline formatting from heading text", () => {
    const md =
      "# **Bold**\n## *Italic*\n### `code`\n#### [link](https://x)\n##### ![alt](img.png)\n###### ~~strike~~";
    expect(extractHeadings(md)).toEqual([
      { level: 1, text: "Bold" },
      { level: 2, text: "Italic" },
      { level: 3, text: "code" },
      { level: 4, text: "link" },
      { level: 5, text: "alt" },
      { level: 6, text: "strike" },
    ]);
  });

  it("ignores headings inside fenced code blocks", () => {
    const md =
      "# Real heading\n\n```\n# Not a heading\n## Also not\n```\n\n## After fence";
    expect(extractHeadings(md)).toEqual([
      { level: 1, text: "Real heading" },
      { level: 2, text: "After fence" },
    ]);
  });

  it("handles language-tagged code fences (```js)", () => {
    const md = "# H1\n```js\n# inside js\n```\n## H2";
    expect(extractHeadings(md)).toEqual([
      { level: 1, text: "H1" },
      { level: 2, text: "H2" },
    ]);
  });

  it("does not match `#` without a space", () => {
    expect(extractHeadings("#NoSpace")).toEqual([]);
  });

  it("does not match more than 6 hashes", () => {
    expect(extractHeadings("####### Seven")).toEqual([]);
  });

  it("skips a leading frontmatter block defensively", () => {
    const md = "---\ntitle: hi\ntags: [a, b]\n---\n\n# Real heading";
    expect(extractHeadings(md)).toEqual([
      { level: 1, text: "Real heading" },
    ]);
  });

  it("does not treat `---` mid-document as frontmatter", () => {
    const md = "# A\n\n---\n\n## B";
    expect(extractHeadings(md)).toEqual([
      { level: 1, text: "A" },
      { level: 2, text: "B" },
    ]);
  });

  it("preserves exact text including punctuation and spacing", () => {
    const md = "## 1. Headings (for Table of Contents)";
    expect(extractHeadings(md)).toEqual([
      { level: 2, text: "1. Headings (for Table of Contents)" },
    ]);
  });
});

describe("cleanHeadingText", () => {
  it("is a no-op for plain text", () => {
    expect(cleanHeadingText("Plain heading")).toBe("Plain heading");
  });

  it("strips combined inline formatting", () => {
    expect(cleanHeadingText("**Bold** and *italic* and `code`")).toBe(
      "Bold and italic and code",
    );
  });

  it("preserves alternative emphasis markers", () => {
    expect(cleanHeadingText("__bold__ and _italic_")).toBe(
      "bold and italic",
    );
  });
});
