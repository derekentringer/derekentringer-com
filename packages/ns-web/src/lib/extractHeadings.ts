import GithubSlugger from "github-slugger";

export interface Heading {
  level: number;
  text: string;
  slug: string;
}

/**
 * Extract headings from raw markdown, skipping fenced code blocks.
 * Uses GithubSlugger to generate slugs matching rehype-slug output.
 */
export function extractHeadings(markdown: string): Heading[] {
  if (!markdown) return [];

  const slugger = new GithubSlugger();
  const headings: Heading[] = [];
  const lines = markdown.split("\n");
  let inCodeBlock = false;

  for (const line of lines) {
    if (/^```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (!match) continue;

    const level = match[1].length;
    const raw = match[2].trim();

    // Strip inline formatting: bold, italic, code, links, images
    const text = raw
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")  // links
      .replace(/`([^`]+)`/g, "$1")               // inline code
      .replace(/\*\*(.+?)\*\*/g, "$1")           // bold
      .replace(/__(.+?)__/g, "$1")                // bold alt
      .replace(/\*(.+?)\*/g, "$1")               // italic
      .replace(/_(.+?)_/g, "$1")                  // italic alt
      .replace(/~~(.+?)~~/g, "$1");               // strikethrough

    headings.push({ level, text, slug: slugger.slug(text) });
  }

  return headings;
}
