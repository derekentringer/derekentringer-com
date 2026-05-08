import { describe, it, expect } from "vitest";
import {
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

describe("formatLinkPreviewBody", () => {
  const preview = {
    url: "https://example.com/article",
    title: "Article Title",
    description: "An article description.",
    imageUrl: "https://cdn.example.com/hero.png",
  };

  it("renders bold title (default), description, image, URL when not heading-style", () => {
    expect(
      formatLinkPreviewBody(preview, { includeTitleHeading: false }),
    ).toBe(
      "**Article Title**\n\nAn article description.\n\n![Article Title](https://cdn.example.com/hero.png)\n\nhttps://example.com/article",
    );
  });

  it("renders heading-style title when requested", () => {
    expect(
      formatLinkPreviewBody(preview, { includeTitleHeading: true }),
    ).toBe(
      "# Article Title\n\nAn article description.\n\n![Article Title](https://cdn.example.com/hero.png)\n\nhttps://example.com/article",
    );
  });

  it("skips missing title", () => {
    expect(
      formatLinkPreviewBody(
        { ...preview, title: null },
        { includeTitleHeading: false },
      ),
    ).toBe(
      "An article description.\n\n![preview](https://cdn.example.com/hero.png)\n\nhttps://example.com/article",
    );
  });

  it("skips missing description", () => {
    expect(
      formatLinkPreviewBody(
        { ...preview, description: null },
        { includeTitleHeading: false },
      ),
    ).toBe(
      "**Article Title**\n\n![Article Title](https://cdn.example.com/hero.png)\n\nhttps://example.com/article",
    );
  });

  it("skips missing image", () => {
    expect(
      formatLinkPreviewBody(
        { ...preview, imageUrl: null },
        { includeTitleHeading: false },
      ),
    ).toBe(
      "**Article Title**\n\nAn article description.\n\nhttps://example.com/article",
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
        { includeTitleHeading: false },
      ),
    ).toBe("https://example.com/x");
  });
});
