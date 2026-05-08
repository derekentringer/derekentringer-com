import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockUploadLinkPreviewImage,
  mockBuildLinkPreviewR2Key,
  mockDnsLookup,
} = vi.hoisted(() => ({
  mockUploadLinkPreviewImage: vi.fn(),
  mockBuildLinkPreviewR2Key: vi.fn(
    (hash: string, ext: string) => `link-previews/${hash}.${ext}`,
  ),
  mockDnsLookup: vi.fn(),
}));

vi.mock("../services/r2Service.js", () => ({
  buildLinkPreviewR2Key: mockBuildLinkPreviewR2Key,
  uploadLinkPreviewImage: mockUploadLinkPreviewImage,
}));

vi.mock("node:dns/promises", () => ({
  lookup: mockDnsLookup,
}));

import {
  assertSafeUrl,
  clearLinkPreviewCache,
  detectImageMagic,
  fetchLinkPreview,
  InvalidUrlError,
  isPrivateIPv4,
  isPrivateIPv6,
  parsePreviewFromHtml,
  SsrfBlockedError,
} from "../services/linksPreviewService.js";

beforeEach(() => {
  vi.clearAllMocks();
  clearLinkPreviewCache();
  // Default to a public IP so DNS-resolution doesn't block by default
  mockDnsLookup.mockResolvedValue({ address: "93.184.216.34", family: 4 });
  mockUploadLinkPreviewImage.mockResolvedValue(
    "https://notesync-images.derekentringer.com/link-previews/abc.png",
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isPrivateIPv4", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "10.255.255.255",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
  ])("blocks %s", (ip) => {
    expect(isPrivateIPv4(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1"])(
    "allows %s",
    (ip) => {
      expect(isPrivateIPv4(ip)).toBe(false);
    },
  );
});

describe("isPrivateIPv6", () => {
  it.each([
    "::1",
    "fe80::1",
    "fc00::1",
    "fd12:3456:7890::1",
    "::ffff:127.0.0.1",
  ])("blocks %s", (ip) => {
    expect(isPrivateIPv6(ip)).toBe(true);
  });

  it.each(["2001:4860:4860::8888", "::ffff:8.8.8.8"])(
    "allows %s",
    (ip) => {
      expect(isPrivateIPv6(ip)).toBe(false);
    },
  );
});

describe("assertSafeUrl", () => {
  it("rejects non-http schemes", async () => {
    await expect(assertSafeUrl("file:///etc/passwd")).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
    await expect(assertSafeUrl("ftp://example.com")).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
  });

  it("rejects malformed URLs", async () => {
    await expect(assertSafeUrl("not-a-url")).rejects.toBeInstanceOf(
      InvalidUrlError,
    );
  });

  it("rejects literal localhost", async () => {
    await expect(assertSafeUrl("http://localhost/foo")).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
    await expect(
      assertSafeUrl("http://api.localhost/foo"),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("rejects cloud metadata endpoints", async () => {
    await expect(
      assertSafeUrl("http://metadata.google.internal/foo"),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("rejects literal private IPv4 hosts", async () => {
    await expect(
      assertSafeUrl("http://127.0.0.1/foo"),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
    await expect(
      assertSafeUrl("http://192.168.1.1/foo"),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
    await expect(
      assertSafeUrl("http://169.254.169.254/latest/meta-data"),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("rejects literal private IPv6 hosts", async () => {
    await expect(assertSafeUrl("http://[::1]/foo")).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
  });

  it("rejects DNS-rebinding to private IPv4", async () => {
    mockDnsLookup.mockResolvedValueOnce({
      address: "127.0.0.1",
      family: 4,
    });
    await expect(
      assertSafeUrl("https://attacker.example/foo"),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("rejects DNS-rebinding to private IPv6", async () => {
    mockDnsLookup.mockResolvedValueOnce({ address: "::1", family: 6 });
    await expect(
      assertSafeUrl("https://attacker.example/foo"),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("rejects when DNS lookup itself fails", async () => {
    mockDnsLookup.mockRejectedValueOnce(new Error("ENOTFOUND"));
    await expect(
      assertSafeUrl("https://no-such-host.example/foo"),
    ).rejects.toBeInstanceOf(InvalidUrlError);
  });

  it("allows public hosts", async () => {
    const url = await assertSafeUrl("https://example.com/article");
    expect(url.toString()).toBe("https://example.com/article");
  });

  it("allows public literal IPv4 without DNS lookup", async () => {
    const url = await assertSafeUrl("https://1.1.1.1/foo");
    expect(url.hostname).toBe("1.1.1.1");
    expect(mockDnsLookup).not.toHaveBeenCalled();
  });
});

describe("parsePreviewFromHtml", () => {
  it("extracts title from <title> tag", () => {
    const out = parsePreviewFromHtml(
      "<html><head><title>  Hello World  </title></head></html>",
      "https://example.com/x",
    );
    expect(out.title).toBe("Hello World");
    expect(out.description).toBeNull();
    expect(out.ogImageUrl).toBeNull();
    expect(out.url).toBe("https://example.com/x");
  });

  it("prefers og:title over <title>", () => {
    const out = parsePreviewFromHtml(
      `<html><head>
        <title>Document title</title>
        <meta property="og:title" content="OG title" />
      </head></html>`,
      "https://example.com/x",
    );
    expect(out.title).toBe("OG title");
  });

  it("falls back from og to twitter to meta-description", () => {
    const out = parsePreviewFromHtml(
      `<html><head>
        <meta name="twitter:description" content="Twitter desc" />
        <meta name="description" content="Meta desc" />
      </head></html>`,
      "https://example.com/x",
    );
    expect(out.description).toBe("Twitter desc");
  });

  it("uses og:description when present", () => {
    const out = parsePreviewFromHtml(
      `<html><head>
        <meta property="og:description" content="OG desc" />
        <meta name="description" content="Meta desc" />
      </head></html>`,
      "https://example.com/x",
    );
    expect(out.description).toBe("OG desc");
  });

  it("resolves relative og:image against the final URL", () => {
    const out = parsePreviewFromHtml(
      `<html><head>
        <meta property="og:image" content="/img/hero.png" />
      </head></html>`,
      "https://example.com/articles/1",
    );
    expect(out.ogImageUrl).toBe("https://example.com/img/hero.png");
  });

  it("prefers og:image:secure_url over og:image", () => {
    const out = parsePreviewFromHtml(
      `<html><head>
        <meta property="og:image" content="http://insecure/x.png" />
        <meta property="og:image:secure_url" content="https://secure/x.png" />
      </head></html>`,
      "https://example.com/x",
    );
    expect(out.ogImageUrl).toBe("https://secure/x.png");
  });

  it("truncates very long titles and descriptions", () => {
    const longTitle = "a".repeat(500);
    const longDesc = "b".repeat(1000);
    const out = parsePreviewFromHtml(
      `<html><head>
        <title>${longTitle}</title>
        <meta name="description" content="${longDesc}" />
      </head></html>`,
      "https://example.com/x",
    );
    expect(out.title?.length).toBeLessThanOrEqual(200);
    expect(out.description?.length).toBeLessThanOrEqual(500);
    expect(out.title?.endsWith("…")).toBe(true);
  });

  it("returns nulls when no metadata is present", () => {
    const out = parsePreviewFromHtml(
      "<html><body>just body</body></html>",
      "https://example.com/x",
    );
    expect(out.title).toBeNull();
    expect(out.description).toBeNull();
    expect(out.ogImageUrl).toBeNull();
  });
});

describe("detectImageMagic", () => {
  it("recognizes JPEG", () => {
    const buf = Buffer.alloc(12);
    buf[0] = 0xff;
    buf[1] = 0xd8;
    buf[2] = 0xff;
    expect(detectImageMagic(buf)).toEqual({ ext: "jpg", mime: "image/jpeg" });
  });

  it("recognizes PNG", () => {
    const buf = Buffer.alloc(12);
    buf.set([0x89, 0x50, 0x4e, 0x47]);
    expect(detectImageMagic(buf)).toEqual({ ext: "png", mime: "image/png" });
  });

  it("recognizes WEBP", () => {
    const buf = Buffer.alloc(12);
    buf.write("RIFF", 0, "ascii");
    buf.write("WEBP", 8, "ascii");
    expect(detectImageMagic(buf)).toEqual({ ext: "webp", mime: "image/webp" });
  });

  it("recognizes GIF", () => {
    const buf = Buffer.from("GIF89a\0\0\0\0\0\0", "ascii");
    expect(detectImageMagic(buf)).toEqual({ ext: "gif", mime: "image/gif" });
  });

  it("rejects unknown formats", () => {
    expect(detectImageMagic(Buffer.from("\0\0\0\0\0\0\0\0\0\0\0\0"))).toBeNull();
  });

  it("rejects buffers shorter than the header", () => {
    expect(detectImageMagic(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});

describe("fetchLinkPreview", () => {
  function mockFetch(
    impl: (url: string) => Promise<{
      ok: boolean;
      url: string;
      contentType: string;
      body: Buffer;
    } | null>,
  ) {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      const result = await impl(url);
      if (!result) {
        return new Response(null, { status: 404 });
      }
      const res = new Response(new Uint8Array(result.body), {
        status: result.ok ? 200 : 500,
        headers: { "content-type": result.contentType },
      });
      // Response.url is "" by default for manually-constructed
      // Response objects (it's only set when returned from fetch).
      // Override so the service sees the post-redirect URL the
      // mock claims it visited.
      Object.defineProperty(res, "url", {
        value: result.url,
        configurable: true,
      });
      return res;
    });
  }

  it("returns parsed metadata + uploaded image for a normal page", async () => {
    mockFetch(async (url) => {
      if (url === "https://example.com/article") {
        return {
          ok: true,
          url,
          contentType: "text/html; charset=utf-8",
          body: Buffer.from(
            `<html><head>
              <title>The Article</title>
              <meta name="description" content="A summary." />
              <meta property="og:image" content="https://cdn.example.com/hero.png" />
            </head></html>`,
          ),
        };
      }
      if (url === "https://cdn.example.com/hero.png") {
        const png = Buffer.alloc(16);
        png.set([0x89, 0x50, 0x4e, 0x47]);
        return { ok: true, url, contentType: "image/png", body: png };
      }
      return null;
    });

    const out = await fetchLinkPreview("https://example.com/article");
    expect(out.title).toBe("The Article");
    expect(out.description).toBe("A summary.");
    expect(out.imageUrl).toBe(
      "https://notesync-images.derekentringer.com/link-previews/abc.png",
    );
    expect(mockUploadLinkPreviewImage).toHaveBeenCalledTimes(1);
  });

  it("returns nulls when the page is not HTML", async () => {
    mockFetch(async (url) => ({
      ok: true,
      url,
      contentType: "application/pdf",
      body: Buffer.from("%PDF-1.4"),
    }));
    const out = await fetchLinkPreview("https://example.com/file.pdf");
    expect(out).toEqual({
      url: "https://example.com/file.pdf",
      title: null,
      description: null,
      imageUrl: null,
    });
  });

  it("returns nulls when the upstream fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("boom"));
    const out = await fetchLinkPreview("https://example.com/dead");
    expect(out).toEqual({
      url: "https://example.com/dead",
      title: null,
      description: null,
      imageUrl: null,
    });
  });

  it("serves from cache on the second call for the same URL", async () => {
    let htmlCalls = 0;
    mockFetch(async (url) => {
      if (url === "https://example.com/x") {
        htmlCalls += 1;
        return {
          ok: true,
          url,
          contentType: "text/html",
          body: Buffer.from("<title>Hi</title>"),
        };
      }
      return null;
    });
    await fetchLinkPreview("https://example.com/x");
    await fetchLinkPreview("https://example.com/x");
    expect(htmlCalls).toBe(1);
  });

  it("propagates SSRF errors instead of swallowing them", async () => {
    mockDnsLookup.mockResolvedValueOnce({
      address: "127.0.0.1",
      family: 4,
    });
    await expect(
      fetchLinkPreview("https://attacker.example/foo"),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("falls back to null imageUrl when og:image points at a private IP", async () => {
    mockDnsLookup.mockImplementation(async (host: string) => {
      if (host === "internal.attacker.example") {
        return { address: "10.0.0.1", family: 4 };
      }
      return { address: "93.184.216.34", family: 4 };
    });
    mockFetch(async (url) => {
      if (url === "https://example.com/article") {
        return {
          ok: true,
          url,
          contentType: "text/html",
          body: Buffer.from(
            `<html><head>
              <title>Article</title>
              <meta property="og:image" content="https://internal.attacker.example/x.png" />
            </head></html>`,
          ),
        };
      }
      return null;
    });
    const out = await fetchLinkPreview("https://example.com/article");
    expect(out.title).toBe("Article");
    expect(out.imageUrl).toBeNull();
    expect(mockUploadLinkPreviewImage).not.toHaveBeenCalled();
  });

  it("falls back to null imageUrl when image bytes are not a known format", async () => {
    mockFetch(async (url) => {
      if (url === "https://example.com/x") {
        return {
          ok: true,
          url,
          contentType: "text/html",
          body: Buffer.from(
            `<html><head>
              <meta property="og:title" content="X" />
              <meta property="og:image" content="https://cdn.example.com/x.bmp" />
            </head></html>`,
          ),
        };
      }
      if (url === "https://cdn.example.com/x.bmp") {
        return {
          ok: true,
          url,
          contentType: "image/bmp",
          body: Buffer.from("BMnonsense\0\0\0\0\0\0"),
        };
      }
      return null;
    });
    const out = await fetchLinkPreview("https://example.com/x");
    expect(out.title).toBe("X");
    expect(out.imageUrl).toBeNull();
    expect(mockUploadLinkPreviewImage).not.toHaveBeenCalled();
  });
});
