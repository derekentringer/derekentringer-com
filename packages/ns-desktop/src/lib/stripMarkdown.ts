/**
 * Strip YAML frontmatter off the top of a note body before building a
 * preview snippet. Handles two shapes:
 *
 *   1. Fenced: `---\n<keys>\n---\n<body>`
 *   2. Bare: one or more leading `key: value` lines followed by a blank
 *      line, then the body. (Imported notes and some AI-generated notes
 *      emit this shape without fences.)
 *
 * Only strips a block of *consecutive* `key: value` lines starting at
 * line 0 to avoid accidentally eating a paragraph like `URL: https://…`
 * in the middle of normal prose.
 */
export function stripFrontmatter(text: string): string {
  // Fenced form.
  const fenced = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fenced) {
    return text.slice(fenced[0].length);
  }
  // Bare key: value form at the top of the document.
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length && /^[a-zA-Z_][a-zA-Z0-9_-]*:\s/.test(lines[i])) {
    i++;
  }
  if (i === 0) return text;
  // Skip a single trailing blank separator line if present.
  if (lines[i] === "") i++;
  return lines.slice(i).join("\n");
}

/**
 * Strip markdown syntax from text for preview snippets.
 * Returns plain text with markdown formatting removed.
 */
export function stripMarkdown(text: string, maxLength = 80): string {
  let result = stripFrontmatter(text)
    // Remove headings
    .replace(/^#{1,6}\s+/gm, "")
    // Remove images
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Remove links, keep text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Remove wiki-links
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    // Remove bold/italic markers
    .replace(/(\*{1,3}|_{1,3})(.*?)\1/g, "$2")
    // Remove strikethrough
    .replace(/~~(.*?)~~/g, "$1")
    // Remove inline code
    .replace(/`([^`]*)`/g, "$1")
    // Remove code block fences
    .replace(/^```[\s\S]*?```$/gm, "")
    .replace(/^```.*$/gm, "")
    // Remove blockquotes
    .replace(/^>\s?/gm, "")
    // Remove horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, "")
    // Remove list markers
    .replace(/^[\s]*[-*+]\s/gm, "")
    .replace(/^[\s]*\d+\.\s/gm, "")
    // Remove checkbox markers
    .replace(/\[[ x]\]\s?/gi, "")
    // Collapse whitespace
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (result.length > maxLength) {
    result = result.slice(0, maxLength).trimEnd() + "…";
  }

  return result;
}
