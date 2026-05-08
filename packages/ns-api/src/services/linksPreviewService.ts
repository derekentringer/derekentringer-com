// `/links/preview` is the server-side companion to mobile/web/
// desktop "share a URL → save with a real preview" flows. Fetching
// arbitrary URLs from a server has two non-obvious risks:
//
//   1. SSRF — a malicious URL pointing at internal infrastructure
//      (cloud metadata endpoints, RFC1918 ranges, link-local).
//      Hostname-level blocks alone are not enough; an attacker
//      can register a public domain that resolves to 127.0.0.1.
//      We DNS-resolve every hostname and reject any private IP.
//
//   2. Resource exhaustion — pages with multi-MB bodies, image
//      hosts that stream forever, and slow connections that tie
//      up the worker. Hard caps on bytes + a 5s timeout keep
//      a runaway URL from blocking the event loop.
//
// All previews flow through an in-memory LRU. The cache is shared
// across users — link previews are not user-specific data, just
// metadata derived from a publicly-fetchable URL.

import * as cheerio from "cheerio";
import { LRUCache } from "lru-cache";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIPv4, isIPv6 } from "node:net";
import { createHash } from "node:crypto";
import {
  buildLinkPreviewR2Key,
  uploadLinkPreviewImage,
} from "./r2Service.js";

const FETCH_TIMEOUT_MS = 5_000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const CACHE_MAX = 256;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const USER_AGENT =
  "NoteSync-LinkPreview/1.0 (+https://ns.derekentringer.com)";

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
}

const cache = new LRUCache<string, LinkPreview>({
  max: CACHE_MAX,
  ttl: CACHE_TTL_MS,
});

export function clearLinkPreviewCache(): void {
  cache.clear();
}

export class InvalidUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidUrlError";
  }
}

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

// Inclusive int32 ranges. Numbers chosen to match the canonical
// blocked-CIDR list (loopback, RFC1918, link-local, CGNAT, "this
// network"). 169.254/16 includes the AWS/GCP metadata service.
const PRIVATE_IPV4_RANGES: Array<[number, number]> = [
  [ipv4ToInt("0.0.0.0"), ipv4ToInt("0.255.255.255")],
  [ipv4ToInt("10.0.0.0"), ipv4ToInt("10.255.255.255")],
  [ipv4ToInt("100.64.0.0"), ipv4ToInt("100.127.255.255")],
  [ipv4ToInt("127.0.0.0"), ipv4ToInt("127.255.255.255")],
  [ipv4ToInt("169.254.0.0"), ipv4ToInt("169.254.255.255")],
  [ipv4ToInt("172.16.0.0"), ipv4ToInt("172.31.255.255")],
  [ipv4ToInt("192.168.0.0"), ipv4ToInt("192.168.255.255")],
];

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return (
    ((parts[0] << 24) |
      (parts[1] << 16) |
      (parts[2] << 8) |
      parts[3]) >>>
    0
  );
}

export function isPrivateIPv4(ip: string): boolean {
  if (!isIPv4(ip)) return false;
  const n = ipv4ToInt(ip);
  for (const [start, end] of PRIVATE_IPV4_RANGES) {
    if (n >= start && n <= end) return true;
  }
  return false;
}

export function isPrivateIPv6(ip: string): boolean {
  if (!isIPv6(ip)) return false;
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  // fe80::/10 link-local
  if (/^fe[89ab]/.test(lower)) return true;
  // fc00::/7 unique-local
  if (/^f[cd]/.test(lower)) return true;
  // ::ffff:a.b.c.d — IPv4-mapped, defer to v4 check
  const v4Mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Mapped) return isPrivateIPv4(v4Mapped[1]);
  return false;
}

export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new InvalidUrlError("not a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SsrfBlockedError(
      `unsupported protocol ${parsed.protocol}`,
    );
  }
  // URL preserves brackets around IPv6 literals in `hostname`
  // (e.g. "[::1]"), but the `net` module wants the bare address.
  const hostname =
    parsed.hostname.startsWith("[") && parsed.hostname.endsWith("]")
      ? parsed.hostname.slice(1, -1)
      : parsed.hostname;
  if (
    hostname === "" ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost")
  ) {
    throw new SsrfBlockedError("localhost");
  }
  if (
    hostname === "metadata.google.internal" ||
    hostname === "metadata.aws.internal"
  ) {
    throw new SsrfBlockedError("cloud metadata endpoint");
  }
  if (isIPv4(hostname)) {
    if (isPrivateIPv4(hostname)) {
      throw new SsrfBlockedError(`private IPv4 ${hostname}`);
    }
    return parsed;
  }
  if (isIPv6(hostname)) {
    if (isPrivateIPv6(hostname)) {
      throw new SsrfBlockedError(`private IPv6 ${hostname}`);
    }
    return parsed;
  }
  // DNS-resolve and reject any private resolution. Without this,
  // an attacker can register a public domain that resolves to
  // 127.0.0.1 and bypass the literal-IP checks above.
  try {
    const { address, family } = await dnsLookup(hostname);
    if (family === 4 && isPrivateIPv4(address)) {
      throw new SsrfBlockedError(
        `${hostname} resolves to private IPv4 ${address}`,
      );
    }
    if (family === 6 && isPrivateIPv6(address)) {
      throw new SsrfBlockedError(
        `${hostname} resolves to private IPv6 ${address}`,
      );
    }
  } catch (err) {
    if (err instanceof SsrfBlockedError) throw err;
    throw new InvalidUrlError(`DNS lookup failed for ${hostname}`);
  }
  return parsed;
}

