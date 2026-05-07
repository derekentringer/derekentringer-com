import {
  resolveWikiLinks,
  parseWikiLinkUrl,
  parseBrokenWikiLinkUrl,
} from "../lib/resolveWikiLinks";

describe("resolveWikiLinks", () => {
  const map = new Map<string, string>([
    ["claude code use cases", "note-1"],
    ["design walkthrough - points redemption feature", "note-2"],
  ]);

  it("rewrites a resolved [[Title]] to a markdown link with #wiki: scheme", () => {
    const out = resolveWikiLinks("See [[Claude Code Use Cases]] for more.", map);
    expect(out).toBe("See [Claude Code Use Cases](#wiki:note-1) for more.");
  });

  it("is case-insensitive on title lookup", () => {
    const out = resolveWikiLinks("[[CLAUDE code USE cases]]", map);
    expect(out).toBe("[CLAUDE code USE cases](#wiki:note-1)");
  });

  it("preserves the alias from [[Title|alias]] for the link label", () => {
    const out = resolveWikiLinks("[[Claude Code Use Cases|the use cases doc]]", map);
    expect(out).toBe("[the use cases doc](#wiki:note-1)");
  });

  it("rewrites an unresolved [[…]] to a #wiki-broken: link", () => {
    const out = resolveWikiLinks("[[Unknown Note]] is missing.", map);
    expect(out).toBe("[Unknown Note](#wiki-broken:Unknown%20Note) is missing.");
  });

  it("uses the alias as the broken-link label and URL-encodes the title", () => {
    const out = resolveWikiLinks("[[Unknown Note|alias]]", map);
    expect(out).toBe("[alias](#wiki-broken:Unknown%20Note)");
  });

  it("rewrites multiple wiki-links in the same string", () => {
    const out = resolveWikiLinks(
      "- [[Claude Code Use Cases]]\n- [[Design Walkthrough - Points Redemption Feature]]",
      map,
    );
    expect(out).toBe(
      "- [Claude Code Use Cases](#wiki:note-1)\n- [Design Walkthrough - Points Redemption Feature](#wiki:note-2)",
    );
  });

  it("treats an empty map as all-broken", () => {
    const out = resolveWikiLinks("[[Anything]]", new Map());
    expect(out).toBe("[Anything](#wiki-broken:Anything)");
  });
});

describe("parseWikiLinkUrl", () => {
  it("returns the noteId for a #wiki:<id> url", () => {
    expect(parseWikiLinkUrl("#wiki:note-1")).toBe("note-1");
  });

  it("returns null for non-wiki urls", () => {
    expect(parseWikiLinkUrl("https://example.com")).toBeNull();
    expect(parseWikiLinkUrl("note-1")).toBeNull();
    expect(parseWikiLinkUrl("")).toBeNull();
  });

  it("returns null for #wiki: with no id", () => {
    expect(parseWikiLinkUrl("#wiki:")).toBeNull();
    expect(parseWikiLinkUrl("#wiki:   ")).toBeNull();
  });

  it("returns null for #wiki-broken: urls", () => {
    expect(parseWikiLinkUrl("#wiki-broken:Unknown")).toBeNull();
  });
});

describe("parseBrokenWikiLinkUrl", () => {
  it("returns the decoded title for a #wiki-broken: url", () => {
    expect(parseBrokenWikiLinkUrl("#wiki-broken:Unknown%20Note")).toBe(
      "Unknown Note",
    );
  });

  it("returns null for non-broken urls", () => {
    expect(parseBrokenWikiLinkUrl("#wiki:note-1")).toBeNull();
    expect(parseBrokenWikiLinkUrl("https://example.com")).toBeNull();
    expect(parseBrokenWikiLinkUrl("")).toBeNull();
  });

  it("returns null for #wiki-broken: with no title", () => {
    expect(parseBrokenWikiLinkUrl("#wiki-broken:")).toBeNull();
    expect(parseBrokenWikiLinkUrl("#wiki-broken:   ")).toBeNull();
  });
});
