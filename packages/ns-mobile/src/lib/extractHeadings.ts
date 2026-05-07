// Mobile port of `packages/ns-web/src/lib/extractHeadings.ts`.
//
// Returns a flat ordered list of headings present in raw markdown,
// skipping fenced code blocks and frontmatter regions. The cleaned
// `text` is what shows in the ToC; it's also what the renderer
// uses as a Map key to record each heading's Y position on layout
// (see markdownRules.ts heading rules + `TocCaptureContext`).
//
// Web also produces a `slug` via github-slugger for jump-to-anchor
// HTML linking. Mobile doesn't need slugs — we scroll to a Y
// offset captured at render time — so we drop the dependency.
//
// Edge cases:
//   - Headings inside ``` fenced code blocks are not real headings.
//   - YAML frontmatter (--- … --- at the very top) is stripped
//     before this runs (callers should pass content already
//     post-`stripFrontmatter`), but as defense-in-depth we also
//     skip a leading frontmatter block here.
//   - Setext-style headings (=== / ---) are not supported by
//     web/desktop preview either; we keep parity by ignoring them.

export interface MobileHeading {
  /** 1–6 corresponding to H1–H6. */
  level: number;
  /** Cleaned heading text — used as ToC label and Y-position key. */
  text: string;
}

const HEADING_RE = /^(#{1,6})\s+(.+)$/;
const FENCE_RE = /^```/;

export function extractHeadings(markdown: string): MobileHeading[] {
  if (!markdown) return [];

  const headings: MobileHeading[] = [];
  const lines = markdown.split("\n");
  let inCodeBlock = false;
  let i = 0;

  // Defensive frontmatter skip — callers should already strip,
  // but handle the case where they don't (e.g. tests).
  if (lines[0] === "---") {
    let j = 1;
    while (j < lines.length && lines[j] !== "---") j++;
    if (j < lines.length) i = j + 1;
  }

  for (; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE_RE.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = line.match(HEADING_RE);
    if (!match) continue;

    headings.push({
      level: match[1].length,
      text: cleanHeadingText(match[2].trim()),
    });
  }

  return headings;
}

/**
 * Strip inline markdown (bold/italic/code/links/images/strike)
 * from a heading's raw text so the ToC label reads naturally and
 * matches what the renderer's heading rule will derive from
 * `node.children[0].content`. Identical regex set to web.
 */
export function cleanHeadingText(raw: string): string {
  return raw
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/\*\*(.+?)\*\*/g, "$1") // bold **
    .replace(/__(.+?)__/g, "$1") // bold __
    .replace(/\*(.+?)\*/g, "$1") // italic *
    .replace(/_(.+?)_/g, "$1") // italic _
    .replace(/~~(.+?)~~/g, "$1"); // strikethrough
}