async function fetchWithLimit(
  url: string,
  maxBytes: number,
  acceptHeader: string,
): Promise<{
  buffer: Buffer;
  finalUrl: string;
  contentType: string;
} | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: acceptHeader,
      },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
    return {
      buffer: Buffer.concat(chunks.map((c) => Buffer.from(c))),
      finalUrl: res.url || url,
      contentType,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface ImageMagic {
  ext: "jpg" | "png" | "webp" | "gif";
  mime: string;
}

export function detectImageMagic(buffer: Buffer): ImageMagic | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: "jpg", mime: "image/jpeg" };
  }
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { ext: "png", mime: "image/png" };
  }
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { ext: "webp", mime: "image/webp" };
  }
  const gifHeader = buffer.toString("ascii", 0, 6);
  if (gifHeader === "GIF87a" || gifHeader === "GIF89a") {
    return { ext: "gif", mime: "image/gif" };
  }
  return null;
}

function pickFirstNonEmpty(...values: Array<string | undefined>): string | null {
  for (const v of values) {
    if (typeof v === "string") {
      const trimmed = v.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return null;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

function resolveOgImage(
  ogImage: string | null,
  baseUrl: string,
): string | null {
  if (!ogImage) return null;
  try {
    return new URL(ogImage, baseUrl).toString();
  } catch {
    return null;
  }
}

function urlHash(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 32);
}

async function persistImage(
  imageUrl: string,
): Promise<string | null> {
  let safeImageUrl: URL;
  try {
    safeImageUrl = await assertSafeUrl(imageUrl);
  } catch {
    return null;
  }
  const fetched = await fetchWithLimit(
    safeImageUrl.toString(),
    MAX_IMAGE_BYTES,
    "image/*",
  );
  if (!fetched) return null;
  const magic = detectImageMagic(fetched.buffer);
  if (!magic) return null;
  const r2Key = buildLinkPreviewR2Key(urlHash(imageUrl), magic.ext);
  try {
    return await uploadLinkPreviewImage(
      fetched.buffer,
      r2Key,
      magic.mime,
    );
  } catch {
    return null;
  }
}

export function parsePreviewFromHtml(
  html: string,
  finalUrl: string,
): Omit<LinkPreview, "imageUrl"> & { ogImageUrl: string | null } {
  const $ = cheerio.load(html);
  const ogTitle = $('meta[property="og:title"]').attr("content");
  const twitterTitle = $('meta[name="twitter:title"]').attr("content");
  const docTitle = $("title").first().text();
  const title = pickFirstNonEmpty(ogTitle, twitterTitle, docTitle);

  const ogDesc = $('meta[property="og:description"]').attr("content");
  const twitterDesc = $('meta[name="twitter:description"]').attr("content");
  const metaDesc = $('meta[name="description"]').attr("content");
  const description = pickFirstNonEmpty(ogDesc, twitterDesc, metaDesc);

  const ogImage =
    $('meta[property="og:image:secure_url"]').attr("content") ||
    $('meta[property="og:image:url"]').attr("content") ||
    $('meta[property="og:image"]').attr("content") ||
    $('meta[name="twitter:image"]').attr("content");
  const ogImageUrl = resolveOgImage(ogImage ?? null, finalUrl);

  return {
    url: finalUrl,
    title: title ? truncate(title, 200) : null,
    description: description ? truncate(description, 500) : null,
    ogImageUrl,
  };
}

export interface FetchPreviewOptions {
  /** Skip cache for this request. Used by tests. */
  bypassCache?: boolean;
}

export async function fetchLinkPreview(
  rawUrl: string,
  opts: FetchPreviewOptions = {},
): Promise<LinkPreview> {
  const safeUrl = await assertSafeUrl(rawUrl);
  const cacheKey = safeUrl.toString();
  if (!opts.bypassCache) {
    const hit = cache.get(cacheKey);
    if (hit) return hit;
  }

  const fetched = await fetchWithLimit(
    safeUrl.toString(),
    MAX_HTML_BYTES,
    "text/html,application/xhtml+xml",
  );
  if (!fetched) {
    const empty: LinkPreview = {
      url: safeUrl.toString(),
      title: null,
      description: null,
      imageUrl: null,
    };
    cache.set(cacheKey, empty);
    return empty;
  }
  const ct = fetched.contentType.toLowerCase();
  if (
    !ct.includes("text/html") &&
    !ct.includes("application/xhtml")
  ) {
    const empty: LinkPreview = {
      url: fetched.finalUrl,
      title: null,
      description: null,
      imageUrl: null,
    };
    cache.set(cacheKey, empty);
    return empty;
  }

  const html = fetched.buffer.toString("utf-8");
  const parsed = parsePreviewFromHtml(html, fetched.finalUrl);
  const imageUrl = parsed.ogImageUrl
    ? await persistImage(parsed.ogImageUrl)
    : null;

  const preview: LinkPreview = {
    url: parsed.url,
    title: parsed.title,
    description: parsed.description,
    imageUrl,
  };
  cache.set(cacheKey, preview);
  return preview;
}
