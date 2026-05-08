import {
  classifySharedContent,
  deriveLinkPreviewTitle,
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

describe("classifySharedContent", () => {
  it("treats a pure URL text as URL-only with empty body", () => {
    expect(
      classifySharedContent("https://example.com/x", ""),
    ).toEqual({ url: "https://example.com/x", bodyText: "" });
  });

  it("uses webUrl when text is empty", () => {
    expect(classifySharedContent("", "https://example.com/x")).toEqual({
      url: "https://example.com/x",
      bodyText: "",
    });
  });

  it("preserves bodyText and uses webUrl when both are present", () => {
    expect(
      classifySharedContent(
        "\"highlighted quote\"\n\nhttps://example.com/x",
        "https://example.com/x",
      ),
    ).toEqual({
      url: "https://example.com/x",
      bodyText: '"highlighted quote"',
    });
  });

  it("strips the canonical webUrl from the bodyText", () => {
    expect(
      classifySharedContent(
        "Look at this: https://example.com/x — interesting",
        "https://example.com/x",
      ),
    ).toEqual({
      url: "https://example.com/x",
      bodyText: "Look at this:  — interesting",
    });
  });

  it("extracts a URL from text when webUrl is empty", () => {
    expect(
      classifySharedContent(
        '"a quote"\nhttps://example.com/article',
        "",
      ),
    ).toEqual({
      url: "https://example.com/article",
      bodyText: '"a quote"',
    });
  });

  it("returns text as bodyText when no URL is anywhere", () => {
    expect(classifySharedContent("just a quote", "")).toEqual({
      url: null,
      bodyText: "just a quote",
    });
  });

  it("returns empty when both inputs are empty", () => {
    expect(classifySharedContent("", "")).toEqual({
      url: null,
      bodyText: "",
    });
  });
});

describe("formatLinkPreviewBody", () => {
  const preview = {
    url: "https://example.com/article",
    title: "The Great Article",
    description: "A summary.",
    imageUrl: "https://cdn.example.com/hero.png",
  };

  it("renders title heading + image + url for URL-only Save-new", () => {
    expect(
      formatLinkPreviewBody(preview, {
        bodyText: "",
        enriched: true,
        includeTitleHeading: true,
      }),
    ).toBe(
      "# The Great Article\n\nA summary.\n\n![The Great Article](https://cdn.example.com/hero.png)\n\nhttps://example.com/article",
    );
  });

  it("includes user bodyText and skips og:description (avoid duplication)", () => {
    expect(
      formatLinkPreviewBody(preview, {
        bodyText: '"highlighted quote"',
        enriched: true,
        includeTitleHeading: true,
      }),
    ).toBe(
      '# The Great Article\n\n"highlighted quote"\n\n![The Great Article](https://cdn.example.com/hero.png)\n\nhttps://example.com/article',
    );
  });

  it("omits the title heading on Append-to (existing note already has one)", () => {
    expect(
      formatLinkPreviewBody(preview, {
        bodyText: '"highlighted quote"',
        enriched: true,
        includeTitleHeading: false,
      }),
    ).toBe(
      '"highlighted quote"\n\n![The Great Article](https://cdn.example.com/hero.png)\n\nhttps://example.com/article',
    );
  });

  it("returns bodyText + URL when not enriched and bodyText is present", () => {
    expect(
      formatLinkPreviewBody(preview, {
        bodyText: '"highlighted quote"',
        enriched: false,
        includeTitleHeading: true,
      }),
    ).toBe('"highlighted quote"\n\nhttps://example.com/article');
  });

  it("returns bare URL when not enriched and no bodyText", () => {
    expect(
      formatLinkPreviewBody(preview, {
        bodyText: "",
        enriched: false,
        includeTitleHeading: true,
      }),
    ).toBe("https://example.com/article");
  });

  it("skips missing image", () => {
    expect(
      formatLinkPreviewBody(
        { ...preview, imageUrl: null },
        { bodyText: "body text", enriched: true, includeTitleHeading: true },
      ),
    ).toBe(
      "# The Great Article\n\nbody text\n\nhttps://example.com/article",
    );
  });

  it("skips missing title heading even when includeTitleHeading is true", () => {
    expect(
      formatLinkPreviewBody(
        { ...preview, title: null },
        {
          bodyText: '"quote"',
          enriched: true,
          includeTitleHeading: true,
        },
      ),
    ).toBe(
      '"quote"\n\n![preview](https://cdn.example.com/hero.png)\n\nhttps://example.com/article',
    );
  });

  it("uses og:description only when there's no bodyText to act as content", () => {
    const out = formatLinkPreviewBody(preview, {
      bodyText: "",
      enriched: true,
      includeTitleHeading: true,
    });
    expect(out).toContain("A summary.");
  });

  it("collapses to bodyText when every preview field is null", () => {
    expect(
      formatLinkPreviewBody(
        {
          url: "https://example.com/x",
          title: null,
          description: null,
          imageUrl: null,
        },
        {
          bodyText: '"my highlight"',
          enriched: true,
          includeTitleHeading: true,
        },
      ),
    ).toBe('"my highlight"\n\nhttps://example.com/x');
  });
});

describe("deriveLinkPreviewTitle", () => {
  const preview = {
    url: "https://example.com/x",
    title: "Page Title",
    description: null,
    imageUrl: null,
  };

  it("uses preview title when enriched and title present", () => {
    expect(deriveLinkPreviewTitle(preview, "", true)).toBe("Page Title");
  });

  it("truncates titles longer than 80 chars with an ellipsis", () => {
    const long = "a".repeat(100);
    const out = deriveLinkPreviewTitle(
      { ...preview, title: long },
      "",
      true,
    );
    expect(out.length).toBeLessThanOrEqual(81);
    expect(out.endsWith("…")).toBe(true);
  });

  it("falls back to first line of bodyText when not enriched", () => {
    expect(
      deriveLinkPreviewTitle(
        preview,
        "first line\nsecond line",
        false,
      ),
    ).toBe("first line");
  });

  it("falls back to first line of bodyText when title is null", () => {
    expect(
      deriveLinkPreviewTitle(
        { ...preview, title: null },
        '"a highlighted quote"',
        true,
      ),
    ).toBe('"a highlighted quote"');
  });

  it("falls back to URL when neither title nor bodyText is present", () => {
    expect(
      deriveLinkPreviewTitle({ ...preview, title: null }, "", true),
    ).toBe("https://example.com/x");
  });
});
