import { describe, it, expect } from "vitest";
import { formatShortcut } from "../formatShortcut.ts";

describe("formatShortcut", () => {
  it("returns empty string for null binding", () => {
    expect(formatShortcut(null)).toBe("");
  });

  it("formats Mod-s", () => {
    const result = formatShortcut({ key: "Mod-s" });
    // Should contain either ⌘ (Mac) or Ctrl (Windows) + S
    expect(result).toMatch(/[⌘Ctrl].*S/);
  });

  it("formats Mod-Shift-d", () => {
    const result = formatShortcut({ key: "Mod-Shift-d" });
    expect(result).toContain("⇧");
    expect(result).toContain("D");
  });

  it("formats Mod-Alt-a", () => {
    const result = formatShortcut({ key: "Mod-Alt-a" });
    expect(result).toContain("A");
  });

  it("formats arrow keys", () => {
    const result = formatShortcut({ key: "Mod-Alt-ArrowLeft" });
    expect(result).toContain("←");
  });

  it("formats Enter key", () => {
    const result = formatShortcut({ key: "Mod-Enter" });
    expect(result).toContain("↵");
  });

  it("formats backslash key", () => {
    const result = formatShortcut({ key: "Mod-\\" });
    expect(result).toContain("\\");
  });
});
