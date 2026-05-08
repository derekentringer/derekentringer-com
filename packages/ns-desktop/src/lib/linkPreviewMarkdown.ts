import type { LinkPreview } from "@derekentringer/shared/ns";

// Phase E.4 — markdown formatting helpers for the editor
// auto-paste-URL flow. Mirrors the equivalent helpers in
// `ns-mobile/src/lib/linkPreviewMarkdown.ts` (kept duplicated for
// now rather than promoted to ns-shared, since the package layouts
// differ). If the format ever drifts between platforms, hoist the
// shared bits to ns-shared.

/**
 * True when the string is a single, whitespace-free URL starting
 * with http:// or https://. Used to decide whether a pasted blob
 * should trigger preview fetching at all — multi-line clipboard
 * content that happens to contain a URL is left alone.
 */
export function isLikelyUrl(s: string): boolean {
  const trimmed = s.trim();
  if (trimmed.length === 0) return false;
  if (/\s/.test(trimmed)) return false;
  return /^https?:\/\//i.test(trimmed);
}

export interface BuildPreviewMarkdownOptions {
  /** Bold-title style for inline paste; the editor target rarely
   *  wants a top-level `# heading` slammed into the middle of an
   *  existing note. Set true only when pasting into an empty doc. */
  includeTitleHeading: boolean;
}

/**
 * Renders a `LinkPreview` as inline markdown for paste-replacement
 * inside the editor. Output shape (with all fields present):
 *
 *   # {title}                 ← only when includeTitleHeading
 *   **{title}**               ← otherwise, bold one-liner
 *
 *   {description}
 *
 *   ![{title}]({imageUrl})
 *
 *   {url}
 *
 * Missing metadata fields skip cleanly. URL is always emitted on
 * its own line so renderers auto-link it. When *every* metadata
 * field is null, returns the bare URL (graceful fallback).
 */
export function formatLinkPreviewBody(
  preview: LinkPreview,
  opts: BuildPreviewMarkdownOptions,
): string {
  const parts: string[] = [];
  if (preview.title) {
    parts.push(
      opts.includeTitleHeading
        ? `# ${preview.title}`
        : `**${preview.title}**`,
    );
  }
  if (preview.description) parts.push(preview.description);
  if (preview.imageUrl) {
    const alt = preview.title ?? "preview";
    parts.push(`![${alt}](${preview.imageUrl})`);
  }
  parts.push(preview.url);
  return parts.join("\n\n");
}

/**
 * Build the same markdown shape but degrade to just the bare URL
 * when the user has dismissed the metadata. Mirrors the mobile
 * "Save URL only" chip — used by the web paste-replacement flow
 * to compute the *replacement* string after the user clicks
 * "Show URL only" on the inline notification.
 */
export function bareUrlFallback(url: string): string {
  return url;
}
