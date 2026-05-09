import {
  appendShareContent,
  formatShareTimestamp,
} from "../lib/appendShareContent";

const FIXED = new Date(2026, 4, 8, 9, 14); // May 8, 2026 09:14 local

describe("formatShareTimestamp", () => {
  it("formats as 'Month D, YYYY at H:MM AM/PM'", () => {
    expect(formatShareTimestamp(FIXED)).toBe("May 8, 2026 at 9:14 AM");
  });

  it("does not zero-pad single-digit hours and zero-pads minutes", () => {
    const d = new Date(2026, 0, 1, 1, 5); // Jan 1, 2026 01:05
    expect(formatShareTimestamp(d)).toBe("January 1, 2026 at 1:05 AM");
  });

  it("renders noon as 12:00 PM", () => {
    const d = new Date(2026, 5, 15, 12, 0); // June 15, 2026 12:00
    expect(formatShareTimestamp(d)).toBe("June 15, 2026 at 12:00 PM");
  });

  it("renders midnight as 12 AM", () => {
    const d = new Date(2026, 5, 15, 0, 30); // June 15, 2026 00:30
    expect(formatShareTimestamp(d)).toBe("June 15, 2026 at 12:30 AM");
  });

  it("converts afternoon hours to 12-hour PM", () => {
    const d = new Date(2026, 5, 15, 21, 45); // June 15, 2026 21:45
    expect(formatShareTimestamp(d)).toBe("June 15, 2026 at 9:45 PM");
  });
});

describe("appendShareContent", () => {
  it("appends shared text after a horizontal rule + italic timestamp", () => {
    const out = appendShareContent("Hello world.", "Quick capture.", FIXED);
    expect(out).toBe(
      "Hello world.\n\n---\n\n*Clipped May 8, 2026 at 9:14 AM*\n\nQuick capture.",
    );
  });

  it("trims trailing whitespace on existing content before appending", () => {
    const out = appendShareContent("Hello.\n\n\n", "next", FIXED);
    expect(out).toBe(
      "Hello.\n\n---\n\n*Clipped May 8, 2026 at 9:14 AM*\n\nnext",
    );
  });

  it("trims leading and trailing whitespace from the shared text", () => {
    const out = appendShareContent("Hello.", "   padded   \n", FIXED);
    expect(out).toBe(
      "Hello.\n\n---\n\n*Clipped May 8, 2026 at 9:14 AM*\n\npadded",
    );
  });

  it("skips the horizontal rule when the existing note is empty", () => {
    const out = appendShareContent("", "first share", FIXED);
    expect(out).toBe("*Clipped May 8, 2026 at 9:14 AM*\n\nfirst share");
  });

  it("treats whitespace-only existing content as empty", () => {
    const out = appendShareContent("   \n  \n", "first share", FIXED);
    expect(out).toBe("*Clipped May 8, 2026 at 9:14 AM*\n\nfirst share");
  });

  it("does not mutate the input strings", () => {
    const existing = "Hello.";
    const shared = "world";
    appendShareContent(existing, shared, FIXED);
    expect(existing).toBe("Hello.");
    expect(shared).toBe("world");
  });

  it("supports multi-line shared content", () => {
    const out = appendShareContent(
      "Notes",
      "line one\nline two\n\nline four",
      FIXED,
    );
    expect(out).toBe(
      "Notes\n\n---\n\n*Clipped May 8, 2026 at 9:14 AM*\n\nline one\nline two\n\nline four",
    );
  });

  it("supports two appends stacked without runaway blank lines", () => {
    const after1 = appendShareContent("Notes", "one", FIXED);
    const after2 = appendShareContent(after1, "two", FIXED);
    expect(after2).toBe(
      "Notes\n\n---\n\n*Clipped May 8, 2026 at 9:14 AM*\n\none\n\n---\n\n*Clipped May 8, 2026 at 9:14 AM*\n\ntwo",
    );
  });
});
