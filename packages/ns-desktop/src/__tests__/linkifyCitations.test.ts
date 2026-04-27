import { describe, it, expect } from "vitest";
import { linkifyCitations } from "../components/AIAssistantPanel.tsx";

describe("linkifyCitations", () => {
  const pool = [
    { id: "n1", title: "Claude Code Use Cases" },
    { id: "n2", title: "Daily Stand-up Meeting" },
  ];

  // Helper: each first reference now emits TWO adjacent markdown
  // links — one for the title text (clickable inline link) and one
  // for the numeric superscript marker. Both target the same note.
  const titleLink = (t: string) => `[${t}](cite:${encodeURIComponent(t)})`;
  const numberLink = (t: string, n: number) => `[${n}](cite:${encodeURIComponent(t)})`;
  const fullCite = (t: string, n: number) => titleLink(t) + numberLink(t, n);

  it("numbers explicit [Title] brackets and emits both title + number links", () => {
    const out = linkifyCitations(
      "See [Claude Code Use Cases] and also [Daily Stand-up Meeting].",
      undefined,
      pool,
    );
    expect(out).toContain(fullCite("Claude Code Use Cases", 1));
    expect(out).toContain(fullCite("Daily Stand-up Meeting", 2));
  });

  it("attaches both links to bare title matches (the real /recent-style case)", () => {
    // Claude often renders titles as `**Title**` in listicles instead
    // of bracketing them — this is exactly what broke before.
    const out = linkifyCitations(
      "1. **Claude Code Use Cases** — An overview of AI.",
      undefined,
      pool,
    );
    expect(out).toBe(
      "1. **" + fullCite("Claude Code Use Cases", 1) + "** — An overview of AI.",
    );
  });

  it("attaches both links to bare plain-text matches (no bold)", () => {
    const out = linkifyCitations(
      "I found Claude Code Use Cases in your notes.",
      undefined,
      pool,
    );
    expect(out).toBe(
      "I found " + fullCite("Claude Code Use Cases", 1) + " in your notes.",
    );
  });

  it("only cites the first occurrence of a title", () => {
    const out = linkifyCitations(
      "Claude Code Use Cases is useful. I recommend Claude Code Use Cases daily.",
      undefined,
      pool,
    );
    const marker = numberLink("Claude Code Use Cases", 1);
    const count = out.split(marker).length - 1;
    expect(count).toBe(1);
    // Second mention is still a clickable title link, just no number.
    expect(out.split(titleLink("Claude Code Use Cases")).length - 1).toBe(2);
  });

  it("numbers by first appearance across mixed bracket + bare forms", () => {
    // "Daily Stand-up Meeting" appears (bare) before any reference to
    // "Claude Code Use Cases" (bracketed), so Daily = 1, Claude = 2.
    const out = linkifyCitations(
      "**Daily Stand-up Meeting** covered sprint planning. See [Claude Code Use Cases].",
      undefined,
      pool,
    );
    expect(out).toContain(numberLink("Daily Stand-up Meeting", 1));
    expect(out).toContain(numberLink("Claude Code Use Cases", 2));
  });

  it("matches longest title first when titles overlap", () => {
    const overlapping = [
      { id: "n1", title: "Meeting" },
      { id: "n2", title: "Daily Stand-up Meeting" },
    ];
    const out = linkifyCitations(
      "Daily Stand-up Meeting happened yesterday.",
      undefined,
      overlapping,
    );
    expect(out).toContain(fullCite("Daily Stand-up Meeting", 1));
    // No extra citation for the prefix "Meeting".
    expect(out).not.toContain(numberLink("Meeting", 2));
  });

  it("does not match inside a regular markdown link label", () => {
    // `[Claude Code Use Cases](https://...)` is a normal markdown link,
    // not a citation target — the masking step prevents re-matching.
    const out = linkifyCitations(
      "Visit [Claude Code Use Cases](https://example.com) for details.",
      undefined,
      pool,
    );
    // What matters is we don't corrupt the URL portion or double-cite.
    expect(out).not.toContain("example.com[");
  });

  it("returns stripped text when pool is empty", () => {
    const out = linkifyCitations("No [Unknown Note] here.", undefined, []);
    expect(out).toBe("No here.");
  });

  it("strips brackets pointing to titles not in pool", () => {
    const out = linkifyCitations(
      "See [Some Unrelated Note] and Claude Code Use Cases.",
      undefined,
      pool,
    );
    // The unknown bracket is stripped; the bare match still fires.
    expect(out).toContain(fullCite("Claude Code Use Cases", 1));
    expect(out).not.toContain("Some Unrelated Note");
  });

  it("enforces word boundaries so substring collisions don't match", () => {
    const substringPool = [{ id: "n1", title: "Meet" }];
    const out = linkifyCitations(
      "I have a Meeting scheduled.",
      undefined,
      substringPool,
    );
    // "Meet" is a prefix of "Meeting" — word boundary prevents match.
    expect(out).toBe("I have a Meeting scheduled.");
  });

  it("merges sources + noteCards without double-citing the same title", () => {
    const sources = [{ id: "n1", title: "Claude Code Use Cases" }];
    const noteCards = [{ id: "n1", title: "Claude Code Use Cases" }];
    const out = linkifyCitations("Claude Code Use Cases is useful.", sources, noteCards);
    const marker = numberLink("Claude Code Use Cases", 1);
    expect(out.split(marker).length - 1).toBe(1);
  });
});
