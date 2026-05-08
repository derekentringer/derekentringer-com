import type { LinkPreview } from "@derekentringer/ns-shared";

// Phase E.4 — formatting helpers shared between the share-receiver
// overlay's "Save new" and "Append to" paths so a URL share renders
// with consistent markdown shape on every device after sync.

/**
 * Returns true when the string is a single, whitespace-free URL
 * starting with http:// or https://. Used to decide whether the
 * receiver should call /links/preview at all — multi-line text
 * that happens to contain a URL is treated as a regular text share.
 */
export function isLikelyUrl(s: string): boolean {
  const trimmed = s.trim();
  if (trimmed.length === 0) return false;
  if (/\s/.test(trimmed)) return false;
  return /^https?:\/\//i.test(trimmed);
}

export interface ClassifiedShare {
  /** Canonical URL extracted from the share, or `null` for pure-text shares. */
  url: string | null;
  /**
   * The user's content minus the URL — typically a quoted block of
   * highlighted text from the source page. Empty for URL-only shares.
   */
  bodyText: string;
}

/**
 * Classifies a share intent. Chrome on Android (and Safari on iOS)
 * frequently send *both* the user's selected text **and** the URL
 * in the same payload, e.g. `"<quote>"\nhttps://example.com/x`.
 * Treating that as URL-only would lose the user's content; treating
 * it as text-only would lose the URL we need for preview metadata.
 * This helper splits the payload into `{ url, bodyText }` so the
 * receiver can render both. Order of resolution:
 *
 *   1. If the entire `text` field is a URL, that's the URL.
 *   2. Otherwise, if `webUrl` is set, that's the URL — and any
 *      occurrence of it inside the text body is stripped so the
 *      same link doesn't appear twice in the saved note.
 *   3. Otherwise, find the first http(s) URL inside `text` and
 *      treat it as the canonical URL, stripping it from the body.
 *   4. If no URL is found anywhere, the share is text-only.
 */
export function classifySharedContent(
  text: string,
  webUrl: string,
): ClassifiedShare {
  const trimmedText = text.trim();

  if (isLikelyUrl(trimmedText)) {
    return { url: trimmedText, bodyText: "" };
  }
  if (trimmedText.length === 0 && webUrl && isLikelyUrl(webUrl)) {
    return { url: webUrl.trim(), bodyText: "" };
  }

  if (webUrl && isLikelyUrl(webUrl)) {
    const url = webUrl.trim();
    const stripped = trimmedText.replace(url, "").trim();
    return { url, bodyText: stripped };
  }

  const urlMatch = trimmedText.match(/https?:\/\/\S+/);
  if (urlMatch) {
    const url = urlMatch[0];
    const stripped = trimmedText.replace(url, "").trim();
    return { url, bodyText: stripped };
  }

  return { url: null, bodyText: trimmedText };
}

export interface BuildPreviewMarkdownOptions {
  /** The user's highlighted text, if any. Empty for URL-only shares. */
  bodyText: string;
  /** When false, render bare-bones (just bodyText + URL) — used after the
   *  user dismisses the metadata via the "Save URL only" chip. */
  enriched: boolean;
  /** True for "Save new" (top-level title heading welcome); false for
   *  "Append to" (the existing note already has its own heading). */
  includeTitleHeading: boolean;
}

/**
 * Renders a share as markdown body content. Composes the user's
 * highlighted text (if any) + the link preview's image / URL with
 * appropriate separators:
 *
 *   # {og:title}                  ← only on Save-new with enrichment
 *
 *   {bodyText}                    ← user's highlighted content
 *
 *   {og:description}              ← only when there's no bodyText
 *
 *   ![{og:title}]({imageUrl})
 *
 *   {url}
 *
 * `og:description` is intentionally suppressed when the user already
 * provided their own bodyText — the highlight IS the content, and
 * appending the page's marketing description would just duplicate it.
 */
export function formatLinkPreviewBody(
  preview: LinkPreview,
  opts: BuildPreviewMarkdownOptions,
): string {
  const parts: string[] = [];

  if (opts.enriched && opts.includeTitleHeading && preview.title) {
    parts.push(`# ${preview.title}`);
  }

  if (opts.bodyText) {
    parts.push(opts.bodyText);
  }

  if (opts.enriched) {
    if (!opts.bodyText && preview.description) {
      parts.push(preview.description);
    }
    if (preview.imageUrl) {
      const alt = preview.title ?? "preview";
      parts.push(`![${alt}](${preview.imageUrl})`);
    }
  }

  parts.push(preview.url);

  return parts.join("\n\n");
}

/**
 * Title for the new-note path. Prefer the og:title when enriched
 * (truncated to 80 chars), fall back to the first non-empty line of
 * the user's highlighted text, fall back to the URL itself. Mirrors
 * the truncation rule used by the existing receiver for plain-text
 * shares so the saved title length feels consistent across modes.
 */
export function deriveLinkPreviewTitle(
  preview: LinkPreview,
  bodyText: string,
  enriched: boolean,
): string {
  const truncate = (s: string) =>
    s.length > 80 ? `${s.slice(0, 80)}…` : s;

  if (enriched && preview.title) {
    return truncate(preview.title.trim());
  }
  if (bodyText) {
    const firstLine = bodyText
      .split("\n")
      .find((l) => l.trim().length > 0);
    if (firstLine) return truncate(firstLine.trim());
  }
  return preview.url;
}
