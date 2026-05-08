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

/**
 * Picks the URL out of a share intent. iOS share-from-Safari sets
 * `webUrl` directly; Android typically only sets `text` to the URL
 * itself. If neither looks like a URL, returns null and the receiver
 * falls back to the existing text-share flow.
 */
export function detectSharedUrl(
  text: string,
  webUrl: string,
): string | null {
  if (webUrl && isLikelyUrl(webUrl)) return webUrl.trim();
  if (text && isLikelyUrl(text)) return text.trim();
  return null;
}

/**
 * Renders a `LinkPreview` as markdown body content. Heading / body
 * paragraph / image / URL line are joined with double newlines so
 * each block stands on its own:
 *
 *   # {title}
 *
 *   {description}
 *
 *   ![{title}]({imageUrl})
 *
 *   {url}
 *
 * Missing fields are skipped. The URL is emitted on its own line so
 * web/desktop renderers auto-link it. Pass `enriched: false` (e.g.
 * after the user dismisses the metadata) to render just the bare
 * URL — the same shape we'd save if the preview fetch failed.
 */
export function formatLinkPreviewBody(
  preview: LinkPreview,
  enriched: boolean,
): string {
  if (!enriched) return preview.url;
  const parts: string[] = [];
  if (preview.title) parts.push(`# ${preview.title}`);
  if (preview.description) parts.push(preview.description);
  if (preview.imageUrl) {
    const alt = preview.title ?? "preview";
    parts.push(`![${alt}](${preview.imageUrl})`);
  }
  parts.push(preview.url);
  return parts.join("\n\n");
}

/**
 * Title for the new-note path. Prefer the og:title (truncated to
 * the same 80-char limit the existing receiver applies), fall back
 * to the URL if no title was extracted.
 */
export function deriveLinkPreviewTitle(
  preview: LinkPreview,
  enriched: boolean,
): string {
  if (!enriched || !preview.title) return preview.url;
  const trimmed = preview.title.trim();
  return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
}
