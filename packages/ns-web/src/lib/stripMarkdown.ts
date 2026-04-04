/**
 * Strip markdown syntax from text for preview snippets.
 * Returns plain text with markdown formatting removed.
 */
export function stripMarkdown(text: string, maxLength = 80): string {
  let result = text
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
