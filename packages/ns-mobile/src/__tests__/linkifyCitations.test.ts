// Tests for the mobile citation tokenizer (Phase A.2). Mirrors the
// desktop/web linkifyCitations test cases adapted for the token-based
// output mobile uses (the renderer maps tokens directly to RN nodes
// instead of going through ReactMarkdown).

import {
  tokenizeCitations,
  type CitationToken,
  type CitationSource,
} from "../lib/linkifyCitations";

const POOL: CitationSource[] = [
  { id: "n1", title: "Claude Code Use Cases" },
  { id: "n2", title: "Daily Stand-up Meeting" },
];

// Helpers — keep test bodies readable by extracting the kinds we
// commonly assert on.
function plainText(tokens: CitationToken[]): string {
  return tokens
    .map((t) => {
      if (t.kind === "text") return t.text;
      if (t.kind === "title") return t.text;
      return ` ${t.index}`;
    })
    .join("");
}

function titleHits(tokens: CitationToken[], title: string): number {
  return tokens.filter((t) => t.kind === "title" && t.text === title).length;
}

function markerForTitle(
  tokens: CitationToken[],
  title: string,
): CitationToken | undefined {
  return tokens.find(
    (t) =>
      t.kind === "marker" &&
      // Markers carry the title through the noteId lookup; compare via
      // the embedded title field.
      (t as { kind: "marker"; title: string }).title === title,
  );
}

describe("tokenizeCitations", () => {
  it("renders [Title] brackets as title + numeric marker tokens", () => {
    const tokens = tokenizeCitations(
      "See [Claude Code Use Cases] and also [Daily Stand-up Meeting].",
      undefined,
      POOL,
    );
    expect(titleHits(tokens, "Claude Code Use Cases")).toBe(1);
    expect(titleHits(tokens, "Daily Stand-up Meeting")).toBe(1);
    const m1 = markerForTitle(tokens, "Claude Code Use Cases");
    expect(m1?.kind).toBe("marker");
    if (m1?.kind === "marker") expect(m1.index).toBe(1);
    const m2 = markerForTitle(tokens, "Daily Stand-up Meeting");
    if (m2?.kind === "marker") expect(m2.index).toBe(2);
  });

  it("matches bare bold-wrapped titles (the /recent listicle case)", () => {
    const tokens = tokenizeCitations(
      "1. **Claude Code Use Cases** — An overview of AI.",
      undefined,
      POOL,
    );
    expect(titleHits(tokens, "Claude Code Use Cases")).toBe(1);
    expect(markerForTitle(tokens, "Claude Code Use Cases")?.kind).toBe(
      "marker",
    );
    // Plain text rendition still surfaces the title in line
    expect(plainText(tokens)).toContain("Claude Code Use Cases");
  });

  it("only emits a marker on the FIRST occurrence per title", () => {
    const tokens = tokenizeCitations(
      "Claude Code Use Cases is useful. I recommend Claude Code Use Cases daily.",
      undefined,
      POOL,
    );
    const markers = tokens.filter(
      (t) => t.kind === "marker" && t.title === "Claude Code Use Cases",
    );
    expect(markers).toHaveLength(1);
    // Both prose mentions still get a clickable title token
    expect(titleHits(tokens, "Claude Code Use Cases")).toBe(2);
  });

  it("numbers titles by first appearance regardless of bracket vs bare", () => {
    const tokens = tokenizeCitations(
      "**Daily Stand-up Meeting** covered sprint planning. See [Claude Code Use Cases].",
      undefined,
      POOL,
    );
    const m1 = markerForTitle(tokens, "Daily Stand-up Meeting");
    const m2 = markerForTitle(tokens, "Claude Code Use Cases");
    if (m1?.kind === "marker") expect(m1.index).toBe(1);
    if (m2?.kind === "marker") expect(m2.index).toBe(2);
  });

  it("matches longest title first when titles overlap", () => {
    const overlapping: CitationSource[] = [
      { id: "n1", title: "Meeting" },
      { id: "n2", title: "Daily Stand-up Meeting" },
    ];
    const tokens = tokenizeCitations(
      "Daily Stand-up Meeting happened yesterday.",
      undefined,
      overlapping,
    );
    expect(titleHits(tokens, "Daily Stand-up Meeting")).toBe(1);
    // No additional citation for the prefix "Meeting"
    expect(titleHits(tokens, "Meeting")).toBe(0);
  });

  it("strips brackets pointing to titles not in pool", () => {
    const tokens = tokenizeCitations(
      "See [Some Unrelated Note] and Claude Code Use Cases.",
      undefined,
      POOL,
    );
    // Unknown bracket disappears from the rendered text.
    expect(plainText(tokens)).not.toContain("Some Unrelated Note");
    // The bare match still fires.
    expect(titleHits(tokens, "Claude Code Use Cases")).toBe(1);
  });

  it("returns an empty token stream when pool is empty and only unknown brackets remain", () => {
    const tokens = tokenizeCitations("[Unknown Note]", undefined, []);
    expect(tokens).toEqual([]);
  });

  it("returns just plain text when pool is empty and prose has no citations", () => {
    const tokens = tokenizeCitations("Just some prose.", undefined, []);
    expect(tokens).toEqual([{ kind: "text", text: "Just some prose." }]);
  });

  it("enforces word boundaries so substring collisions don't match", () => {
    const subs: CitationSource[] = [{ id: "n1", title: "Meet" }];
    const tokens = tokenizeCitations("I have a Meeting scheduled.", undefined, subs);
    // "Meet" inside "Meeting" should NOT match.
    expect(titleHits(tokens, "Meet")).toBe(0);
    expect(plainText(tokens)).toBe("I have a Meeting scheduled.");
  });

  it("merges sources + noteCards without double-citing the same title", () => {
    const sources: CitationSource[] = [
      { id: "n1", title: "Claude Code Use Cases" },
    ];
    const noteCards: CitationSource[] = [
      { id: "n1", title: "Claude Code Use Cases" },
    ];
    const tokens = tokenizeCitations(
      "Claude Code Use Cases is useful.",
      sources,
      noteCards,
    );
    const markers = tokens.filter(
      (t) => t.kind === "marker" && t.title === "Claude Code Use Cases",
    );
    expect(markers).toHaveLength(1);
  });

  it("attaches the correct noteId to each title and marker token", () => {
    const tokens = tokenizeCitations(
      "[Claude Code Use Cases] and [Daily Stand-up Meeting].",
      undefined,
      POOL,
    );
    for (const t of tokens) {
      if (t.kind === "title") {
        if (t.text === "Claude Code Use Cases") expect(t.noteId).toBe("n1");
        if (t.text === "Daily Stand-up Meeting") expect(t.noteId).toBe("n2");
      }
      if (t.kind === "marker") {
        if (t.title === "Claude Code Use Cases") expect(t.noteId).toBe("n1");
        if (t.title === "Daily Stand-up Meeting") expect(t.noteId).toBe("n2");
      }
    }
  });
});
