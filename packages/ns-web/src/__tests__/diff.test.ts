import { describe, it, expect } from "vitest";
import { diffLines } from "../lib/diff.ts";

describe("diffLines", () => {
  it("returns all 'same' for identical text", () => {
    const result = diffLines("hello\nworld", "hello\nworld");
    expect(result).toEqual([
      { type: "same", text: "hello" },
      { type: "same", text: "world" },
    ]);
  });

  it("detects added lines", () => {
    const result = diffLines("hello", "hello\nworld");
    expect(result).toEqual([
      { type: "same", text: "hello" },
      { type: "added", text: "world" },
    ]);
  });

  it("detects removed lines", () => {
    const result = diffLines("hello\nworld", "hello");
    expect(result).toEqual([
      { type: "same", text: "hello" },
      { type: "removed", text: "world" },
    ]);
  });

  it("detects mixed changes", () => {
    const result = diffLines("a\nb\nc", "a\nx\nc");
    expect(result).toEqual([
      { type: "same", text: "a" },
      { type: "removed", text: "b" },
      { type: "added", text: "x" },
      { type: "same", text: "c" },
    ]);
  });

  it("handles empty old text", () => {
    const result = diffLines("", "hello");
    expect(result).toEqual([
      { type: "removed", text: "" },
      { type: "added", text: "hello" },
    ]);
  });

  it("handles empty new text", () => {
    const result = diffLines("hello", "");
    expect(result).toEqual([
      { type: "removed", text: "hello" },
      { type: "added", text: "" },
    ]);
  });

  it("handles both empty", () => {
    const result = diffLines("", "");
    expect(result).toEqual([
      { type: "same", text: "" },
    ]);
  });
});
