import {
  deriveLinkPreviewTitle,
  detectSharedUrl,
  formatLinkPreviewBody,
  isLikelyUrl,
} from "../lib/linkPreviewMarkdown";

describe("isLikelyUrl", () => {
  it.each([
    ["https://example.com", true],
    ["http://example.com/path?x=1", true],
    ["HTTPS://EXAMPLE.COM", true],
    ["  https://example.com  ", true],
    ["https://example.com with text", false],
    ["check this https://example.com", false],
    ["multi\nline", false],
    ["ftp://example.com", false],
    ["just text", false],
    ["", false],
    ["   ", false],
  ])("isLikelyUrl(%s) → %s", (input, expected) => {
    expect(isLikelyUrl(input)).toBe(expected);
  });
});

describe("detectSharedUrl", () => {
  it("prefers webUrl when set", () => {
    expect(
      detectSharedUrl("Cool article", "https://example.com/x"),
    ).toBe("https://example.com/x");
  });

  it("falls back to text when text is a single URL", () => {
    expect(detectSharedUrl("https://example.com/y", "")).toBe(
      "https://example.com/y",
    );
  });

  it("returns null when neither is a URL", () => {
    expect(detectSharedUrl("just a quote", "")).toBeNull();
  });

  it("returns null when webUrl is set but not a URL", () => {
    expect(detectSharedUrl("https://valid.example", "not-a-url")).toBe(
      "https://valid.example",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(detectSharedUrl("  https://example.com  ", "")).toBe(
      "https://example.com",
    );
  });
});

describe("formatLinkPreviewBody", () => {
  const fullPreview = {
    url: "https://example.com/article",
    title: "The Great Article",
    description: "A summary of the article.",
    imageUrl: "https://cdn.example.com/hero.png",
  };

  it("renders all fields when enriched", () => {
    expect(formatLinkPreviewBody(fullPreview, true)).toBe(
      "# The Great Article\n\nA summary of the article.\n\n![The Great Article](https://cdn.example.com/hero.png)\n\nhttps://example.com/article",
    );
  });

  it("returns the bare URL when not enriched", () => {
    expect(formatLinkPreviewBody(fullPreview, false)).toBe(
      "https://example.com/article",
    );
  });

  it("skips missing title", () => {
    expect(
      formatLinkPreviewBody(
        {
          ...fullPreview,
          title: null,
        },
        true,
      ),
    ).toBe(
      "A summary of the article.\n\n![preview](https://cdn.example.com/hero.png)\n\nhttps://example.com/article",
    );
  });

  it("skips missing description", () => {
    expect(
      formatLinkPreviewBody(
        {
          ...fullPreview,
          description: null,
        },
        true,
      ),
    ).toBe(
      "# The Great Article\n\n![The Great Article](https://cdn.example.com/hero.png)\n\nhttps://example.com/article",
    );
  });

  it("skips missing image", () => {
    expect(
      formatLinkPreviewBody(
        {
          ...fullPreview,
          imageUrl: null,
        },
        true,
      ),
    ).toBe(
      "# The Great Article\n\nA summary of the article.\n\nhttps://example.com/article",
    );
  });

  it("returns just the URL when every metadata field is null", () => {
    expect(
      formatLinkPreviewBody(
        {
          url: "https://example.com/x",
          title: null,
          description: null,
          imageUrl: null,
        },
        true,
      ),
    ).toBe("https://example.com/x");
  });
});

describe("deriveLinkPreviewTitle", () => {
  it("uses preview title when enriched and title present", () => {
    expect(
      deriveLinkPreviewTitle(
        {
          url: "https://example.com/x",
          title: "Article Title",
          description: null,
          imageUrl: null,
        },
        true,
      ),
    ).toBe("Article Title");
  });

  it("truncates titles longer than 80 chars with an ellipsis", () => {
    const long = "a".repeat(100);
    const out = deriveLinkPreviewTitle(
      { url: "x", title: long, description: null, imageUrl: null },
      true,
    );
    expect(out.length).toBeLessThanOrEqual(81);
    expect(out.endsWith("…")).toBe(true);
  });

  it("falls back to URL when not enriched", () => {
    expect(
      deriveLinkPreviewTitle(
        {
          url: "https://example.com/x",
          title: "Title",
          description: null,
          imageUrl: null,
        },
        false,
      ),
    ).toBe("https://example.com/x");
  });

  it("falls back to URL when title is null", () => {
    expect(
      deriveLinkPreviewTitle(
        {
          url: "https://example.com/x",
          title: null,
          description: null,
          imageUrl: null,
        },
        true,
      ),
    ).toBe("https://example.com/x");
  });
});
