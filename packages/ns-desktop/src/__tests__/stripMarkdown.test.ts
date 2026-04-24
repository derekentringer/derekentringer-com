import { describe, it, expect } from "vitest";
import { stripMarkdown, stripFrontmatter } from "../lib/stripMarkdown.js";

describe("stripFrontmatter", () => {
  it("strips fenced YAML frontmatter", () => {
    const input = "---\ntitle: My Note\ntags: a, b\n---\nBody here.";
    expect(stripFrontmatter(input)).toBe("Body here.");
  });

  it("strips bare leading key: value lines followed by blank line", () => {
    const input = "title: Untitled\ntags: foo, bar\n\nBody here.";
    expect(stripFrontmatter(input)).toBe("Body here.");
  });

  it("strips bare leading key: value lines with no separator", () => {
    const input = "title: Untitled\nThis is a test.";
    expect(stripFrontmatter(input)).toBe("This is a test.");
  });

  it("leaves mid-document key-like lines alone (URL: http://...)", () => {
    const input = "Real note body.\n\nURL: https://example.com is what I meant.";
    expect(stripFrontmatter(input)).toBe(input);
  });

  it("does nothing to content without frontmatter", () => {
    expect(stripFrontmatter("Just body text.")).toBe("Just body text.");
  });

  it("handles empty input", () => {
    expect(stripFrontmatter("")).toBe("");
  });
});

describe("stripMarkdown with frontmatter", () => {
  it("produces a clean blurb for a note with bare frontmatter", () => {
    const note = "title: Untitled\nThis is a test.";
    expect(stripMarkdown(note)).toBe("This is a test.");
  });

  it("produces a clean blurb for a note with fenced frontmatter + heading", () => {
    const note = "---\ntitle: My Note\n---\n# Heading\n\nSome prose.";
    expect(stripMarkdown(note)).toBe("Heading Some prose.");
  });

  it("matches the Team Meeting screenshot case (multiple bare keys)", () => {
    const note = "title: Team Meeting - Reminders & Updates\ntags: team meeting, book club\n\nActual meeting notes here.";
    expect(stripMarkdown(note)).toBe("Actual meeting notes here.");
  });
});
